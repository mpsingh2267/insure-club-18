const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const dayjs = require('dayjs');

const { initDb, all, get, run } = require('./db');
const { hashPassword, verifyPassword, requireAuth } = require('./auth');
const { parseCsv, toCsv } = require('./csv');
const { dispatchMessage } = require('./messaging');
const { runDailyAutomation, startScheduler } = require('./automation');

const app = express();
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const policyUpload = multer({ dest: uploadDir });
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadDir));
app.set('trust proxy', 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'insure-club-18-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

function makeCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

function matchesToken(expectedToken, receivedToken) {
  if (!expectedToken || !receivedToken) {
    return false;
  }
  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(receivedToken);
  if (expected.length !== received.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, received);
}

app.use((req, _res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = makeCsrfToken();
  }
  next();
});

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const providedToken = req.query._csrf || req.body?._csrf || req.headers['x-csrf-token'];
  if (!matchesToken(req.session.csrfToken, providedToken)) {
    res.status(403).send('Invalid CSRF token');
    return;
  }
  next();
});

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.loggedIn = Boolean(req.session && req.session.userId);
  res.locals.userName = req.session?.userName || null;
  res.locals.today = dayjs().format('YYYY-MM-DD');
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeDate(value) {
  return value || null;
}

function normalizeStatus(value, fallback) {
  return value ? value.trim().toLowerCase() : fallback;
}

async function addAudit(entityType, entityId, action, details) {
  await run(
    'INSERT INTO audit_logs (entity_type, entity_id, action, details) VALUES (?, ?, ?, ?)',
    [entityType, entityId || null, action, details ? JSON.stringify(details) : null]
  );
}

async function getTemplate(templateKey, channel) {
  return get('SELECT * FROM message_templates WHERE template_key = ? AND channel = ?', [templateKey, channel]);
}

async function sendTemplateMessage({ recipientType, recipientId, recipientName, recipientPhone, templateKey }) {
  for (const channel of ['sms', 'whatsapp']) {
    const template = await getTemplate(templateKey, channel);
    if (!template) {
      continue;
    }
    await dispatchMessage({
      recipientType,
      recipientId,
      recipientName,
      recipientPhone,
      channel,
      templateKey,
      templateBody: template.body,
      payload: {
        name: recipientName,
      },
      metadata: { recipientType },
    });
  }
}

app.get('/login', (req, res) => {
  if (req.session.userId) {
    res.redirect('/');
    return;
  }
  res.render('login', { error: null });
});

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
});

const importRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/login', loginRateLimiter, async (req, res) => {
  const { username, password } = req.body;
  const user = await get('SELECT * FROM users WHERE username = ?', [username]);

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).render('login', { error: 'Invalid username or password.' });
    return;
  }

  req.session.userId = user.id;
  req.session.userName = user.username;
  res.redirect('/');
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/', requireAuth, async (req, res) => {
  const [upcomingRenewals, birthdays, anniversaries, followUps, meetings, activityLogs, messageLogs] = await Promise.all([
    all(
      `SELECT p.*, c.full_name
       FROM policies p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.status IN ('active', 'renewed')
       ORDER BY p.renewal_due_date ASC
       LIMIT 8`
    ),
    all(
      `SELECT id, full_name, date_of_birth
       FROM customers
       WHERE date_of_birth IS NOT NULL
       ORDER BY substr(date_of_birth, 6, 5) ASC
       LIMIT 8`
    ),
    all(
      `SELECT id, full_name, anniversary_date
       FROM customers
       WHERE anniversary_date IS NOT NULL
       ORDER BY substr(anniversary_date, 6, 5) ASC
       LIMIT 8`
    ),
    all(
      `SELECT id, full_name, status, follow_up_date, attempts
       FROM prospects
       WHERE follow_up_date IS NOT NULL
       ORDER BY follow_up_date ASC
       LIMIT 8`
    ),
    all(
      `SELECT m.*, c.full_name as customer_name, p.full_name as prospect_name
       FROM meetings m
       LEFT JOIN customers c ON c.id = m.customer_id
       LEFT JOIN prospects p ON p.id = m.prospect_id
       ORDER BY m.meeting_date ASC, m.meeting_time ASC
       LIMIT 10`
    ),
    all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10'),
    all('SELECT * FROM message_logs ORDER BY sent_at DESC LIMIT 10'),
  ]);

  res.render('dashboard', {
    upcomingRenewals,
    birthdays,
    anniversaries,
    followUps,
    meetings,
    activityLogs,
    messageLogs,
  });
});

