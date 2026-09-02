const { run } = require('./db');

const CHANNELS = {
  sms: 'sms',
  whatsapp: 'whatsapp',
};

function interpolate(template, payload) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => payload[key] ?? '');
}

async function dispatchMessage({
  recipientType,
  recipientId,
  recipientName,
  recipientPhone,
  channel,
  templateKey,
  templateBody,
  payload,
  metadata,
}) {
  const body = interpolate(templateBody, payload || {});
  const status = 'simulated_sent';

  await run(
    `INSERT INTO message_logs
    (recipient_type, recipient_id, recipient_name, recipient_phone, channel, template_key, message_body, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipientType,
      recipientId || null,
      recipientName || null,
      recipientPhone || null,
      channel,
      templateKey || null,
      body,
      status,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );

  await run(
    `INSERT INTO audit_logs (entity_type, entity_id, action, details)
     VALUES (?, ?, ?, ?)`,
    [
      'message',
      recipientId || null,
      'message_dispatch',
      JSON.stringify({ channel, templateKey, recipientType, status }),
    ]
  );

  return { status, body };
}

module.exports = {
  CHANNELS,
  interpolate,
  dispatchMessage,
};
