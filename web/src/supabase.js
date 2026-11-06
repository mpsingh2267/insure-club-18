const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let client = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) return null;
  if (!client) {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
  }
  return client;
}

function isConfigured() {
  return Boolean(supabaseUrl && supabaseKey);
}

async function testConnection() {
  const sb = getSupabaseClient();
  if (!sb) {
    return { success: false, message: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.' };
  }
  try {
    const { error } = await sb.from('customers').select('id', { count: 'exact', head: true });
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Supabase connection verified successfully.' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Syncs local SQLite database records to Supabase.
 * NOTE: In accordance with local-first requirements, attached files like policies,
 * PAN cards, and birth certificates stay stored locally in uploads/. Only database
 * records and document metadata are synchronized with Supabase.
 */
async function syncToSupabase(dbHelper) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase is not configured.');

  // 1. Customers
  const customers = await dbHelper.all('SELECT * FROM customers');
  if (customers.length > 0) {
    const payload = customers.map(c => ({
      id: String(c.id),
      name: c.full_name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      date_of_birth: c.date_of_birth || null,
      anniversary_date: c.anniversary_date || null,
      notes: c.notes,
      created_at: c.created_at,
      updated_at: c.updated_at
    }));
    const { error } = await sb.from('customers').upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(`Customers sync error: ${error.message}`);
  }

  // 2. Policies (all active, renewed, and historical policies are preserved!)
  const policies = await dbHelper.all('SELECT * FROM policies');
  if (policies.length > 0) {
    const payload = policies.map(p => ({
      id: String(p.id),
      customer_id: String(p.customer_id),
      company_name: p.insurer_name,
      product_name: p.policy_type,
      policy_number: p.policy_number,
      start_date: p.start_date || null,
      renewal_due_date: p.renewal_due_date,
      premium_amount: p.premium_amount || 0,
      status: p.status || 'Active',
      previous_policy_id: p.previous_policy_id ? String(p.previous_policy_id) : null,
      has_document: Boolean(p.attachment_path),
      document_name: p.attachment_path ? p.attachment_path.split('/').pop() : null,
      created_at: p.created_at,
      updated_at: p.updated_at
    }));
    const { error } = await sb.from('policies').upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(`Policies sync error: ${error.message}`);
  }

  // 3. Family Members
  const family = await dbHelper.all('SELECT * FROM family_members');
  if (family.length > 0) {
    const payload = family.map(f => ({
      id: String(f.id),
      customer_id: String(f.customer_id),
      full_name: f.name,
      relationship: f.relationship,
      date_of_birth: f.date_of_birth || null,
      created_at: f.created_at
    }));
    const { error } = await sb.from('family_members').upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(`Family members sync error: ${error.message}`);
  }

  // 4. Documents Metadata (Files like PAN card, birth cert stay stored locally)
  const docs = await dbHelper.all('SELECT * FROM documents');
  if (docs && docs.length > 0) {
    const payload = docs.map(d => ({
      id: String(d.id),
      customer_id: String(d.customer_id),
      policy_id: d.policy_id ? String(d.policy_id) : null,
      family_member_id: d.family_member_id ? String(d.family_member_id) : null,
      document_type: d.document_type || 'Policy Document',
      title: d.title || d.original_filename,
      file_name: d.original_filename,
      file_size: d.file_size || 0,
      mime_type: d.mime_type || 'application/pdf',
      created_at: d.created_at
    }));
    const { error } = await sb.from('documents').upsert(payload, { onConflict: 'id' });
    if (error) throw new Error(`Documents sync error: ${error.message}`);
  }

  return { success: true, count: customers.length + policies.length };
}

/**
 * Pulls records from Supabase and merges into SQLite.
 */
async function syncFromSupabase(dbHelper) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase is not configured.');

  const { data: remoteCustomers, error: cErr } = await sb.from('customers').select('*');
  if (cErr) throw new Error(`Fetch customers error: ${cErr.message}`);

  for (const c of remoteCustomers || []) {
    const existing = await dbHelper.get('SELECT id FROM customers WHERE id = ?', [c.id]);
    if (existing) {
      await dbHelper.run(
        `UPDATE customers SET full_name = ?, phone = ?, email = ?, address = ?, date_of_birth = ?, anniversary_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [c.name, c.phone, c.email, c.address, c.date_of_birth, c.anniversary_date, c.notes, c.id]
      );
    } else {
      await dbHelper.run(
        `INSERT INTO customers (id, full_name, phone, email, address, date_of_birth, anniversary_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.name, c.phone, c.email, c.address, c.date_of_birth, c.anniversary_date, c.notes, c.created_at, c.updated_at]
      );
    }
  }

  const { data: remotePolicies, error: pErr } = await sb.from('policies').select('*');
  if (pErr) throw new Error(`Fetch policies error: ${pErr.message}`);

  for (const p of remotePolicies || []) {
    const existing = await dbHelper.get('SELECT id FROM policies WHERE id = ?', [p.id]);
    if (existing) {
      await dbHelper.run(
        `UPDATE policies SET customer_id = ?, policy_type = ?, policy_number = ?, insurer_name = ?, start_date = ?, renewal_due_date = ?, premium_amount = ?, status = ?, previous_policy_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [p.customer_id, p.product_name, p.policy_number, p.company_name, p.start_date, p.renewal_due_date, p.premium_amount, p.status, p.previous_policy_id, p.id]
      );
    } else {
      await dbHelper.run(
        `INSERT INTO policies (id, customer_id, policy_type, policy_number, insurer_name, start_date, renewal_due_date, premium_amount, status, previous_policy_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.customer_id, p.product_name, p.policy_number, p.company_name, p.start_date, p.renewal_due_date, p.premium_amount, p.status, p.previous_policy_id, p.created_at, p.updated_at]
      );
    }
  }

  return { success: true, customers: (remoteCustomers || []).length, policies: (remotePolicies || []).length };
}

module.exports = {
  getSupabaseClient,
  isConfigured,
  testConnection,
  syncToSupabase,
  syncFromSupabase
};