app.get('/customers', requireAuth, async (req, res) => {
  const { q = '', sort = 'full_name' } = req.query;
  const search = `%${q.trim()}%`;
  const validSort = ['full_name', 'created_at', 'date_of_birth', 'anniversary_date'].includes(sort) ? sort : 'full_name';
  const customers = await all(
    `SELECT c.*, COUNT(p.id) as policy_count
     FROM customers c
     LEFT JOIN policies p ON p.customer_id = c.id
     WHERE c.full_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?
     GROUP BY c.id
     ORDER BY ${validSort} ASC`,
    [search, search, search]
  );

  res.render('customers', { customers, q, sort: validSort });
});

app.get('/customers/new', requireAuth, (req, res) => {
  res.render('customer-form', {
    customer: null,
    familyMembers: [],
    customerPolicies: [],
    action: '/customers',
    error: null,
  });
});

app.post('/customers', requireAuth, async (req, res) => {
  const { full_name, phone, email, address, date_of_birth, anniversary_date, notes } = req.body;

  const result = await run(
    `INSERT INTO customers (full_name, phone, email, address, date_of_birth, anniversary_date, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [full_name, phone, email, address, safeDate(date_of_birth), safeDate(anniversary_date), notes]
  );

  await addAudit('customer', result.lastID, 'customer_created', { full_name, phone, email });
  res.redirect(`/customers/${result.lastID}/edit`);
});

app.get('/customers/:id/edit', requireAuth, async (req, res) => {
  const customer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!customer) {
    res.status(404).send('Customer not found');
    return;
  }

  const [familyMembers, customerPolicies] = await Promise.all([
    all('SELECT * FROM family_members WHERE customer_id = ? ORDER BY id ASC', [req.params.id]),
    all('SELECT id, policy_number, policy_type FROM policies WHERE customer_id = ? ORDER BY id DESC', [req.params.id]),
  ]);

  res.render('customer-form', {
    customer,
    familyMembers,
    customerPolicies,
    action: `/customers/${req.params.id}`,
    error: null,
  });
});

app.post('/customers/:id', requireAuth, async (req, res) => {
  const { full_name, phone, email, address, date_of_birth, anniversary_date, notes } = req.body;

  await run(
    `UPDATE customers
     SET full_name = ?, phone = ?, email = ?, address = ?, date_of_birth = ?, anniversary_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [full_name, phone, email, address, safeDate(date_of_birth), safeDate(anniversary_date), notes, req.params.id]
  );

  await addAudit('customer', Number(req.params.id), 'customer_updated', { full_name, phone, email });
  res.redirect('/customers');
});

app.post('/customers/:id/delete', requireAuth, async (req, res) => {
  await run('DELETE FROM customers WHERE id = ?', [req.params.id]);
  await addAudit('customer', Number(req.params.id), 'customer_deleted');
  res.redirect('/customers');
});

