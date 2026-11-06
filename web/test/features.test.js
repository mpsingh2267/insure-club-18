const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { initDb, all, get, run } = require('../src/db');
const { hashPassword } = require('../src/auth');
const supabase = require('../src/supabase');

test('Database schema includes documents table and policy preservation support', async () => {
  await initDb(hashPassword);

  // Check documents table exists
  const docTable = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'");
  assert.ok(docTable, 'documents table should exist');

  // Check policies table columns include previous_policy_id
  const polCols = await all('PRAGMA table_info(policies)');
  const colNames = polCols.map(c => c.name);
  assert.ok(colNames.includes('previous_policy_id'), 'policies table must have previous_policy_id column');
});

test('Policy renewal and creation never deletes older policy records', async () => {
  await initDb(hashPassword);

  // Create a customer
  const custRes = await run(
    `INSERT INTO customers (full_name, phone, email) VALUES (?, ?, ?)`,
    ['Test Policy Customer', '9876543210', 'policy.test@example.com']
  );
  const customerId = custRes.lastID;

  // Create initial policy
  const p1Res = await run(
    `INSERT INTO policies (customer_id, policy_type, policy_number, insurer_name, start_date, renewal_due_date, premium_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, 'health insurance', 'POL-TERM-1', 'Star Health', '2025-01-01', '2026-01-01', 15000, 'active']
  );
  const p1Id = p1Res.lastID;

  // Mark policy 1 renewed
  await run('UPDATE policies SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['renewed', p1Id]);

  // Create new renewal policy referencing policy 1
  const p2Res = await run(
    `INSERT INTO policies (customer_id, policy_type, policy_number, insurer_name, start_date, renewal_due_date, premium_amount, status, previous_policy_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, 'health insurance', 'POL-TERM-2', 'Star Health', '2026-01-01', '2027-01-01', 16500, 'active', p1Id]
  );
  const p2Id = p2Res.lastID;

  // Verify policy 1 STILL EXISTS in database (never deleted!)
  const oldPolicy = await get('SELECT * FROM policies WHERE id = ?', [p1Id]);
  assert.ok(oldPolicy, 'Older policy must still exist');
  assert.equal(oldPolicy.status, 'renewed');
  assert.equal(oldPolicy.policy_number, 'POL-TERM-1');

  // Verify policy 2 exists and links to policy 1
  const newPolicy = await get('SELECT * FROM policies WHERE id = ?', [p2Id]);
  assert.ok(newPolicy, 'New policy must exist');
  assert.equal(newPolicy.status, 'active');
  assert.equal(newPolicy.previous_policy_id, p1Id);

  // Total policies for this customer is 2
  const customerPolicies = await all('SELECT * FROM policies WHERE customer_id = ? ORDER BY id ASC', [customerId]);
  assert.equal(customerPolicies.length, 2, 'Customer must have both old and new policy preserved');
});

test('Generic local document attachments (PAN, Birth Cert, Policy) store locally', async () => {
  await initDb(hashPassword);

  const customer = await get('SELECT id FROM customers LIMIT 1');
  assert.ok(customer);

  // Attach a PAN Card
  const panRes = await run(
    `INSERT INTO documents (customer_id, document_type, title, file_path, original_filename, file_size, mime_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [customer.id, 'PAN Card', 'Customer PAN Card', '/uploads/pan_test.jpg', 'pan_card.jpg', 102400, 'image/jpeg']
  );
  assert.ok(panRes.lastID);

  // Attach a Birth Certificate
  const birthRes = await run(
    `INSERT INTO documents (customer_id, document_type, title, file_path, original_filename, file_size, mime_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [customer.id, 'Birth Certificate', 'Birth Certificate Scan', '/uploads/birth_cert.pdf', 'birth_certificate.pdf', 345000, 'application/pdf']
  );
  assert.ok(birthRes.lastID);

  // Retrieve documents
  const docs = await all('SELECT * FROM documents WHERE customer_id = ? ORDER BY id ASC', [customer.id]);
  assert.ok(docs.length >= 2);
  const panDoc = docs.find(d => d.document_type === 'PAN Card');
  const birthDoc = docs.find(d => d.document_type === 'Birth Certificate');
  assert.ok(panDoc);
  assert.equal(panDoc.mime_type, 'image/jpeg');
  assert.ok(birthDoc);
  assert.equal(birthDoc.mime_type, 'application/pdf');
});

test('Supabase module exposes configured state and methods', async () => {
  assert.equal(typeof supabase.isConfigured, 'function');
  assert.equal(typeof supabase.testConnection, 'function');
  assert.equal(typeof supabase.syncToSupabase, 'function');
  assert.equal(typeof supabase.syncFromSupabase, 'function');

  // Without credentials, testConnection returns false gracefully
  const testRes = await supabase.testConnection();
  assert.equal(testRes.success, false);
});
