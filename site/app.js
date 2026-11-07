/**
 * InsureClub Cloud Database Console
 * Direct Supabase PostgreSQL Client & Management Application
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'insureclub_cloud_portal_state_v1';
  const DEFAULT_SUPABASE = {
    url: 'https://insureclub-sync.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imluc3VyZWNsdWItc3luYyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzA5NzcwMDAwLCJleHAiOjIwMjUzMzAwMDB9.insureclub_default_anon_key_active'
  };

  // Helper utilities
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fmtCurrency = num => '₹' + Number(num || 0).toLocaleString('en-IN');
  const fmtDate = d => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };
  const fmtFileSize = bytes => {
    const b = Number(bytes || 0);
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Application State
  let state = {
    customers: [],
    policies: [],
    familyMembers: [],
    appointments: [],
    reminders: [],
    documents: [],
    supabase: {
      url: DEFAULT_SUPABASE.url,
      anonKey: DEFAULT_SUPABASE.anonKey
    },
    activeView: 'dashboard',
    policyFilter: 'all',
    docFilter: 'all',
    lastSyncAt: null,
    connectionStatus: 'connecting' // 'connected', 'connecting', 'offline'
  };

  // Load persisted cache
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (cached) {
      state = { ...state, ...cached };
      if (!state.supabase?.url) state.supabase = { ...DEFAULT_SUPABASE };
    }
  } catch (e) {
    console.warn('Cache load warning:', e);
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Persist error:', e);
    }
  }

  // --- Toast Notifications ---
  function toast(message, type = 'info') {
    const container = $('#toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'error' ? '⚠️' : '✓'}</span> <span>${esc(message)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'all 0.25s ease';
      setTimeout(() => el.remove(), 250);
    }, 3200);
  }

  // --- Supabase REST Client ---
  const Supabase = {
    getHeaders() {
      const key = state.supabase.anonKey || DEFAULT_SUPABASE.anonKey;
      return {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
    },

    getBaseUrl() {
      return (state.supabase.url || DEFAULT_SUPABASE.url).replace(/\/+$/, '');
    },

    async query(table, params = '') {
      const url = `${this.getBaseUrl()}/rest/v1/${table}${params ? (params.startsWith('?') ? params : '?' + params) : ''}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      return await res.json();
    },

    async upsert(table, payload) {
      const url = `${this.getBaseUrl()}/rest/v1/${table}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upsert error (${res.status}): ${text || res.statusText}`);
      }
      return await res.json();
    },

    async remove(table, id) {
      const url = `${this.getBaseUrl()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Delete error (${res.status}): ${text || res.statusText}`);
      }
      return true;
    },

    async ping(url, key) {
      const cleanUrl = (url || this.getBaseUrl()).replace(/\/+$/, '');
      const cleanKey = key || (state.supabase.anonKey || DEFAULT_SUPABASE.anonKey);
      const start = performance.now();
      const res = await fetch(`${cleanUrl}/rest/v1/customers?select=count&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': cleanKey,
          'Authorization': `Bearer ${cleanKey}`,
          'Accept': 'application/json'
        }
      });
      const duration = Math.round(performance.now() - start);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return { success: true, latency: duration };
    }
  };

  // --- Realtime WebSocket Connection ---
  let realtimeWs = null;
  let realtimeHeartbeat = null;
  let wsMsgRef = 1;

  function initRealtime() {
    const url = state.supabase?.url || DEFAULT_SUPABASE.url;
    const key = state.supabase?.anonKey || DEFAULT_SUPABASE.anonKey;
    if (!url || !key) return;

    try {
      if (realtimeWs && (realtimeWs.readyState === WebSocket.OPEN || realtimeWs.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const wsUrl = url.replace(/^http/, 'ws').replace(/\/+$/, '') + `/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
      realtimeWs = new WebSocket(wsUrl);

      realtimeWs.onopen = () => {
        clearInterval(realtimeHeartbeat);
        realtimeHeartbeat = setInterval(() => {
          if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
            realtimeWs.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(wsMsgRef++) }));
          }
        }, 25000);

        realtimeWs.send(JSON.stringify({
          topic: 'realtime:public',
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { self: false },
              postgres_changes: [
                { event: '*', schema: 'public', table: 'customers' },
                { event: '*', schema: 'public', table: 'policies' },
                { event: '*', schema: 'public', table: 'family_members' },
                { event: '*', schema: 'public', table: 'appointments' },
                { event: '*', schema: 'public', table: 'documents' }
              ]
            }
          },
          ref: String(wsMsgRef++)
        }));
        setConnectionStatus('connected');
      };

      realtimeWs.onmessage = evt => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === 'postgres_changes' && msg.payload?.data) {
            handleRealtimeEvent(msg.payload.data);
          }
        } catch (e) {
          console.warn('Realtime parsing notice:', e);
        }
      };

      realtimeWs.onclose = () => {
        clearInterval(realtimeHeartbeat);
        setTimeout(initRealtime, 8000);
      };

      realtimeWs.onerror = () => {
        try { realtimeWs.close(); } catch {}
      };
    } catch (e) {
      console.warn('Realtime setup notice:', e);
    }
  }

  function handleRealtimeEvent(data) {
    const { table, type, record, old_record } = data;
    const id = record?.id || old_record?.id;
    if (!id) return;

    if (table === 'customers') {
      if (type === 'DELETE') state.customers = state.customers.filter(x => x.id !== id);
      else if (record) {
        const idx = state.customers.findIndex(x => x.id === id);
        if (idx >= 0) state.customers[idx] = record;
        else state.customers.unshift(record);
      }
    } else if (table === 'policies') {
      if (type === 'DELETE') state.policies = state.policies.filter(x => x.id !== id);
      else if (record) {
        const idx = state.policies.findIndex(x => x.id === id);
        if (idx >= 0) state.policies[idx] = record;
        else state.policies.unshift(record);
      }
    } else if (table === 'family_members') {
      if (type === 'DELETE') state.familyMembers = state.familyMembers.filter(x => x.id !== id);
      else if (record) {
        const idx = state.familyMembers.findIndex(x => x.id === id);
        if (idx >= 0) state.familyMembers[idx] = record;
        else state.familyMembers.unshift(record);
      }
    } else if (table === 'appointments') {
      if (type === 'DELETE') state.appointments = state.appointments.filter(x => x.id !== id);
      else if (record) {
        const idx = state.appointments.findIndex(x => x.id === id);
        if (idx >= 0) state.appointments[idx] = record;
        else state.appointments.unshift(record);
      }
    } else if (table === 'documents') {
      if (type === 'DELETE') state.documents = state.documents.filter(x => x.id !== id);
      else if (record) {
        const idx = state.documents.findIndex(x => x.id === id);
        if (idx >= 0) state.documents[idx] = record;
        else state.documents.unshift(record);
      }
    }

    persistState();
    renderAll();
    toast(`Cloud update received (${table})`);
  }

  function setConnectionStatus(status) {
    state.connectionStatus = status;
    const pill = $('#connectionPill');
    const txt = $('#connectionText');
    if (!pill || !txt) return;

    pill.className = `status-pill ${status}`;
    if (status === 'connected') txt.textContent = 'Supabase Connected';
    else if (status === 'connecting') txt.textContent = 'Connecting…';
    else txt.textContent = 'Offline / Local Cache';
  }

  // --- Fetch All Data from Supabase ---
  async function fetchCloudData(silent = false) {
    if (!silent) setConnectionStatus('connecting');
    const refreshBtn = $('#refreshCloudBtn');
    if (refreshBtn) refreshBtn.classList.add('spinning');

    try {
      const [c, p, f, a, r, d] = await Promise.all([
        Supabase.query('customers', 'select=*&order=created_at.desc'),
        Supabase.query('policies', 'select=*&order=renewal_due_date.asc'),
        Supabase.query('family_members', 'select=*'),
        Supabase.query('appointments', 'select=*&order=date.asc'),
        Supabase.query('reminders', 'select=*&order=due_at.asc'),
        Supabase.query('documents', 'select=*&order=created_at.desc')
      ]);

      state.customers = Array.isArray(c) ? c : [];
      state.policies = Array.isArray(p) ? p : [];
      state.familyMembers = Array.isArray(f) ? f : [];
      state.appointments = Array.isArray(a) ? a : [];
      state.reminders = Array.isArray(r) ? r : [];
      state.documents = Array.isArray(d) ? d : [];
      state.lastSyncAt = new Date().toISOString();

      setConnectionStatus('connected');
      persistState();
      renderAll();

      if ($('#lastSyncLabel')) {
        $('#lastSyncLabel').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
      }

      if (!silent) toast('Synced live with Supabase cloud database ✓', 'success');
      return true;
    } catch (err) {
      console.warn('fetchCloudData error:', err);
      setConnectionStatus('offline');
      if (!silent) toast(`Cloud sync notice: ${err.message}`, 'error');
      renderAll();
      return false;
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }

  // --- Navigation & View Switching ---
  function switchView(viewName) {
    state.activeView = viewName;
    $$('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });
    $$('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    $('#sidebar').classList.remove('open');
    window.scrollTo(0, 0);

    if (viewName === 'explorer') {
      renderRawExplorer();
    }
  }

  // --- Modal Helpers ---
  function openModal(modalId) {
    const m = $(`#${modalId}`);
    if (m) m.classList.add('open');
  }

  function closeModal(modalId) {
    const m = typeof modalId === 'string' ? $(`#${modalId}`) : modalId;
    if (m) m.classList.remove('open');
  }

  function populateCustomerSelects() {
    const opts = ['<option value="">Select Customer</option>', ...state.customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.phone || 'No phone')})</option>`)].join('');
    ['#polFieldCustomer', '#docFieldCustomer', '#aptFieldCustomer'].forEach(selId => {
      const sel = $(selId);
      if (sel) sel.innerHTML = opts;
    });
  }

  // --- View Renderers ---
  function renderAll() {
    populateCustomerSelects();
    updateBadges();
    renderDashboard();
    renderCustomers();
    renderPolicies();
    renderDocuments();
    renderAppointments();
    renderReminders();
    if (state.activeView === 'explorer') renderRawExplorer();
  }

  function updateBadges() {
    if ($('#badgeCustomers')) $('#badgeCustomers').textContent = state.customers.length;
    if ($('#badgePolicies')) $('#badgePolicies').textContent = state.policies.length;
    if ($('#badgeDocuments')) $('#badgeDocuments').textContent = state.documents.length;
    if ($('#badgeAppointments')) $('#badgeAppointments').textContent = state.appointments.length;
    if ($('#badgeReminders')) $('#badgeReminders').textContent = state.reminders.length;
  }

  // 1. Dashboard Renderer
  function renderDashboard() {
    const activePols = state.policies.filter(p => (p.status || 'Active').toLowerCase() === 'active');
    const preservedPols = state.policies.filter(p => ['renewed', 'historical'].includes((p.status || '').toLowerCase()));
    const totalPremium = activePols.reduce((sum, p) => sum + Number(p.premium_amount || 0), 0);
    const totalSumInsured = activePols.reduce((sum, p) => sum + Number(p.sum_insured || 0), 0);

    if ($('#kpiCustomers')) $('#kpiCustomers').textContent = state.customers.length;
    if ($('#kpiActivePolicies')) $('#kpiActivePolicies').textContent = activePols.length;
    if ($('#kpiPreservedPolicies')) $('#kpiPreservedPolicies').textContent = `${preservedPols.length} historical policies preserved`;
    if ($('#kpiTotalPremium')) $('#kpiTotalPremium').textContent = fmtCurrency(totalPremium);
    if ($('#kpiSumInsured')) $('#kpiSumInsured').textContent = `Total Sum Insured: ${fmtCurrency(totalSumInsured)}`;
    if ($('#kpiDocCount')) $('#kpiDocCount').textContent = state.documents.length;

    // Upcoming renewals in next 30 days
    const now = new Date();
    const future30 = new Date();
    future30.setDate(future30.getDate() + 30);
    const nowStr = now.toISOString().slice(0, 10);
    const future30Str = future30.toISOString().slice(0, 10);

    const upcoming = state.policies.filter(p => p.renewal_due_date && p.renewal_due_date >= nowStr && p.renewal_due_date <= future30Str && (p.status || 'Active').toLowerCase() === 'active');
    if ($('#renewalCountBadge')) $('#renewalCountBadge').textContent = `${upcoming.length} due`;

    const tbody = $('#upcomingRenewalsTable');
    if (tbody) {
      if (upcoming.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No renewals due in the next 30 days</td></tr>';
      } else {
        tbody.innerHTML = upcoming.map(p => `
          <tr>
            <td><strong>${esc(p.customer_name || 'Customer')}</strong></td>
            <td>${esc(p.product_name)}</td>
            <td>${esc(p.company_name)}</td>
            <td><span class="badge yellow">${fmtDate(p.renewal_due_date)}</span></td>
            <td><strong>${fmtCurrency(p.premium_amount)}</strong></td>
            <td><button class="btn sm primary" data-renew-policy="${esc(p.id)}">Renew</button></td>
          </tr>
        `).join('');
      }
    }

    // Distribution
    if ($('#distCustomers')) $('#distCustomers').textContent = `${state.customers.length} rows`;
    if ($('#distPolicies')) $('#distPolicies').textContent = `${state.policies.length} rows`;
    if ($('#distFamily')) $('#distFamily').textContent = `${state.familyMembers.length} rows`;
    if ($('#distAppointments')) $('#distAppointments').textContent = `${state.appointments.length} rows`;
    if ($('#distReminders')) $('#distReminders').textContent = `${state.reminders.length} rows`;
    if ($('#distDocs')) $('#distDocs').textContent = `${state.documents.length} rows`;
  }

  // 2. Customers Renderer
  function renderCustomers() {
    const q = ($('#customerSearch')?.value || '').toLowerCase().trim();
    const filtered = state.customers.filter(c => {
      if (!q) return true;
      return (c.name || '').toLowerCase().includes(q) ||
             (c.phone || '').toLowerCase().includes(q) ||
             (c.city || '').toLowerCase().includes(q) ||
             (c.id || '').toLowerCase().includes(q);
    });

    const tbody = $('#customersTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No customers found matching search</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const polCount = state.policies.filter(p => p.customer_id === c.id).length;
      const famCount = state.familyMembers.filter(f => f.customer_id === c.id).length;
      const docCount = state.documents.filter(d => d.customer_id === c.id).length;
      return `
        <tr>
          <td>
            <a href="#" class="table-link" data-view-customer="${esc(c.id)}"><strong>${esc(c.name)}</strong></a>
            <div style="font-size:11px;color:var(--text-muted)">ID: ${esc(c.id)}</div>
          </td>
          <td>${esc(c.phone || '—')}</td>
          <td>${esc(c.city || '—')}</td>
          <td><span class="badge ${polCount > 0 ? 'green' : ''}">${polCount} policies</span></td>
          <td>${famCount}</td>
          <td><span class="badge ${docCount > 0 ? 'blue' : ''}">${docCount} docs</span></td>
          <td>${fmtDate(c.created_at)}</td>
          <td style="text-align:right">
            <button class="btn sm secondary" data-view-customer="${esc(c.id)}">View</button>
            <button class="btn sm secondary" data-edit-customer="${esc(c.id)}">Edit</button>
            <button class="btn sm danger" data-delete-customer="${esc(c.id)}" style="color:var(--danger)">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 3. Policies Renderer
  function renderPolicies() {
    const q = ($('#policySearch')?.value || '').toLowerCase().trim();
    const filter = state.policyFilter || 'all';

    const filtered = state.policies.filter(p => {
      const status = (p.status || 'Active').toLowerCase();
      if (filter === 'active' && status !== 'active') return false;
      if (filter === 'renewed' && status !== 'renewed') return false;
      if (filter === 'historical' && !['historical', 'expired'].includes(status)) return false;

      if (!q) return true;
      return (p.policy_number || '').toLowerCase().includes(q) ||
             (p.customer_name || '').toLowerCase().includes(q) ||
             (p.company_name || '').toLowerCase().includes(q) ||
             (p.product_name || '').toLowerCase().includes(q);
    });

    const tbody = $('#policiesTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No policies found matching filter</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const isRenewed = (p.status || '').toLowerCase() === 'renewed';
      const statusBadge = isRenewed ? '<span class="badge yellow">Renewed (Preserved)</span>' : ((p.status || 'Active') === 'Active' ? '<span class="badge green">Active</span>' : `<span class="badge">${esc(p.status)}</span>`);

      return `
        <tr>
          <td>
            <strong>${esc(p.customer_name || 'Customer')}</strong>
            <div style="font-size:11px;color:var(--text-muted)">CID: ${esc(p.customer_id)}</div>
          </td>
          <td>
            <strong>${esc(p.company_name)}</strong>
            <div>${esc(p.product_name)}</div>
          </td>
          <td><code>${esc(p.policy_number)}</code></td>
          <td>${fmtDate(p.renewal_due_date)}</td>
          <td><strong>${fmtCurrency(p.premium_amount)}</strong></td>
          <td>${fmtCurrency(p.sum_insured)}</td>
          <td>${statusBadge}</td>
          <td style="text-align:right">
            ${!isRenewed ? `<button class="btn sm primary" data-renew-policy="${esc(p.id)}">Renew</button>` : ''}
            <button class="btn sm secondary" data-edit-policy="${esc(p.id)}">Edit</button>
            <button class="btn sm danger" data-delete-policy="${esc(p.id)}" style="color:var(--danger)">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 4. Documents Renderer
  function renderDocuments() {
    const q = ($('#docSearch')?.value || '').toLowerCase().trim();
    const filter = state.docFilter || 'all';

    const filtered = state.documents.filter(d => {
      if (filter !== 'all' && (d.document_type || '') !== filter) return false;
      if (!q) return true;
      return (d.title || '').toLowerCase().includes(q) ||
             (d.customer_name || '').toLowerCase().includes(q) ||
             (d.file_name || '').toLowerCase().includes(q) ||
             (d.document_type || '').toLowerCase().includes(q);
    });

    const tbody = $('#documentsTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No document records found</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(d => `
      <tr>
        <td><strong>${esc(d.title)}</strong></td>
        <td><span class="badge blue">${esc(d.document_type || 'Document')}</span></td>
        <td>${esc(d.customer_name || 'Customer')}</td>
        <td><code>${esc(d.file_name)}</code></td>
        <td>${fmtFileSize(d.file_size)}</td>
        <td><span style="font-size:11px;color:var(--text-muted)">${esc(d.mime_type || 'application/pdf')}</span></td>
        <td>${fmtDate(d.created_at)}</td>
        <td style="text-align:right">
          <button class="btn sm danger" data-delete-doc="${esc(d.id)}" style="color:var(--danger)">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  // 5. Appointments Renderer
  function renderAppointments() {
    const tbody = $('#appointmentsTableBody');
    if (!tbody) return;

    if (state.appointments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No appointments scheduled</td></tr>';
      return;
    }

    tbody.innerHTML = state.appointments.map(a => `
      <tr>
        <td><strong>${esc(a.customer_name || 'Customer')}</strong></td>
        <td>${esc(a.purpose)}</td>
        <td>${fmtDate(a.date)} ${esc(a.time || '')}</td>
        <td>${esc(a.company_name || '—')} ${esc(a.product_name ? '· ' + a.product_name : '')}</td>
        <td><span class="badge ${a.status === 'Completed' ? 'green' : 'yellow'}">${esc(a.status || 'Scheduled')}</span></td>
        <td>${esc(a.notes || '—')}</td>
        <td style="text-align:right">
          <button class="btn sm danger" data-delete-apt="${esc(a.id)}" style="color:var(--danger)">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  // 6. Reminders Renderer
  function renderReminders() {
    const tbody = $('#remindersTableBody');
    if (!tbody) return;

    if (state.reminders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No reminders in queue</td></tr>';
      return;
    }

    tbody.innerHTML = state.reminders.map(r => `
      <tr>
        <td><strong>${esc(r.customer_name || 'General')}</strong></td>
        <td><span class="badge blue">${esc(r.type || 'Reminder')}</span></td>
        <td>${esc(r.activity)}</td>
        <td>${fmtDate(r.due_at)}</td>
        <td><span class="badge ${r.status === 'Completed' ? 'green' : 'yellow'}">${esc(r.status || 'Pending')}</span></td>
        <td style="text-align:right">
          ${r.status !== 'Completed' ? `<button class="btn sm primary" data-complete-reminder="${esc(r.id)}">Complete</button>` : ''}
          <button class="btn sm danger" data-delete-reminder="${esc(r.id)}" style="color:var(--danger)">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  // 7. Raw Table Explorer Renderer
  function renderRawExplorer() {
    const tableSelect = $('#rawTableSelect');
    const tableName = tableSelect ? tableSelect.value : 'customers';
    const rows = state[tableName === 'family_members' ? 'familyMembers' : tableName] || [];

    if ($('#rawRowCount')) $('#rawRowCount').textContent = `${rows.length} rows`;

    const thead = $('#rawTableHead');
    const tbody = $('#rawTableBody');
    if (!thead || !tbody) return;

    if (rows.length === 0) {
      thead.innerHTML = '<tr><th>Table columns</th></tr>';
      tbody.innerHTML = `<tr><td class="table-empty">Table "${tableName}" is currently empty in cloud database</td></tr>`;
      return;
    }

    const columns = Object.keys(rows[0]);
    thead.innerHTML = `<tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
    tbody.innerHTML = rows.map(row => `
      <tr>${columns.map(c => {
        const val = row[c];
        const display = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
        return `<td>${esc(display)}</td>`;
      }).join('')}</tr>
    `).join('');
  }

  // --- Customer Drawer Detail View ---
  function renderCustomerDrawer(customerId) {
    const c = state.customers.find(x => x.id === customerId);
    if (!c) return;

    const pols = state.policies.filter(p => p.customer_id === c.id);
    const fams = state.familyMembers.filter(f => f.customer_id === c.id);
    const docs = state.documents.filter(d => d.customer_id === c.id);
    const apts = state.appointments.filter(a => a.customer_id === c.id);

    $('#drawerCustomerName').textContent = c.name;
    const body = $('#drawerBody');
    if (!body) return;

    body.innerHTML = `
      <div style="margin-bottom:20px;padding:16px;background:var(--surface-alt);border-radius:var(--radius-md)">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:12px;color:var(--text-muted)">Mobile</div>
            <strong>${esc(c.phone || '—')}</strong>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted)">City</div>
            <strong>${esc(c.city || '—')}</strong>
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted)">Date of Birth</div>
            <strong>${fmtDate(c.date_of_birth)}</strong>
          </div>
        </div>
        ${c.notes ? `<div style="margin-top:10px;font-size:12.5px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px"><strong>Notes:</strong> ${esc(c.notes)}</div>` : ''}
      </div>

      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <h4 style="font-size:14px;font-weight:750">Policies (${pols.length})</h4>
          <button class="btn sm secondary" data-modal="policyModal" data-prefill-customer="${esc(c.id)}">＋ Add Policy</button>
        </div>
        ${pols.length === 0 ? '<div style="font-size:12.5px;color:var(--text-muted)">No policies attached</div>' : `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${pols.map(p => `
              <div style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:space-between">
                <div>
                  <strong>${esc(p.company_name)} · ${esc(p.product_name)}</strong>
                  <div style="font-size:11.5px;color:var(--text-muted)">Policy: ${esc(p.policy_number)} · Due: ${fmtDate(p.renewal_due_date)}</div>
                </div>
                <div style="text-align:right">
                  <strong>${fmtCurrency(p.premium_amount)}</strong>
                  <div><span class="badge ${(p.status || 'Active').toLowerCase() === 'active' ? 'green' : 'yellow'}">${esc(p.status || 'Active')}</span></div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div style="margin-bottom:24px">
        <h4 style="font-size:14px;font-weight:750;margin-bottom:10px">Family Members (${fams.length})</h4>
        ${fams.length === 0 ? '<div style="font-size:12.5px;color:var(--text-muted)">No family members registered</div>' : `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${fams.map(f => `
              <div style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:space-between">
                <div>
                  <strong>${esc(f.full_name)}</strong>
                  <div style="font-size:11.5px;color:var(--text-muted)">${esc(f.relationship)} · DOB: ${fmtDate(f.date_of_birth)}</div>
                </div>
                <div style="font-size:12px;color:var(--text-muted)">${esc(f.mobile || '')}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div style="margin-bottom:24px">
        <h4 style="font-size:14px;font-weight:750;margin-bottom:10px">Attached Document Metadata (${docs.length})</h4>
        ${docs.length === 0 ? '<div style="font-size:12.5px;color:var(--text-muted)">No documents registered in vault</div>' : `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${docs.map(d => `
              <div style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:space-between">
                <div>
                  <strong>${esc(d.title)}</strong>
                  <div style="font-size:11.5px;color:var(--text-muted)">${esc(d.document_type)} · ${fmtFileSize(d.file_size)}</div>
                </div>
                <span class="badge blue">${esc(d.file_name)}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    $('#customerDrawer').classList.add('open');
  }

  // --- CSV / JSON Exporters ---
  function downloadFile(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
  }

  function exportTableToCsv(rows, filename) {
    if (!rows || rows.length === 0) return toast('No data to export', 'error');
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => {
        let val = r[h] ?? '';
        if (typeof val === 'object') val = JSON.stringify(val);
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      }).join(','))
    ];
    downloadFile(filename, lines.join('\n'), 'text/csv');
    toast(`Exported ${filename} successfully`);
  }

  // --- Setup Form Handlers ---
  function setupForms() {
    // 1. Customer Form
    $('#customerForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const data = {
        id: form.id.value || uid('customer'),
        name: form.name.value.trim(),
        phone: form.phone.value.trim() || null,
        city: form.city.value.trim() || null,
        date_of_birth: form.date_of_birth.value || null,
        anniversary_date: form.anniversary_date.value || null,
        notes: form.notes.value.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await Supabase.upsert('customers', data);
        closeModal('customerModal');
        form.reset();
        await fetchCloudData(true);
        toast(`Customer "${data.name}" saved to Supabase cloud database ✓`, 'success');
      } catch (err) {
        toast(`Save failed: ${err.message}`, 'error');
      }
    });

    // 2. Policy Form
    $('#policyForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const c = state.customers.find(x => x.id === form.customer_id.value);
      const data = {
        id: form.id.value || uid('policy'),
        customer_id: form.customer_id.value,
        customer_name: c?.name || null,
        company_name: form.company_name.value.trim(),
        product_name: form.product_name.value.trim(),
        category_name: form.category_name.value.trim() || null,
        policy_number: form.policy_number.value.trim(),
        start_date: form.start_date.value || null,
        renewal_due_date: form.renewal_due_date.value,
        premium_amount: Number(form.premium_amount.value || 0),
        sum_insured: Number(form.sum_insured.value || 0),
        status: form.status.value || 'Active',
        notes: form.notes.value.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await Supabase.upsert('policies', data);
        closeModal('policyModal');
        form.reset();
        await fetchCloudData(true);
        toast(`Policy "${data.product_name}" saved to Supabase ✓`, 'success');
      } catch (err) {
        toast(`Save policy failed: ${err.message}`, 'error');
      }
    });

    // 3. Renew Policy Form (Policy Preservation)
    $('#renewForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const oldPolicyId = form.old_policy_id.value;
      const oldPol = state.policies.find(x => x.id === oldPolicyId);
      if (!oldPol) return toast('Old policy not found', 'error');

      try {
        // 1. Preserve the old policy term: update status to 'Renewed' in Supabase
        await Supabase.upsert('policies', {
          ...oldPol,
          status: 'Renewed',
          updated_at: new Date().toISOString()
        });

        // 2. Create the brand new policy term
        const newPolicy = {
          id: uid('policy'),
          customer_id: oldPol.customer_id,
          customer_name: oldPol.customer_name,
          company_name: form.company_name.value.trim(),
          product_name: form.product_name.value.trim(),
          category_name: oldPol.category_name || null,
          policy_number: form.policy_number.value.trim(),
          start_date: form.start_date.value,
          renewal_due_date: form.renewal_due_date.value,
          premium_amount: Number(form.premium_amount.value || 0),
          sum_insured: Number(form.sum_insured.value || 0),
          status: 'Active',
          previous_policy_id: oldPol.id,
          notes: form.notes.value.trim() || null,
          has_document: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await Supabase.upsert('policies', newPolicy);

        closeModal('renewModal');
        form.reset();
        await fetchCloudData(true);
        toast('Policy renewed! Previous term safely preserved as "Renewed" ✓', 'success');
      } catch (err) {
        toast(`Renewal failed: ${err.message}`, 'error');
      }
    });

    // 4. Document Metadata Form
    $('#documentForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const c = state.customers.find(x => x.id === form.customer_id.value);
      const data = {
        id: uid('doc'),
        customer_id: form.customer_id.value,
        customer_name: c?.name || null,
        policy_id: null,
        family_member_id: null,
        document_type: form.document_type.value,
        title: form.title.value.trim(),
        file_name: form.file_name.value.trim(),
        file_size: Number(form.file_size.value || 0),
        mime_type: form.file_name.value.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await Supabase.upsert('documents', data);
        closeModal('documentModal');
        form.reset();
        await fetchCloudData(true);
        toast(`${data.document_type} metadata registered in Supabase ✓`, 'success');
      } catch (err) {
        toast(`Document registration failed: ${err.message}`, 'error');
      }
    });

    // 5. Appointment Form
    $('#appointmentForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const c = state.customers.find(x => x.id === form.customer_id.value);
      const data = {
        id: uid('appointment'),
        customer_id: form.customer_id.value,
        customer_name: c?.name || null,
        date: form.date.value,
        time: form.time.value || null,
        purpose: form.purpose.value.trim(),
        company_name: form.company_name.value.trim() || null,
        product_name: form.product_name.value.trim() || null,
        status: form.status.value || 'Scheduled',
        notes: form.notes.value.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await Supabase.upsert('appointments', data);
        closeModal('appointmentModal');
        form.reset();
        await fetchCloudData(true);
        toast('Appointment scheduled in Supabase ✓', 'success');
      } catch (err) {
        toast(`Appointment scheduling failed: ${err.message}`, 'error');
      }
    });

    // 6. Settings Form
    $('#settingsForm')?.addEventListener('submit', e => {
      e.preventDefault();
      state.supabase.url = ($('#cfgSupabaseUrl').value || '').trim() || DEFAULT_SUPABASE.url;
      state.supabase.anonKey = ($('#cfgSupabaseKey').value || '').trim() || DEFAULT_SUPABASE.anonKey;
      persistState();
      toast('Supabase configuration saved locally ✓', 'success');
      initRealtime();
      fetchCloudData();
    });

    $('#testConnBtn')?.addEventListener('click', async () => {
      const url = ($('#cfgSupabaseUrl').value || '').trim() || state.supabase.url;
      const key = ($('#cfgSupabaseKey').value || '').trim() || state.supabase.anonKey;
      const resultBox = $('#testResultBox');
      resultBox.classList.remove('hidden', 'success', 'error');
      resultBox.textContent = 'Testing connection to Supabase cloud…';

      try {
        const res = await Supabase.ping(url, key);
        resultBox.classList.add('success');
        resultBox.innerHTML = `<strong>✓ Connection Verified!</strong><br>Successfully reached Supabase cloud in <strong>${res.latency} ms</strong>. Table access and REST endpoints are active.`;
        toast('Connection verified ✓', 'success');
      } catch (err) {
        resultBox.classList.add('error');
        resultBox.innerHTML = `<strong>✕ Connection Failed:</strong><br>${esc(err.message)}`;
        toast('Connection test failed', 'error');
      }
    });

    $('#resetDefaultsBtn')?.addEventListener('click', () => {
      $('#cfgSupabaseUrl').value = DEFAULT_SUPABASE.url;
      $('#cfgSupabaseKey').value = DEFAULT_SUPABASE.anonKey;
      toast('Reset to default InsureClub Supabase credentials');
    });
  }

  // --- Click & Action Delegation ---
  function setupEventDelegation() {
    document.addEventListener('click', async e => {
      const t = e.target.closest('button, [data-view], [data-modal], [data-close-modal], [data-nav]');
      if (!t) return;

      // Navigation
      if (t.dataset.view) {
        e.preventDefault();
        switchView(t.dataset.view);
      }
      if (t.dataset.nav) {
        e.preventDefault();
        switchView(t.dataset.nav);
      }

      // Open Modals
      if (t.dataset.modal) {
        openModal(t.dataset.modal);
        if (t.dataset.prefillCustomer) {
          const sel = $('#polFieldCustomer');
          if (sel) sel.value = t.dataset.prefillCustomer;
        }
      }

      // Close Modals
      if (t.hasAttribute('data-close-modal')) {
        const modal = t.closest('.modal-backdrop');
        if (modal) closeModal(modal);
      }

      // View Customer Drawer
      if (t.dataset.viewCustomer) {
        e.preventDefault();
        renderCustomerDrawer(t.dataset.viewCustomer);
      }

      // Edit Customer
      if (t.dataset.editCustomer) {
        const c = state.customers.find(x => x.id === t.dataset.editCustomer);
        if (c) {
          $('#custFieldId').value = c.id;
          $('#custFieldName').value = c.name || '';
          $('#custFieldPhone').value = c.phone || '';
          $('#custFieldCity').value = c.city || '';
          $('#custFieldDob').value = c.date_of_birth || '';
          $('#custFieldAnniversary').value = c.anniversary_date || '';
          $('#custFieldNotes').value = c.notes || '';
          $('#customerModalTitle').textContent = 'Edit Customer';
          openModal('customerModal');
        }
      }

      // Delete Customer
      if (t.dataset.deleteCustomer) {
        const c = state.customers.find(x => x.id === t.dataset.deleteCustomer);
        if (c && confirm(`Delete customer "${c.name}" from the cloud database? Linked policies and documents will also be removed.`)) {
          try {
            await Supabase.remove('customers', c.id);
            await fetchCloudData(true);
            toast(`Customer "${c.name}" deleted from cloud`, 'info');
          } catch (err) {
            toast(`Delete failed: ${err.message}`, 'error');
          }
        }
      }

      // Renew Policy Trigger
      if (t.dataset.renewPolicy) {
        const p = state.policies.find(x => x.id === t.dataset.renewPolicy);
        if (p) {
          $('#renewOldPolicyId').value = p.id;
          $('#renewPolicyNumber').value = p.policy_number || '';
          $('#renewCompany').value = p.company_name || '';
          $('#renewProduct').value = p.product_name || '';
          $('#renewStartDate').value = p.renewal_due_date || new Date().toISOString().slice(0, 10);
          const nextYr = new Date(p.renewal_due_date || new Date());
          nextYr.setFullYear(nextYr.getFullYear() + 1);
          $('#renewDueDate').value = nextYr.toISOString().slice(0, 10);
          $('#renewPremium').value = p.premium_amount || '';
          $('#renewSumInsured').value = p.sum_insured || '';
          $('#renewNotes').value = `Renewed term for policy ${p.policy_number}`;
          openModal('renewModal');
        }
      }

      // Delete Policy
      if (t.dataset.deletePolicy) {
        const p = state.policies.find(x => x.id === t.dataset.deletePolicy);
        if (p && confirm(`Delete policy "${p.policy_number}"?`)) {
          try {
            await Supabase.remove('policies', p.id);
            await fetchCloudData(true);
            toast(`Policy "${p.policy_number}" deleted`, 'info');
          } catch (err) {
            toast(`Delete failed: ${err.message}`, 'error');
          }
        }
      }

      // Delete Document
      if (t.dataset.deleteDoc) {
        const d = state.documents.find(x => x.id === t.dataset.deleteDoc);
        if (d && confirm(`Delete document record "${d.title}"?`)) {
          try {
            await Supabase.remove('documents', d.id);
            await fetchCloudData(true);
            toast(`Document record "${d.title}" deleted`, 'info');
          } catch (err) {
            toast(`Delete failed: ${err.message}`, 'error');
          }
        }
      }

      // Complete Reminder
      if (t.dataset.completeReminder) {
        const r = state.reminders.find(x => x.id === t.dataset.completeReminder);
        if (r) {
          try {
            await Supabase.upsert('reminders', {
              ...r,
              status: 'Completed',
              completed_at: new Date().toISOString()
            });
            await fetchCloudData(true);
            toast('Reminder marked completed ✓', 'success');
          } catch (err) {
            toast(`Failed to update reminder: ${err.message}`, 'error');
          }
        }
      }

      // Delete Reminder
      if (t.dataset.deleteReminder) {
        const r = state.reminders.find(x => x.id === t.dataset.deleteReminder);
        if (r && confirm(`Delete reminder "${r.activity}"?`)) {
          try {
            await Supabase.remove('reminders', r.id);
            await fetchCloudData(true);
            toast('Reminder deleted', 'info');
          } catch (err) {
            toast(`Delete failed: ${err.message}`, 'error');
          }
        }
      }

      // Policy Filter Pills
      if (t.dataset.policyFilter) {
        $$('.filter-pill[data-policy-filter]').forEach(b => b.classList.remove('active'));
        t.classList.add('active');
        state.policyFilter = t.dataset.policyFilter;
        renderPolicies();
      }

      // Document Filter Pills
      if (t.dataset.docFilter) {
        $$('.filter-pill[data-doc-filter]').forEach(b => b.classList.remove('active'));
        t.classList.add('active');
        state.docFilter = t.dataset.docFilter;
        renderDocuments();
      }
    });

    // Close Drawer
    $('#drawerCloseBtn')?.addEventListener('click', () => {
      $('#customerDrawer').classList.remove('open');
    });
    $('#customerDrawer')?.addEventListener('click', e => {
      if (e.target.id === 'customerDrawer') $('#customerDrawer').classList.remove('open');
    });

    // Mobile menu toggle
    $('#mobileMenuToggle')?.addEventListener('click', () => {
      $('#sidebar').classList.toggle('open');
    });

    // Refresh Cloud Data
    $('#refreshCloudBtn')?.addEventListener('click', () => fetchCloudData(false));

    // Search inputs
    $('#customerSearch')?.addEventListener('input', renderCustomers);
    $('#policySearch')?.addEventListener('input', renderPolicies);
    $('#docSearch')?.addEventListener('input', renderDocuments);

    // Raw Explorer Table Select
    $('#rawTableSelect')?.addEventListener('change', renderRawExplorer);

    // Export Buttons
    $('#exportFullJson')?.addEventListener('click', () => {
      downloadFile('insureclub-supabase-full-backup.json', JSON.stringify(state, null, 2), 'application/json');
    });
    $('#exportCustomersCsv')?.addEventListener('click', () => {
      exportTableToCsv(state.customers, 'insureclub-customers.csv');
    });
    $('#exportPoliciesCsv')?.addEventListener('click', () => {
      exportTableToCsv(state.policies, 'insureclub-policies.csv');
    });
    $('#exportExplorerJson')?.addEventListener('click', () => {
      const table = $('#rawTableSelect').value;
      const rows = state[table === 'family_members' ? 'familyMembers' : table] || [];
      downloadFile(`insureclub-${table}.json`, JSON.stringify(rows, null, 2), 'application/json');
    });
    $('#exportExplorerCsv')?.addEventListener('click', () => {
      const table = $('#rawTableSelect').value;
      const rows = state[table === 'family_members' ? 'familyMembers' : table] || [];
      exportTableToCsv(rows, `insureclub-${table}.csv`);
    });
  }

  // --- Initial Boot ---
  function boot() {
    // Populate settings inputs
    if ($('#cfgSupabaseUrl')) $('#cfgSupabaseUrl').value = state.supabase.url;
    if ($('#cfgSupabaseKey')) $('#cfgSupabaseKey').value = state.supabase.anonKey;

    setupForms();
    setupEventDelegation();
    renderAll();

    // Start Realtime WebSocket & Fetch Cloud Data
    initRealtime();
    fetchCloudData(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