app.post('/customers/:id/family', requireAuth, async (req, res) => {
  const { name, relationship, date_of_birth, anniversary_date, policy_id } = req.body;
  const count = await get('SELECT COUNT(*) as count FROM family_members WHERE customer_id = ?', [req.params.id]);
  if (count.count >= 5) {
    const customer = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    const [familyMembers, customerPolicies] = await Promise.all([
      all('SELECT * FROM family_members WHERE customer_id = ? ORDER BY id ASC', [req.params.id]),
      all('SELECT id, policy_number, policy_type FROM policies WHERE customer_id = ? ORDER BY id DESC', [req.params.id]),
    ]);

    res.status(400).render('customer-form', {
      customer,
      familyMembers,
      customerPolicies,
      action: `/customers/${req.params.id}`,
      error: 'Only up to 5 family members are allowed per customer.',
    });
    return;
  }

  const result = await run(
    `INSERT INTO family_members (customer_id, policy_id, name, relationship, date_of_birth, anniversary_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.params.id, policy_id || null, name, relationship, safeDate(date_of_birth), safeDate(anniversary_date)]
  );

  await addAudit('family_member', result.lastID, 'family_member_added', { customer_id: Number(req.params.id), name });
  res.redirect(`/customers/${req.params.id}/edit`);
});

app.post('/family-members/:id/delete', requireAuth, async (req, res) => {
  const member = await get('SELECT * FROM family_members WHERE id = ?', [req.params.id]);
  await run('DELETE FROM family_members WHERE id = ?', [req.params.id]);
  await addAudit('family_member', Number(req.params.id), 'family_member_deleted', { customer_id: member?.customer_id });
  res.redirect(`/customers/${member?.customer_id || ''}/edit`);
});

app.get('/customers/export.csv', requireAuth, async (req, res) => {
  const customers = await all('SELECT * FROM customers ORDER BY full_name ASC');
  const csv = toCsv(customers, [
    'id',
    'full_name',
    'phone',
    'email',
    'address',
    'date_of_birth',
    'anniversary_date',
    'notes',
    'created_at',
    'updated_at',
  ]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  res.send(csv);
});

app.get('/policies', requireAuth, async (req, res) => {
  const { status = '', policy_type = '', q = '' } = req.query;
  const search = `%${q.trim()}%`;

  const policies = await all(
    `SELECT p.*, c.full_name
     FROM policies p
     JOIN customers c ON c.id = p.customer_id
     WHERE (? = '' OR p.status = ?)
       AND (? = '' OR p.policy_type = ?)
       AND (p.policy_number LIKE ? OR c.full_name LIKE ? OR p.insurer_name LIKE ?)
     ORDER BY p.renewal_due_date ASC`,
    [status, status, policy_type, policy_type, search, search, search]
  );

  res.render('policies', { policies, status, policy_type, q });
});

app.get('/policies/new', requireAuth, async (req, res) => {
  const customers = await all('SELECT id, full_name FROM customers ORDER BY full_name ASC');
  res.render('policy-form', {
    policy: null,
    customers,
    action: '/policies',
    error: null,
  });
});

app.post('/policies', requireAuth, policyUpload.single('attachment'), async (req, res) => {
  const {
    customer_id,
    policy_type,
    policy_number,
    insurer_name,
    start_date,
    renewal_due_date,
    premium_amount,
    status,
  } = req.body;

  const attachmentPath = req.file ? `/uploads/${req.file.filename}` : null;

  const result = await run(
    `INSERT INTO policies (customer_id, policy_type, policy_number, insurer_name, start_date, renewal_due_date, premium_amount, status, attachment_path, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      customer_id,
      policy_type,
      policy_number,
      insurer_name,
      safeDate(start_date),
      renewal_due_date,
      toNumber(premium_amount),
      normalizeStatus(status, 'active'),
      attachmentPath,
    ]
  );

  await addAudit('policy', result.lastID, 'policy_created', {
    customer_id: Number(customer_id),
    policy_number,
    attachmentPath,
  });

  if (attachmentPath) {
    await addAudit('policy', result.lastID, 'policy_upload', { attachmentPath });
  }

  res.redirect('/policies');
});

app.get('/policies/:id/edit', requireAuth, async (req, res) => {
  const policy = await get('SELECT * FROM policies WHERE id = ?', [req.params.id]);
  if (!policy) {
    res.status(404).send('Policy not found');
    return;
  }

  const customers = await all('SELECT id, full_name FROM customers ORDER BY full_name ASC');

  res.render('policy-form', {
    policy,
    customers,
    action: `/policies/${req.params.id}`,
    error: null,
  });
});

