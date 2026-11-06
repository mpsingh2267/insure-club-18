const dayjs = require('dayjs');
const cron = require('node-cron');
const { all, get, run } = require('./db');
const { dispatchMessage } = require('./messaging');

async function getTemplate(templateKey, channel) {
  return get(
    'SELECT * FROM message_templates WHERE template_key = ? AND channel = ?',
    [templateKey, channel]
  );
}

async function sendRenewalReminders(referenceDate = dayjs()) {
  const date = referenceDate.startOf('day');
  const policies = await all(
    `SELECT p.*, c.full_name, c.phone
     FROM policies p
     JOIN customers c ON c.id = p.customer_id
     WHERE p.status NOT IN ('renewed', 'expired', 'cancelled')`
  );

  let sentCount = 0;

  for (const policy of policies) {
    const dueDate = dayjs(policy.renewal_due_date);
    if (!dueDate.isValid()) {
      continue;
    }
    const diff = dueDate.startOf('day').diff(date, 'day');

    if (![15, 7, 2].includes(diff)) {
      continue;
    }

    for (const channel of ['sms', 'whatsapp']) {
      const existing = await get(
        `SELECT id FROM reminder_logs
         WHERE policy_id = ? AND reminder_type = ? AND channel = ? AND scheduled_for = ?`,
        [policy.id, `renewal_${diff}`, channel, date.format('YYYY-MM-DD')]
      );

      if (existing) {
        continue;
      }

      const template = await getTemplate('renewal', channel);
      if (!template) {
        continue;
      }

      const message = await dispatchMessage({
        recipientType: 'customer',
        recipientId: policy.customer_id,
        recipientName: policy.full_name,
        recipientPhone: policy.phone,
        channel,
        templateKey: 'renewal',
        templateBody: template.body,
        payload: {
          name: policy.full_name,
          policy_number: policy.policy_number,
          days_left: String(diff),
        },
        metadata: { policyId: policy.id, reminderType: `renewal_${diff}` },
      });

      await run(
        `INSERT INTO reminder_logs
        (policy_id, reminder_type, channel, scheduled_for, sent_at, status, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          policy.id,
          `renewal_${diff}`,
          channel,
          date.format('YYYY-MM-DD'),
          dayjs().format('YYYY-MM-DD HH:mm:ss'),
          message.status,
          JSON.stringify({ policyNumber: policy.policy_number, daysLeft: diff }),
        ]
      );

      await run(
        `INSERT INTO audit_logs (entity_type, entity_id, action, details)
        VALUES (?, ?, ?, ?)`,
        ['policy', policy.id, 'renewal_reminder_sent', JSON.stringify({ channel, diff })]
      );

      sentCount += 1;
    }
  }

  return sentCount;
}

async function sendOccasionMessages(referenceDate = dayjs()) {
  const date = referenceDate.format('MM-DD');

  const customers = await all(
    `SELECT * FROM customers
     WHERE substr(date_of_birth, 6, 5) = ? OR substr(anniversary_date, 6, 5) = ?`,
    [date, date]
  );

  let sentCount = 0;

  for (const customer of customers) {
    const tasks = [];
    if (customer.date_of_birth && customer.date_of_birth.slice(5) === date) {
      tasks.push('birthday');
    }
    if (customer.anniversary_date && customer.anniversary_date.slice(5) === date) {
      tasks.push('anniversary');
    }

    for (const templateKey of tasks) {
      for (const channel of ['sms', 'whatsapp']) {
        const template = await getTemplate(templateKey, channel);
        if (!template) {
          continue;
        }

        await dispatchMessage({
          recipientType: 'customer',
          recipientId: customer.id,
          recipientName: customer.full_name,
          recipientPhone: customer.phone,
          channel,
          templateKey,
          templateBody: template.body,
          payload: { name: customer.full_name },
          metadata: { occasion: templateKey },
        });

        sentCount += 1;
      }
    }
  }

  return sentCount;
}

async function runDailyAutomation() {
  const renewalMessages = await sendRenewalReminders();
  const occasionMessages = await sendOccasionMessages();
  return {
    renewalMessages,
    occasionMessages,
  };
}

function startScheduler() {
  cron.schedule('0 8 * * *', async () => {
    try {
      await runDailyAutomation();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Automation scheduler failed:', error.message);
    }
  });
}

module.exports = {
  sendRenewalReminders,
  sendOccasionMessages,
  runDailyAutomation,
  startScheduler,
};
