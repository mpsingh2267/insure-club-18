const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'data', 'insure-club-18.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function initDb(hashPassword) {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      date_of_birth TEXT,
      anniversary_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      policy_type TEXT NOT NULL,
      policy_number TEXT NOT NULL,
      insurer_name TEXT NOT NULL,
      start_date TEXT,
      renewal_due_date TEXT NOT NULL,
      premium_amount REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      attachment_path TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      policy_id INTEGER,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      date_of_birth TEXT,
      anniversary_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(policy_id) REFERENCES policies(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'calling updates',
      pipeline_stage TEXT NOT NULL DEFAULT 'new',
      attempts INTEGER NOT NULL DEFAULT 0,
      follow_up_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      prospect_id INTEGER,
      title TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      meeting_time TEXT,
      meeting_status TEXT NOT NULL DEFAULT 'scheduled',
      location TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY(prospect_id) REFERENCES prospects(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(template_key, channel)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_type TEXT NOT NULL,
      recipient_id INTEGER,
      recipient_name TEXT,
      recipient_phone TEXT,
      channel TEXT NOT NULL,
      template_key TEXT,
      message_body TEXT NOT NULL,
      status TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reminder_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id INTEGER NOT NULL,
      reminder_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      sent_at TEXT,
      status TEXT NOT NULL,
      metadata TEXT,
      UNIQUE(policy_id, reminder_type, channel, scheduled_for),
      FOREIGN KEY(policy_id) REFERENCES policies(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const user = await get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!user) {
    await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', hashPassword('admin123')]);
  }

  const templateCount = await get('SELECT COUNT(*) as count FROM message_templates');
  if (!templateCount || templateCount.count === 0) {
    const defaults = [
      ['birthday', 'sms', 'Happy Birthday {{name}}! Wishing you health and happiness. - Insure Club 18'],
      ['birthday', 'whatsapp', '🎉 Happy Birthday {{name}}! Thank you for trusting Insure Club 18.'],
      ['anniversary', 'sms', 'Happy Anniversary {{name}}! Wishing you joy and prosperity. - Insure Club 18'],
      ['anniversary', 'whatsapp', '💐 Happy Anniversary {{name}} from Insure Club 18!'],
      ['renewal', 'sms', 'Dear {{name}}, your policy {{policy_number}} is due in {{days_left}} days.'],
      ['renewal', 'whatsapp', 'Reminder: Policy {{policy_number}} renews in {{days_left}} days.'],
      ['festival', 'sms', 'Happy Festival {{name}}! Stay protected with Insure Club 18.'],
      ['festival', 'whatsapp', '✨ Happy Festival {{name}} from Insure Club 18 family!']
    ];

    for (const item of defaults) {
      await run(
        'INSERT INTO message_templates (template_key, channel, body) VALUES (?, ?, ?)',
        item
      );
    }
  }

  const customerCount = await get('SELECT COUNT(*) as count FROM customers');
  if (!customerCount || customerCount.count === 0) {
    await run(
      `INSERT INTO customers (full_name, phone, email, address, date_of_birth, anniversary_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['Demo Customer', '9999999999', 'demo.customer@example.com', 'Demo Street 1', '1990-09-15', '2015-12-10', 'Sample record']
    );
    const customer = await get('SELECT id FROM customers WHERE email = ?', ['demo.customer@example.com']);
    await run(
      `INSERT INTO policies (customer_id, policy_type, policy_number, insurer_name, start_date, renewal_due_date, premium_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, 'health insurance', 'HC-1001', 'Demo Insurer', '2026-01-01', '2026-09-17', 12000, 'active']
    );
    await run(
      `INSERT INTO prospects (full_name, phone, email, status, pipeline_stage, attempts, follow_up_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Demo Prospect', '8888888888', 'demo.prospect@example.com', 'calling updates', 'contacted', 1, '2026-09-05', 'Interested in term plan']
    );
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
};