app.post('/policies/:id', requireAuth, policyUpload.single('attachment'), async (req, res) => {
  const existing = await get('SELECT * FROM policies WHERE id = ?', [req.params.id]);
  if (!existing) {
    res.status(404).send('Policy not found');
    return;
  }

  const {
    customer_id,
    policy_type,
    policy_number,
    insurer_name,
    start_date,
    renewal_due_date,
    premium_amount,
    status,
  } = req.body;

  const nextStatus = normalizeStatus(status, existing.status);
  const attachmentPath = req.file ? `/uploads/${req.file.filename}` : existing.attachment_path;

  await run(
    `UPDATE policies
     SET customer_id = ?, policy_type = ?, policy_number = ?, insurer_name = ?, start_date = ?, renewal_due_date = ?, premium_amount = ?, status = ?, attachment_path = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      customer_id,
      policy_type,
      policy_number,
      insurer_name,
      safeDate(start_date),
      renewal_due_date,
      toNumber(premium_amount),
      nextStatus,
      attachmentPath,
      req.params.id,
    ]
  );

  if (existing.status !== nextStatus) {
    await addAudit('policy', Number(req.params.id), 'policy_status_changed', {
      from: existing.status,
      to: nextStatus,
    });
  }

  if (req.file) {
    await addAudit('policy', Number(req.params.id), 'policy_upload', { attachmentPath });
  }

  await addAudit('policy', Number(req.params.id), 'policy_updated', { policy_number, nextStatus });

  res.redirect('/policies');
});

app.post('/policies/:id/delete', requireAuth, async (req, res) => {
  await run('DELETE FROM policies WHERE id = ?', [req.params.id]);
  await addAudit('policy', Number(req.params.id), 'policy_deleted');
  res.redirect('/policies');
});

app.post('/policies/:id/renew', requireAuth, async (req, res) => {
  const policy = await get('SELECT * FROM policies WHERE id = ?', [req.params.id]);
  if (!policy) {
    res.status(404).send('Policy not found');
    return;
  }

  await run('UPDATE policies SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['renewed', req.params.id]);
  await addAudit('policy', Number(req.params.id), 'policy_status_changed', { from: policy.status, to: 'renewed' });
  res.redirect('/policies');
});

app.get('/prospects', requireAuth, async (req, res) => {
  const { q = '', status = '' } = req.query;
  const search = `%${q.trim()}%`;

  const prospects = await all(
    `SELECT *
     FROM prospects
     WHERE (? = '' OR status = ?)
       AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)
     ORDER BY updated_at DESC`,
    [status, status, search, search, search]
  );

  res.render('prospects', { prospects, q, status });
});

app.get('/prospects/new', requireAuth, (req, res) => {
  res.render('prospect-form', {
    prospect: null,
    action: '/prospects',
  });
});

app.post('/prospects', requireAuth, async (req, res) => {
  const {
    full_name,
    phone,
    email,
    status,
    pipeline_stage,
    attempts,
    follow_up_date,
    notes,
  } = req.body;

  const result = await run(
    `INSERT INTO prospects (full_name, phone, email, status, pipeline_stage, attempts, follow_up_date, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      full_name,
      phone,
      email,
      normalizeStatus(status, 'calling updates'),
      pipeline_stage || 'new',
      toNumber(attempts),
      safeDate(follow_up_date),
      notes,
    ]
  );

  await addAudit('prospect', result.lastID, 'prospect_created', { full_name, status });
  res.redirect('/prospects');
});

