const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForStartup(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out.\n${output}`)), 10000);

    const inspect = (chunk) => {
      output += chunk.toString();
      if (output.includes('Insure Club 18 running at')) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with code ${code}.\n${output}`));
    });
  });
}

test('core CRM flow works end to end', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'insure-club-18-'));
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_PATH: path.join(tempDir, 'smoke.sqlite'),
      SESSION_SECRET: 'smoke-test-only-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForStartup(child);

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, app: 'Insure Club 18' });

  const protectedPage = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  assert.equal(protectedPage.status, 302);
  assert.equal(protectedPage.headers.get('location'), '/login');

  const loginPage = await fetch(`${baseUrl}/login`);
  assert.equal(loginPage.status, 200);
  const cookie = loginPage.headers.get('set-cookie').split(';', 1)[0];
  const loginHtml = await loginPage.text();
  const csrfToken = loginHtml.match(/const token = '([a-f0-9]+)'/)?.[1];
  assert.ok(csrfToken, 'login page should expose a CSRF token to its form helper');

  const login = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      _csrf: csrfToken,
      username: 'admin',
      password: 'admin123',
    }),
  });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/');

  const request = (route, options = {}) => fetch(`${baseUrl}${route}`, {
    redirect: 'manual',
    ...options,
    headers: { cookie, ...(options.headers || {}) },
  });

  const dashboard = await request('/');
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /<h1 class="page-title">Executive overview<\/h1>/);

  for (const route of ['/customers/new', '/policies/new', '/prospects/new', '/meetings', '/meetings/new', '/calendar', '/templates', '/activities']) {
    const page = await request(route);
    assert.equal(page.status, 200, `${route} should render successfully`);
  }

  const createCustomer = await request('/customers', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: csrfToken,
      full_name: 'Smoke Test Customer',
      phone: '9000000000',
      email: 'smoke.customer@example.com',
      address: 'Test address',
      date_of_birth: '1990-01-01',
      anniversary_date: '2020-02-02',
      notes: 'Created by automated smoke test',
    }),
  });
  assert.equal(createCustomer.status, 302);
  const customerLocation = createCustomer.headers.get('location');
  const customerId = customerLocation.match(/^\/customers\/(\d+)\/edit$/)?.[1];
  assert.ok(customerId, 'customer creation should redirect to its edit page');

  const customers = await request('/customers?q=Smoke%20Test%20Customer');
  assert.equal(customers.status, 200);
  assert.match(await customers.text(), /Smoke Test Customer/);

  const policyForm = new FormData();
  policyForm.set('customer_id', customerId);
  policyForm.set('policy_type', 'health insurance');
  policyForm.set('policy_number', 'SMOKE-1001');
  policyForm.set('insurer_name', 'Smoke Insurer');
  policyForm.set('start_date', '2026-01-01');
  policyForm.set('renewal_due_date', '2026-12-31');
  policyForm.set('premium_amount', '12000');
  policyForm.set('status', 'active');
  const createPolicy = await request(`/policies?_csrf=${csrfToken}`, {
    method: 'POST',
    body: policyForm,
  });
  assert.equal(createPolicy.status, 302);
  assert.equal(createPolicy.headers.get('location'), '/policies');

  const policies = await request('/policies?q=SMOKE-1001');
  assert.equal(policies.status, 200);
  assert.match(await policies.text(), /SMOKE-1001/);

  const createProspect = await request('/prospects', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: csrfToken,
      full_name: 'Smoke Test Prospect',
      phone: '9111111111',
      email: 'smoke.prospect@example.com',
      status: 'calling updates',
      pipeline_stage: 'qualified',
      attempts: '1',
      follow_up_date: '2026-09-10',
      notes: 'Ready for follow-up',
    }),
  });
  assert.equal(createProspect.status, 302);

  const prospects = await request('/prospects?q=Smoke%20Test%20Prospect');
  assert.equal(prospects.status, 200);
  assert.match(await prospects.text(), /Smoke Test Prospect/);

  const createMeeting = await request('/meetings', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: csrfToken,
      customer_id: customerId,
      prospect_id: '',
      title: 'Smoke Review Meeting',
      meeting_date: '2026-09-12',
      meeting_time: '10:30',
      meeting_status: 'scheduled',
      location: 'Office',
      notes: 'Core flow verification',
    }),
  });
  assert.equal(createMeeting.status, 302);

  const calendar = await request('/api/calendar-events');
  assert.equal(calendar.status, 200);
  assert.ok((await calendar.json()).some((event) => event.title.includes('Smoke Review Meeting')));

  const customerExport = await request('/customers/export.csv');
  assert.equal(customerExport.status, 200);
  assert.match(customerExport.headers.get('content-type'), /text\/csv/);
  assert.match(await customerExport.text(), /Smoke Test Customer/);

  const csrfRejection = await request('/customers', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ full_name: 'Must Not Be Created' }),
  });
  assert.equal(csrfRejection.status, 403);
});