app.get('/prospects/:id/edit', requireAuth, async (req, res) => {
  const prospect = await get('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
  if (!prospect) {
    res.status(404).send('Prospect not found');
    return;
  }

  res.render('prospect-form', {
    prospect,
    action: `/prospects/${req.params.id}`,
  });
});

app.post('/prospects/:id', requireAuth, async (req, res) => {
  const existing = await get('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
  if (!existing) {
    res.status(404).send('Prospect not found');
    return;
  }

  const {
    full_name,
    phone,
    email,
    status,
    pipeline_stage,
    attempts,
    follow_up_date,
    notes,
  } = req.body;

  const nextStatus = normalizeStatus(status, existing.status);

  await run(
    `UPDATE prospects
     SET full_name = ?, phone = ?, email = ?, status = ?, pipeline_stage = ?, attempts = ?, follow_up_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      full_name,
      phone,
      email,
      nextStatus,
      pipeline_stage || existing.pipeline_stage,
      toNumber(attempts),
      safeDate(follow_up_date),
      notes,
      req.params.id,
    ]
  );

  if (existing.status !== nextStatus) {
    await addAudit('prospect', Number(req.params.id), 'prospect_status_changed', {
      from: existing.status,
      to: nextStatus,
    });
  }

  await addAudit('prospect', Number(req.params.id), 'prospect_updated', {
    full_name,
    pipeline_stage,
    follow_up_date,
  });

  res.redirect('/prospects');
});

app.post('/prospects/:id/delete', requireAuth, async (req, res) => {
  await run('DELETE FROM prospects WHERE id = ?', [req.params.id]);
  await addAudit('prospect', Number(req.params.id), 'prospect_deleted');
  res.redirect('/prospects');
});

app.post('/prospects/:id/send-service-message', requireAuth, async (req, res) => {
  const prospect = await get('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
  if (!prospect) {
    res.status(404).send('Prospect not found');
    return;
  }

  const customBody = req.body.message_body || `Hello ${prospect.full_name}, we are here to support your insurance planning needs.`;

  for (const channel of ['sms', 'whatsapp']) {
    await dispatchMessage({
      recipientType: 'prospect',
      recipientId: prospect.id,
      recipientName: prospect.full_name,
      recipientPhone: prospect.phone,
      channel,
      templateKey: 'service_follow_up',
      templateBody: customBody,
      payload: { name: prospect.full_name },
      metadata: { purpose: 'pipeline_service_touchpoint' },
    });
  }

  await addAudit('prospect', prospect.id, 'service_message_sent', { channels: ['sms', 'whatsapp'] });
  res.redirect('/prospects');
});

app.post('/prospects/import', requireAuth, importRateLimiter, csvUpload.single('csv_file'), async (req, res) => {
  if (!req.file) {
    res.status(400).send('CSV file is required');
    return;
  }

  const content = req.file.buffer.toString('utf8');
  const records = parseCsv(content);
  let imported = 0;

  for (const row of records) {
    if (!row.full_name) {
      continue;
    }

    await run(
      `INSERT INTO prospects (full_name, phone, email, status, pipeline_stage, attempts, follow_up_date, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        row.full_name,
        row.phone || null,
        row.email || null,
        normalizeStatus(row.status, 'calling updates'),
        row.pipeline_stage || 'imported',
        toNumber(row.attempts),
        row.follow_up_date || null,
        row.notes || null,
      ]
    );
    imported += 1;
  }

  await addAudit('prospect', null, 'prospect_import', { imported });
  res.redirect('/prospects');
});

app.get('/prospects/export.csv', requireAuth, async (req, res) => {
  const prospects = await all('SELECT * FROM prospects ORDER BY full_name ASC');
  const csv = toCsv(prospects, [
    'id',
    'full_name',
    'phone',
    'email',
    'status',
    'pipeline_stage',
    'attempts',
    'follow_up_date',
    'notes',
    'created_at',
    'updated_at',
  ]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="prospects.csv"');
  res.send(csv);
});

app.get('/meetings', requireAuth, async (req, res) => {
  const meetings = await all(
    `SELECT m.*, c.full_name as customer_name, p.full_name as prospect_name
     FROM meetings m
     LEFT JOIN customers c ON c.id = m.customer_id
     LEFT JOIN prospects p ON p.id = m.prospect_id
     ORDER BY m.meeting_date ASC, m.meeting_time ASC`
  );

  res.render('meetings', { meetings });
});

app.get('/meetings/new', requireAuth, async (req, res) => {
  const [customers, prospects] = await Promise.all([
    all('SELECT id, full_name FROM customers ORDER BY full_name ASC'),
    all('SELECT id, full_name FROM prospects ORDER BY full_name ASC'),
  ]);

  res.render('meeting-form', {
    meeting: null,
    customers,
    prospects,
    action: '/meetings',
  });
});

app.post('/meetings', requireAuth, async (req, res) => {
  const {
    customer_id,
    prospect_id,
    title,
    meeting_date,
    meeting_time,
    meeting_status,
    location,
    notes,
  } = req.body;

  const result = await run(
    `INSERT INTO meetings (customer_id, prospect_id, title, meeting_date, meeting_time, meeting_status, location, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      customer_id || null,
      prospect_id || null,
      title,
      meeting_date,
      meeting_time || null,
      meeting_status || 'scheduled',
      location || null,
      notes || null,
    ]
  );

  await addAudit('meeting', result.lastID, 'meeting_created', { title, meeting_date, meeting_status });
  res.redirect('/meetings');
});

app.get('/meetings/:id/edit', requireAuth, async (req, res) => {
  const meeting = await get('SELECT * FROM meetings WHERE id = ?', [req.params.id]);
  if (!meeting) {
    res.status(404).send('Meeting not found');
    return;
  }

  const [customers, prospects] = await Promise.all([
    all('SELECT id, full_name FROM customers ORDER BY full_name ASC'),
    all('SELECT id, full_name FROM prospects ORDER BY full_name ASC'),
  ]);

  res.render('meeting-form', {
    meeting,
    customers,
    prospects,
    action: `/meetings/${req.params.id}`,
  });
});

app.post('/meetings/:id', requireAuth, async (req, res) => {
  const existing = await get('SELECT * FROM meetings WHERE id = ?', [req.params.id]);
  if (!existing) {
    res.status(404).send('Meeting not found');
    return;
  }

  const {
    customer_id,
    prospect_id,
    title,
    meeting_date,
    meeting_time,
    meeting_status,
    location,
    notes,
  } = req.body;

  await run(
    `UPDATE meetings
     SET customer_id = ?, prospect_id = ?, title = ?, meeting_date = ?, meeting_time = ?, meeting_status = ?, location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      customer_id || null,
      prospect_id || null,
      title,
      meeting_date,
      meeting_time || null,
      meeting_status || 'scheduled',
      location || null,
      notes || null,
      req.params.id,
    ]
  );

  if (existing.meeting_status !== meeting_status) {
    await addAudit('meeting', Number(req.params.id), 'meeting_status_changed', {
      from: existing.meeting_status,
      to: meeting_status,
    });
  }

  await addAudit('meeting', Number(req.params.id), 'meeting_updated', { title, meeting_date, meeting_status });
  res.redirect('/meetings');
});

app.post('/meetings/:id/delete', requireAuth, async (req, res) => {
  await run('DELETE FROM meetings WHERE id = ?', [req.params.id]);
  await addAudit('meeting', Number(req.params.id), 'meeting_deleted');
  res.redirect('/meetings');
});

app.get('/calendar', requireAuth, async (req, res) => {
  const meetings = await all(
    `SELECT m.*, c.full_name as customer_name, p.full_name as prospect_name
     FROM meetings m
     LEFT JOIN customers c ON c.id = m.customer_id
     LEFT JOIN prospects p ON p.id = m.prospect_id
     ORDER BY m.meeting_date ASC, m.meeting_time ASC`
  );

  const now = dayjs().format('YYYY-MM-DD');
  const upcoming = meetings.filter((m) => m.meeting_date >= now);
  const past = meetings.filter((m) => m.meeting_date < now);

  res.render('calendar', { upcoming, past });
});

app.get('/api/calendar-events', requireAuth, async (req, res) => {
  const meetings = await all(
    `SELECT m.*, c.full_name as customer_name, p.full_name as prospect_name
     FROM meetings m
     LEFT JOIN customers c ON c.id = m.customer_id
     LEFT JOIN prospects p ON p.id = m.prospect_id
     ORDER BY m.meeting_date ASC, m.meeting_time ASC`
  );

  const events = meetings.map((m) => ({
    title: `${m.title} (${m.customer_name || m.prospect_name || 'Unlinked'})`,
    start: m.meeting_time ? `${m.meeting_date}T${m.meeting_time}` : m.meeting_date,
    allDay: !m.meeting_time,
    color: m.meeting_status === 'completed' ? '#198754' : '#0d6efd',
  }));

  res.json(events);
});

app.get('/templates', requireAuth, async (req, res) => {
  const templates = await all('SELECT * FROM message_templates ORDER BY template_key, channel');
  res.render('templates', { templates });
});

app.post('/templates', requireAuth, async (req, res) => {
  const { template_key, channel, body } = req.body;
  await run(
    `INSERT INTO message_templates (template_key, channel, body)
     VALUES (?, ?, ?)
     ON CONFLICT(template_key, channel)
     DO UPDATE SET body = excluded.body`,
    [template_key, channel, body]
  );

  await addAudit('template', null, 'template_saved', { template_key, channel });
  res.redirect('/templates');
});

app.post('/messages/send-occasion/:customerId/:templateKey', requireAuth, async (req, res) => {
  const customer = await get('SELECT * FROM customers WHERE id = ?', [req.params.customerId]);
  if (!customer) {
    res.status(404).send('Customer not found');
    return;
  }

  await sendTemplateMessage({
    recipientType: 'customer',
    recipientId: customer.id,
    recipientName: customer.full_name,
    recipientPhone: customer.phone,
    templateKey: req.params.templateKey,
  });

  res.redirect('/customers');
});

app.post('/messages/festival', requireAuth, async (req, res) => {
  const { audience = 'all' } = req.body;

  let customers = [];
  let prospects = [];

  if (audience === 'customers' || audience === 'all') {
    customers = await all('SELECT id, full_name, phone FROM customers');
  }
  if (audience === 'prospects' || audience === 'all') {
    prospects = await all('SELECT id, full_name, phone FROM prospects');
  }

  let sent = 0;

  for (const customer of customers) {
    await sendTemplateMessage({
      recipientType: 'customer',
      recipientId: customer.id,
      recipientName: customer.full_name,
      recipientPhone: customer.phone,
      templateKey: 'festival',
    });
    sent += 2;
  }

  for (const prospect of prospects) {
    await sendTemplateMessage({
      recipientType: 'prospect',
      recipientId: prospect.id,
      recipientName: prospect.full_name,
      recipientPhone: prospect.phone,
      templateKey: 'festival',
    });
    sent += 2;
  }

  await addAudit('broadcast', null, 'festival_broadcast_sent', { audience, sent });
  res.redirect('/templates');
});

app.post('/automation/run-now', requireAuth, async (req, res) => {
  const result = await runDailyAutomation();
  await addAudit('automation', null, 'manual_run', result);
  res.redirect('/');
});

app.get('/activities', requireAuth, async (req, res) => {
  const [auditLogs, reminderLogs, messageLogs] = await Promise.all([
    all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200'),
    all(
      `SELECT r.*, p.policy_number
       FROM reminder_logs r
       JOIN policies p ON p.id = r.policy_id
       ORDER BY r.scheduled_for DESC, r.id DESC
       LIMIT 200`
    ),
    all('SELECT * FROM message_logs ORDER BY sent_at DESC LIMIT 200'),
  ]);

  res.render('activities', { auditLogs, reminderLogs, messageLogs });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'Insure Club 18' });
});

app.use((error, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).send('Something went wrong.');
});

async function start() {
  await initDb(hashPassword);
  startScheduler();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Insure Club 18 running at http://localhost:${port}`);
  });
}

module.exports = {
  app,
  start,
};
