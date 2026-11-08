(() => {
  'use strict';
  const STATE_KEY = 'insureclub_crm_state_v2';
  const LEGACY = {
    customers: 'insureclub_customers_v1',
    policies: 'insureclub_policies_v1',
    meetings: 'insureclub_meetings_v1',
    advisor: 'insureclub_advisor_name_v1'
  };
  const ARRAYS = [
    'customers', 'familyMembers', 'policies', 'policyHistory', 'reminders',
    'appointments', 'activities', 'messageTemplates', 'companies', 'products',
    'categories', 'portingReminders', 'documents', 'outbox'
  ];
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const uid = p => `${p}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const isoNow = () => new Date().toISOString();
  const dateOnly = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const today = () => dateOnly(new Date());
  const fmtDate = v => v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';
  const fmtDateTime = v => v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not set';
  const money = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v) || 0);
  const daysBetween = (a, b) => Math.floor((new Date(`${String(a).slice(0, 10)}T12:00:00`) - new Date(`${String(b).slice(0, 10)}T12:00:00`)) / 86400000);
  const initials = n => String(n || 'CL').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const age = d => {
    if (!d) return '—';
    const b = new Date(`${d}T12:00:00`), n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
    return Math.max(0, a);
  };
  const fmtFileSize = bytes => {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };
  const selectOptions = (items, value, label = 'name') => items.map(x => `<option value="${esc(x.id)}" ${x.id === value ? 'selected' : ''}>${esc(x[label] || x.name)}</option>`).join('');
  const customerBy = id => state.customers.find(x => x.id === id);
  const policyBy = id => state.policies.find(x => x.id === id);

  // Live InsureClub cloud project. Data access needs an advisor sign-in (see supabase-auth.js).
  const Auth = window.InsureClubAuth;
  const LEGACY_PLACEHOLDER_URL = 'https://insureclub-sync.supabase.co';
  // Secured schema (advisor sign-in only) - kept in sync with supabase/schema.sql.
  const SUPABASE_SCHEMA_SQL = "-- InsureClub CRM - Supabase Database Schema\n-- Provides cloud database storage and multi-device sync for customers, policies,\n-- family members, appointments, reminders, document metadata, and templates.\n-- NOTE: In accordance with local-first privacy requirements, physical attached\n-- files (PDFs, images, scans) are stored locally on device storage. Only metadata\n-- is synced in the documents table.\n\n-- 1. Customers Table\nCREATE TABLE IF NOT EXISTS public.customers (\n    id TEXT PRIMARY KEY,\n    name TEXT NOT NULL,\n    phone TEXT,\n    email TEXT,\n    city TEXT,\n    address TEXT,\n    date_of_birth DATE,\n    anniversary_date DATE,\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 2. Policies Table\n-- Stores all policies. When a policy is renewed, older policies remain intact\n-- with status 'Renewed' or 'Historical' and are NEVER deleted.\nCREATE TABLE IF NOT EXISTS public.policies (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    company_name TEXT NOT NULL,\n    product_name TEXT NOT NULL,\n    category_name TEXT,\n    policy_number TEXT NOT NULL,\n    start_date DATE,\n    renewal_due_date DATE NOT NULL,\n    premium_amount NUMERIC(12, 2) DEFAULT 0,\n    sum_insured NUMERIC(14, 2) DEFAULT 0,\n    status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Renewed', 'Historical', 'Expired', 'Cancelled'\n    previous_policy_id TEXT REFERENCES public.policies(id) ON DELETE SET NULL,\n    notes TEXT,\n    has_document BOOLEAN DEFAULT false,\n    document_name TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 3. Family Members Table\nCREATE TABLE IF NOT EXISTS public.family_members (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,\n    full_name TEXT NOT NULL,\n    relationship TEXT NOT NULL,\n    date_of_birth DATE,\n    mobile TEXT,\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 4. Appointments Table\nCREATE TABLE IF NOT EXISTS public.appointments (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    date DATE NOT NULL,\n    time TEXT,\n    purpose TEXT NOT NULL,\n    product_name TEXT,\n    company_name TEXT,\n    reminder_at TIMESTAMPTZ,\n    status TEXT NOT NULL DEFAULT 'Scheduled',\n    notes TEXT,\n    follow_up_at TIMESTAMPTZ,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 5. Reminders Table\nCREATE TABLE IF NOT EXISTS public.reminders (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    policy_id TEXT REFERENCES public.policies(id) ON DELETE CASCADE,\n    family_member_id TEXT REFERENCES public.family_members(id) ON DELETE CASCADE,\n    type TEXT NOT NULL,\n    activity TEXT NOT NULL,\n    due_at TIMESTAMPTZ NOT NULL,\n    status TEXT NOT NULL DEFAULT 'Pending',\n    notes TEXT,\n    auto BOOLEAN DEFAULT false,\n    completed_at TIMESTAMPTZ,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 6. Document Metadata Table (Local-First: Binaries stay on local device storage)\n-- Tracks PAN cards, birth certificates, policy documents, Aadhaar cards, etc.\nCREATE TABLE IF NOT EXISTS public.documents (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    policy_id TEXT REFERENCES public.policies(id) ON DELETE SET NULL,\n    family_member_id TEXT REFERENCES public.family_members(id) ON DELETE SET NULL,\n    document_type TEXT NOT NULL, -- 'PAN Card', 'Birth Certificate', 'Aadhaar Card', 'Policy Document', etc.\n    title TEXT NOT NULL,\n    file_name TEXT NOT NULL,\n    file_size BIGINT DEFAULT 0,\n    mime_type TEXT DEFAULT 'application/pdf',\n    local_storage_path TEXT,\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 7. Porting Reminders Table\nCREATE TABLE IF NOT EXISTS public.porting_reminders (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    policy_id TEXT REFERENCES public.policies(id) ON DELETE CASCADE,\n    existing_company TEXT,\n    existing_policy TEXT,\n    renewal_date DATE,\n    target_company TEXT,\n    target_product TEXT,\n    reminder_date DATE,\n    status TEXT NOT NULL DEFAULT 'Pending',\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 8. Message Templates Table\nCREATE TABLE IF NOT EXISTS public.message_templates (\n    id TEXT PRIMARY KEY,\n    name TEXT NOT NULL,\n    type TEXT NOT NULL,\n    body TEXT NOT NULL,\n    is_default BOOLEAN DEFAULT false,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 9. Activities / Audit Logs Table\nCREATE TABLE IF NOT EXISTS public.activities (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,\n    type TEXT NOT NULL,\n    text TEXT NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- Indexes for lightning fast queries\nCREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);\nCREATE INDEX IF NOT EXISTS idx_policies_customer_id ON public.policies(customer_id);\nCREATE INDEX IF NOT EXISTS idx_policies_renewal_due_date ON public.policies(renewal_due_date);\nCREATE INDEX IF NOT EXISTS idx_policies_status ON public.policies(status);\nCREATE INDEX IF NOT EXISTS idx_family_customer_id ON public.family_members(customer_id);\nCREATE INDEX IF NOT EXISTS idx_reminders_due_at ON public.reminders(due_at);\nCREATE INDEX IF NOT EXISTS idx_reminders_status ON public.reminders(status);\nCREATE INDEX IF NOT EXISTS idx_documents_customer_id ON public.documents(customer_id);\nCREATE INDEX IF NOT EXISTS idx_documents_policy_id ON public.documents(policy_id);\nCREATE INDEX IF NOT EXISTS idx_documents_type ON public.documents(document_type);\n\n-- Access control\n-- CRM data holds customer personal and policy details, so the public (anon) key\n-- alone must never read or write it. Only signed-in Supabase Auth users whose\n-- confirmed email is listed in public.crm_members get access.\n--\n-- Add an advisor:  INSERT INTO public.crm_members (email) VALUES ('advisor@example.com');\n-- (Create their login first: Supabase dashboard -> Authentication -> Users -> Add user.)\n\nCREATE TABLE IF NOT EXISTS public.crm_members (\n    email TEXT PRIMARY KEY,\n    role TEXT NOT NULL DEFAULT 'advisor',\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\nALTER TABLE public.crm_members ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON public.crm_members FROM anon, authenticated;\n\n-- Lives in a private schema so it is not callable through the REST API.\nCREATE SCHEMA IF NOT EXISTS private;\nREVOKE ALL ON SCHEMA private FROM PUBLIC, anon;\nGRANT USAGE ON SCHEMA private TO authenticated;\n\nCREATE OR REPLACE FUNCTION private.is_crm_member()\nRETURNS BOOLEAN\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = ''\nAS $$\n    SELECT EXISTS (\n        SELECT 1\n        FROM auth.users u\n        JOIN public.crm_members m ON lower(m.email) = lower(u.email)\n        WHERE u.id = auth.uid()\n          AND u.email_confirmed_at IS NOT NULL\n    );\n$$;\nREVOKE ALL ON FUNCTION private.is_crm_member() FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION private.is_crm_member() TO authenticated;\n\nALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.porting_reminders ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;\n\nDO $$\nDECLARE\n    t TEXT;\nBEGIN\n    FOREACH t IN ARRAY ARRAY['customers', 'policies', 'family_members', 'appointments', 'reminders',\n                             'documents', 'porting_reminders', 'message_templates', 'activities']\n    LOOP\n        -- Remove the old wide-open policy from earlier versions of this schema.\n        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Anon public access to ' || t, t);\n        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'CRM members full access', t);\n        EXECUTE format(\n            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT private.is_crm_member())) WITH CHECK ((SELECT private.is_crm_member()))',\n            'CRM members full access', t);\n        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);\n        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);\n    END LOOP;\nEND $$;\n\n-- Live updates for the web portal (respects the policies above).\nDO $$\nDECLARE\n    t TEXT;\nBEGIN\n    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN\n        FOREACH t IN ARRAY ARRAY['customers', 'policies', 'family_members', 'appointments', 'documents']\n        LOOP\n            IF NOT EXISTS (\n                SELECT 1 FROM pg_publication_tables\n                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t\n            ) THEN\n                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);\n            END IF;\n        END LOOP;\n    END IF;\nEND $$;\n";
  function isPlaceholderUrl(url) {
    if (!url) return true;
    const clean = String(url).toLowerCase().trim();
    return clean.includes('insureclub-sync.supabase.co') ||
           clean.includes('example.supabase.co') ||
           clean.includes('placeholder') ||
           clean.includes('your-project') ||
           clean.includes('xyz.supabase.co') ||
           clean === 'https://' ||
           clean === 'http://';
  }


  const DEFAULT_SUPABASE = {
    url: Auth ? Auth.PROJECT_URL : 'https://pzezoumopzwczakpsdlk.supabase.co',
    anonKey: Auth ? Auth.PUBLISHABLE_KEY : 'sb_publishable_M6hWtVUT1bwaAkV2Ma6VKw_OzToQzvz',
    autoSync: true,
    lastSyncAt: null,
    status: 'Ready (Auto-sync active)'
  };

  function baseState() {
    return {
      schemaVersion: 2,
      updatedAt: isoNow(),
      advisorName: 'Manpreet Singh',
      customers: [],
      familyMembers: [],
      policies: [],
      policyHistory: [],
      reminders: [],
      appointments: [],
      activities: [],
      companies: [],
      products: [],
      categories: [],
      portingReminders: [],
      documents: [],
      outbox: [],
      syncState: 'synced',
      supabase: {
        url: DEFAULT_SUPABASE.url,
        anonKey: DEFAULT_SUPABASE.anonKey,
        autoSync: true,
        lastSyncAt: null,
        status: 'Ready (Auto-sync active)'
      },
      backupMetadata: {},
      messageTemplates: [
        { id: uid('tpl'), type: 'Birthday', name: 'Birthday greeting', body: 'Dear {{customer_name}}, wishing you a very happy birthday, good health and a wonderful year ahead. Warm regards, {{agent_name}}', isDefault: true },
        { id: uid('tpl'), type: 'Renewal', name: 'Policy renewal', body: 'Dear {{customer_name}}, your {{company_name}} {{product_name}} policy {{policy_number}} is due for renewal on {{renewal_date}}. The premium is {{premium}}. Please let me know how I can assist. Regards, {{agent_name}}', isDefault: true },
        { id: uid('tpl'), type: 'Anniversary', name: 'Anniversary greeting', body: 'Dear {{customer_name}}, warm wishes to you and your family on your anniversary. Regards, {{agent_name}}', isDefault: true },
        { id: uid('tpl'), type: 'Appointment request', name: 'Appointment request', body: 'Dear {{customer_name}}, may we schedule a discussion on {{appointment_date}} regarding your insurance requirements? Regards, {{agent_name}}', isDefault: true }
      ]
    };
  }

  function loadState() {
    let s;
    try {
      const stored = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      if (stored?.schemaVersion >= 2) {
        ARRAYS.forEach(k => stored[k] = Array.isArray(stored[k]) ? stored[k] : []);
        stored.outbox = Array.isArray(stored.outbox) ? stored.outbox : [];
        stored.syncState = stored.outbox.length > 0 ? 'pending' : 'synced';
        stored.supabase = stored.supabase || {};
        if (!stored.supabase.url || stored.supabase.url.replace(/\/+$/, '') === LEGACY_PLACEHOLDER_URL) {
          stored.supabase.url = DEFAULT_SUPABASE.url;
          stored.supabase.anonKey = DEFAULT_SUPABASE.anonKey;
          stored.supabase.status = 'Ready (Auto-sync active)';
        }
        if (stored.supabase.autoSync === undefined) {
          stored.supabase.autoSync = true;
        }
        s = stored;
      }
    } catch {}
    if (!s) {
      s = baseState();
      try { s.customers = JSON.parse(localStorage.getItem(LEGACY.customers) || '[]').map(x => ({ ...x, createdAt: x.createdAt || isoNow() })); } catch {}
      try { s.policies = JSON.parse(localStorage.getItem(LEGACY.policies) || '[]').map(x => ({ ...x, companyName: x.companyName || x.provider || '', productName: x.productName || x.planName || '', categoryName: x.categoryName || '', startDate: x.startDate || x.createdAt?.slice(0, 10) || today(), status: /renewed/i.test(x.status || '') ? 'Renewed' : 'Active' })); } catch {}
      try { s.appointments = JSON.parse(localStorage.getItem(LEGACY.meetings) || '[]').map(x => ({ ...x, purpose: x.purpose || x.title || 'Meeting', reminderAt: x.reminderAt || `${x.date}T09:00`, status: x.status || 'Scheduled' })); } catch {}
      s.advisorName = localStorage.getItem(LEGACY.advisor) || s.advisorName;
    }

    // Auto-migrate legacy policy documents into state.documents if needed
    s.documents = Array.isArray(s.documents) ? s.documents : [];
    s.policies.forEach(p => {
      if (p.hasDocument && !s.documents.some(d => d.policyId === p.id)) {
        s.documents.push({
          id: `doc-pol-${p.id}`,
          customerId: p.customerId,
          customerName: p.customerName || '',
          policyId: p.id,
          familyMemberId: null,
          documentType: 'Policy Document',
          title: `${p.companyName || 'Policy'} ${p.productName || ''} Schedule`,
          fileName: p.documentName || `${p.policyNumber || 'Policy'}.pdf`,
          fileSize: 0,
          mimeType: 'application/pdf',
          createdAt: p.documentUpdatedAt || p.createdAt || isoNow(),
          updatedAt: isoNow()
        });
      }
    });

    return s;
  }

  let state = loadState(),
      activeRoute = 'home',
      activeReminderFilter = 'Today',
      activePolicyFilter = 'Active',
      activeDocumentFilter = 'All',
      profile = { customerId: null, tab: 'Overview' },
      formSubmit = null,
      pendingDocUpload = null,
      pendingImportSummary = null;

  function addActivity(customerId, text, type = 'Activity') {
    if (!customerId) return;
    state.activities.unshift({ id: uid('act'), customerId, type, text, createdAt: isoNow() });
  }

  function ensureReference(name, key) {
    const value = String(name || '').trim();
    if (!value) return;
    const list = state[key];
    if (!list.some(x => x.name.toLowerCase() === value.toLowerCase())) list.push({ id: uid(key.slice(0, 3)), name: value });
  }

  function annualDate(v) {
    if (!v) return null;
    const source = new Date(`${v}T12:00:00`), now = new Date();
    let d = new Date(now.getFullYear(), source.getMonth(), source.getDate());
    if (dateOnly(d) < today()) d = new Date(now.getFullYear() + 1, source.getMonth(), source.getDate());
    return dateOnly(d);
  }

  function ensureAutomaticReminders() {
    const desired = [];
    state.customers.forEach(c => [['Birthday', c.dateOfBirth], ['Anniversary', c.anniversaryDate]].forEach(([type, v]) => {
      const due = annualDate(v);
      if (due) desired.push({ id: `auto-${type}-${c.id}-${due}`, customerId: c.id, customerName: c.name, type, activity: `${type} message`, dueAt: `${due}T08:00`, status: 'Pending', auto: true });
    }));
    state.familyMembers.forEach(f => {
      const due = annualDate(f.dateOfBirth), c = customerBy(f.customerId);
      if (due && c) desired.push({ id: `auto-Family-${f.id}-${due}`, customerId: c.id, customerName: c.name, familyMemberId: f.id, type: 'Birthday', activity: `Birthday message · ${f.fullName}`, dueAt: `${due}T08:00`, status: 'Pending', auto: true });
    });
    state.policies.filter(p => p.status === 'Active' && p.renewalDueDate).forEach(p => [30, 15, 7, 3, 0].forEach(lead => {
      const d = new Date(`${p.renewalDueDate}T12:00:00`);
      d.setDate(d.getDate() - lead);
      desired.push({ id: `auto-Renewal-${p.id}-${p.renewalDueDate}-${lead}`, customerId: p.customerId, customerName: p.customerName, policyId: p.id, type: 'Renewal', activity: lead ? `Renewal · ${lead} days remaining` : 'Renewal due today', dueAt: `${dateOnly(d)}T09:00`, status: 'Pending', auto: true });
    }));
    state.appointments.filter(a => !['Completed', 'Cancelled'].includes(a.status)).forEach(a => desired.push({ id: `auto-Appointment-${a.id}-${a.reminderAt}`, customerId: a.customerId, customerName: a.customerName, appointmentId: a.id, type: 'Appointment', activity: a.purpose, dueAt: a.reminderAt, status: 'Pending', auto: true, notes: a.notes || '' }));
    state.portingReminders.filter(p => !['Ported', 'Not Interested', 'Cancelled'].includes(p.status)).forEach(p => desired.push({ id: `auto-Porting-${p.id}-${p.reminderDate}`, customerId: p.customerId, customerName: p.customerName, policyId: p.policyId, type: 'Porting', activity: 'Policy porting discussion', dueAt: `${p.reminderDate}T09:00`, status: 'Pending', auto: true, notes: p.notes || '' }));
    const completed = new Map(state.reminders.filter(r => r.status === 'Completed' || r.snoozedFrom).map(r => [r.id, r]));
    const manual = state.reminders.filter(r => !r.auto);
    state.reminders = [...manual, ...desired.map(r => completed.get(r.id) || r)];
  }

  function updateSyncUI() {
    const s = state.syncState || (state.outbox?.length ? 'pending' : 'synced');
    const outboxCount = (state.outbox || []).length;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const effectiveState = !isOnline && s !== 'syncing' ? 'offline' : s;

    // Topbar Pill
    const dot = $('#topbarSyncDot');
    const txt = $('#topbarSyncText');
    if (dot && txt) {
      dot.className = `sync-dot ${effectiveState}`;
      if (effectiveState === 'syncing') txt.textContent = 'Syncing…';
      else if (effectiveState === 'pending') txt.textContent = `${outboxCount} pending`;
      else if (effectiveState === 'offline') txt.textContent = 'Offline';
      else txt.textContent = 'Synced';
    }

    // Settings Banner
    const banner = $('#syncStatusBanner');
    const bannerDot = $('#syncBannerDot');
    const bannerTxt = $('#syncBannerText');
    if (banner && bannerDot && bannerTxt) {
      banner.className = `sync-status-banner ${effectiveState}`;
      bannerDot.className = `sync-dot ${effectiveState}`;
      if (effectiveState === 'syncing') bannerTxt.textContent = 'Synchronizing records…';
      else if (effectiveState === 'pending') bannerTxt.textContent = `${outboxCount} change${outboxCount === 1 ? '' : 's'} pending`;
      else if (effectiveState === 'offline') bannerTxt.textContent = 'Offline · Changes will sync when reconnected';
      else bannerTxt.textContent = 'All changes synchronized';
    }

    if ($('#supabaseLastSync')) {
      $('#supabaseLastSync').textContent = state.supabase?.lastSyncAt
        ? `Last cloud sync: ${fmtDateTime(state.supabase.lastSyncAt)}`
        : 'Integrated by default · Auto-sync active';
    }
  }

  function queueOutbox(bucket, action, recordId, payload) {
    state.outbox = Array.isArray(state.outbox) ? state.outbox : [];
    // Remove previous pending entry for this record in this bucket to coalesce mutations
    state.outbox = state.outbox.filter(item => !(item.bucket === bucket && item.recordId === recordId));
    state.outbox.push({
      id: uid('outbox'),
      bucket,
      action,
      recordId,
      payload,
      timestamp: isoNow()
    });
    state.syncState = 'pending';
    updateSyncUI();
    if (state.supabase?.autoSync !== false) {
      triggerAutoSync(1000);
    }
  }

  let autoSyncDebounce = null;
  function triggerAutoSync(delay = 1000) {
    if (!state.supabase?.autoSync || !state.supabase?.url || !state.supabase?.anonKey) return;
    clearTimeout(autoSyncDebounce);
    autoSyncDebounce = setTimeout(() => {
      performSync(false);
    }, delay);
  }

  function persist(reason = 'change', quiet = false) {
    ensureAutomaticReminders();
    state.updatedAt = isoNow();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    if (window.InsureClubNative?.syncReminders) window.InsureClubNative.syncReminders(JSON.stringify(state));
    if (window.InsureClubNative?.backupNow) window.InsureClubNative.backupNow(JSON.stringify(state), reason);

    if (reason !== 'supabase-pulled' && state.supabase?.autoSync && state.supabase.url && state.supabase.anonKey) {
      triggerAutoSync();
    }

    renderAll();
    updateSyncUI();
    if (!quiet) toast('Saved securely');
  }
  window.InsureClubAppBackup = reason => {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.InsureClubNative?.backupNow?.(JSON.stringify(state), reason || 'app-backgrounded');
  };

  function toast(message) {
    const e = $('#toast');
    e.textContent = message;
    e.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => e.classList.remove('show'), 2300);
  }

  function empty(title, text) {
    return `<div class="empty"><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;
  }

  function route(name) {
    activeRoute = name;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
    $$('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.route === name));
    window.scrollTo(0, 0);
    renderAll();
  }

  function openForm(title, eyebrow, html, onSubmit) {
    $('#modalTitle').textContent = title;
    $('#modalEyebrow').textContent = eyebrow;
    $('#dynamicForm').innerHTML = html;
    formSubmit = onSubmit;
    $('#formModal').classList.add('open');
  }

  function closeForm() {
    $('#formModal').classList.remove('open');
    formSubmit = null;
  }

  function choice(title, text, actions) {
    $('#choiceTitle').textContent = title;
    $('#choiceText').textContent = text;
    $('#choiceActions').innerHTML = actions.map(a => `<button data-choice="${esc(a.id)}" class="${a.danger ? 'danger-outline' : ''}">${esc(a.label)}</button>`).join('');
    $('#choiceModal').classList.add('open');
  }

  function closeChoice() {
    $('#choiceModal').classList.remove('open');
  }

  // --- Supabase Cloud Sync Implementation ---
  // NOTE: In accordance with local-first requirements, attached files like policies,
  // PAN cards, and birth certificates stay stored locally on device. Only database
  // records and document metadata are synchronized with Supabase.
  const SupabaseSync = {
    async testConnection(url, key) {
      if (!url || !key) throw new Error('Enter both Supabase URL and Anon Key');
      const cleanUrl = url.replace(/\/+$/, '');
      if (isPlaceholderUrl(cleanUrl)) {
        throw new Error('The default domain insureclub-sync.supabase.co is a placeholder for local offline storage.\n\nTo connect live cloud sync with the website, enter your active Supabase Project URL (e.g. https://your-id.supabase.co) and public anon key.');
      }
      const res = await fetch(`${cleanUrl}/rest/v1/customers?select=count&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase returned status ${res.status}: ${text || res.statusText}`);
      }
      return true;
    },

    async pushAll(url, key, silent = false) {
      const targetUrl = url || state.supabase?.url || DEFAULT_SUPABASE.url;
      const targetKey = key || state.supabase?.anonKey || DEFAULT_SUPABASE.anonKey;
      if (!targetUrl || !targetKey || isPlaceholderUrl(targetUrl)) {
        if (!silent && !isPlaceholderUrl(targetUrl)) throw new Error('Enter Supabase URL and Anon Key in Settings');
        return false;
      }
      try {
        const cleanUrl = targetUrl.replace(/\/+$/, '');
        const headers = {
          'apikey': targetKey,
          'Authorization': `Bearer ${targetKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        };

        // 1. Customers
        if (state.customers.length) {
          const payload = state.customers.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone || null,
            city: c.city || null,
            date_of_birth: c.dateOfBirth || null,
            anniversary_date: c.anniversaryDate || null,
            notes: c.notes || null,
            created_at: c.createdAt || isoNow(),
            updated_at: c.updatedAt || isoNow()
          }));
          await fetch(`${cleanUrl}/rest/v1/customers`, { method: 'POST', headers, body: JSON.stringify(payload) });
        }

        // 2. Policies (All active, renewed, and historical policies are preserved!)
        if (state.policies.length) {
          const payload = state.policies.map(p => ({
            id: p.id,
            customer_id: p.customerId,
            customer_name: p.customerName || null,
            company_name: p.companyName,
            product_name: p.productName,
            category_name: p.categoryName || null,
            policy_number: p.policyNumber,
            start_date: p.startDate || null,
            renewal_due_date: p.renewalDueDate,
            premium_amount: Number(p.premiumAmount || 0),
            sum_insured: Number(p.sumInsured || 0),
            status: p.status || 'Active',
            previous_policy_id: p.previousPolicyId || null,
            notes: p.notes || null,
            has_document: Boolean(p.hasDocument),
            document_name: p.documentName || null,
            created_at: p.createdAt || isoNow(),
            updated_at: p.updatedAt || isoNow()
          }));
          await fetch(`${cleanUrl}/rest/v1/policies`, { method: 'POST', headers, body: JSON.stringify(payload) });
        }

        // 3. Family Members
        if (state.familyMembers.length) {
          const payload = state.familyMembers.map(f => ({
            id: f.id,
            customer_id: f.customerId,
            full_name: f.fullName,
            relationship: f.relationship,
            date_of_birth: f.dateOfBirth || null,
            mobile: f.mobile || null,
            notes: f.notes || null,
            created_at: f.createdAt || isoNow()
          }));
          await fetch(`${cleanUrl}/rest/v1/family_members`, { method: 'POST', headers, body: JSON.stringify(payload) });
        }

        // 4. Appointments
        if (state.appointments.length) {
          const payload = state.appointments.map(a => ({
            id: a.id,
            customer_id: a.customerId || null,
            customer_name: a.customerName || null,
            date: a.date,
            time: a.time || null,
            purpose: a.purpose,
            product_name: a.productName || null,
            company_name: a.companyName || null,
            reminder_at: a.reminderAt || null,
            status: a.status || 'Scheduled',
            notes: a.notes || null,
            follow_up_at: a.followUpAt || null
          }));
          await fetch(`${cleanUrl}/rest/v1/appointments`, { method: 'POST', headers, body: JSON.stringify(payload) });
        }

        // 5. Document Metadata ONLY (Binaries remain 100% local on device)
        if (state.documents && state.documents.length) {
          const payload = state.documents.map(d => ({
            id: d.id,
            customer_id: d.customerId,
            customer_name: d.customerName || null,
            policy_id: d.policyId || null,
            family_member_id: d.familyMemberId || null,
            document_type: d.documentType,
            title: d.title,
            file_name: d.fileName,
            file_size: Number(d.fileSize || 0),
            mime_type: d.mimeType || 'application/pdf',
            created_at: d.createdAt || isoNow(),
            updated_at: d.updatedAt || isoNow()
          }));
          await fetch(`${cleanUrl}/rest/v1/documents`, { method: 'POST', headers, body: JSON.stringify(payload) });
        }

        state.supabase.lastSyncAt = isoNow();
        state.supabase.status = 'Connected';
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
        if (!silent) toast('Sync to Supabase complete ✓');
        return true;
      } catch (err) {
        if (!silent) throw err;
        console.warn('Silent auto-sync push notice:', err);
        return false;
      }
    },

    async pullAll(url, key, silent = false) {
      const targetUrl = url || state.supabase?.url || DEFAULT_SUPABASE.url;
      const targetKey = key || state.supabase?.anonKey || DEFAULT_SUPABASE.anonKey;
      if (!targetUrl || !targetKey || isPlaceholderUrl(targetUrl)) {
        if (!silent && !isPlaceholderUrl(targetUrl)) throw new Error('Enter Supabase URL and Anon Key in Settings');
        return false;
      }
      try {
        const cleanUrl = targetUrl.replace(/\/+$/, '');
        const headers = {
          'apikey': targetKey,
          'Authorization': `Bearer ${targetKey}`,
          'Accept': 'application/json'
        };

        const [cRes, pRes, fRes, aRes, dRes] = await Promise.all([
          fetch(`${cleanUrl}/rest/v1/customers?select=*`, { headers }),
          fetch(`${cleanUrl}/rest/v1/policies?select=*`, { headers }),
          fetch(`${cleanUrl}/rest/v1/family_members?select=*`, { headers }),
          fetch(`${cleanUrl}/rest/v1/appointments?select=*`, { headers }),
          fetch(`${cleanUrl}/rest/v1/documents?select=*`, { headers })
        ]);

        let pulledCount = 0;
        if (cRes.ok) {
          const list = await cRes.json();
          const map = new Map(state.customers.map(x => [x.id, x]));
          list.forEach(rc => {
            map.set(rc.id, {
              ...(map.get(rc.id) || {}),
              id: rc.id,
              name: rc.name,
              phone: rc.phone || '',
              city: rc.city || '',
              dateOfBirth: rc.date_of_birth || '',
              anniversaryDate: rc.anniversary_date || '',
              notes: rc.notes || '',
              createdAt: rc.created_at,
              updatedAt: rc.updated_at
            });
          });
          state.customers = [...map.values()];
          pulledCount += list.length;
        }

        if (pRes.ok) {
          const list = await pRes.json();
          const map = new Map(state.policies.map(x => [x.id, x]));
          list.forEach(rp => {
            map.set(rp.id, {
              ...(map.get(rp.id) || {}),
              id: rp.id,
              customerId: rp.customer_id,
              customerName: rp.customer_name || '',
              companyName: rp.company_name,
              productName: rp.product_name,
              categoryName: rp.category_name || '',
              policyNumber: rp.policy_number,
              startDate: rp.start_date || '',
              renewalDueDate: rp.renewal_due_date,
              premiumAmount: Number(rp.premium_amount || 0),
              sumInsured: Number(rp.sum_insured || 0),
              status: rp.status || 'Active',
              previousPolicyId: rp.previous_policy_id || null,
              notes: rp.notes || '',
              hasDocument: rp.has_document || false,
              documentName: rp.document_name || '',
              createdAt: rp.created_at,
              updatedAt: rp.updated_at
            });
          });
          state.policies = [...map.values()];
          pulledCount += list.length;
        }

        if (fRes.ok) {
          const list = await fRes.json();
          const map = new Map(state.familyMembers.map(x => [x.id, x]));
          list.forEach(rf => {
            map.set(rf.id, {
              ...(map.get(rf.id) || {}),
              id: rf.id,
              customerId: rf.customer_id,
              fullName: rf.full_name,
              relationship: rf.relationship,
              dateOfBirth: rf.date_of_birth || '',
              mobile: rf.mobile || '',
              notes: rf.notes || '',
              createdAt: rf.created_at
            });
          });
          state.familyMembers = [...map.values()];
        }

        if (aRes.ok) {
          const list = await aRes.json();
          const map = new Map(state.appointments.map(x => [x.id, x]));
          list.forEach(ra => {
            map.set(ra.id, {
              ...(map.get(ra.id) || {}),
              id: ra.id,
              customerId: ra.customer_id,
              customerName: ra.customer_name || '',
              date: ra.date,
              time: ra.time || '',
              purpose: ra.purpose,
              productName: ra.product_name || '',
              companyName: ra.company_name || '',
              reminderAt: ra.reminder_at || '',
              status: ra.status || 'Scheduled',
              notes: ra.notes || '',
              followUpAt: ra.follow_up_at || ''
            });
          });
          state.appointments = [...map.values()];
        }

        if (dRes.ok) {
          const list = await dRes.json();
          state.documents = Array.isArray(state.documents) ? state.documents : [];
          const map = new Map(state.documents.map(x => [x.id, x]));
          list.forEach(rd => {
            map.set(rd.id, {
              ...(map.get(rd.id) || {}),
              id: rd.id,
              customerId: rd.customer_id,
              customerName: rd.customer_name || '',
              policyId: rd.policy_id || null,
              familyMemberId: rd.family_member_id || null,
              documentType: rd.document_type,
              title: rd.title,
              fileName: rd.file_name,
              fileSize: Number(rd.file_size || 0),
              mimeType: rd.mime_type || 'application/pdf',
              createdAt: rd.created_at,
              updatedAt: rd.updated_at
            });
          });
          state.documents = [...map.values()];
        }

        state.supabase.lastSyncAt = isoNow();
        state.supabase.status = 'Connected';
        persist('supabase-pulled', true);
        if (!silent) toast(`Pulled ${pulledCount} records from Supabase`);
        return true;
      } catch (err) {
        if (!silent) throw err;
        console.warn('Silent auto-sync pull notice:', err);
        return false;
      }
    }
  };

  let isSyncing = false;
  async function performSync(manual = false) {
    if (isSyncing) return;
    const url = state.supabase?.url || DEFAULT_SUPABASE.url;
    const key = state.supabase?.anonKey || DEFAULT_SUPABASE.anonKey;
    if (!url || !key) {
      if (manual) toast('Supabase credentials missing');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      state.syncState = 'offline';
      updateSyncUI();
      if (manual) toast('Device is offline');
      return;
    }
    // The live cloud project only accepts signed-in advisors. Changes wait safely in the
    // local outbox until then.
    if (Auth && url.replace(/\/+$/, '') === Auth.PROJECT_URL && !Auth.isSignedIn()) {
      state.supabase.status = 'Sign in required';
      updateSyncUI();
      if (manual) Auth.prompt();
      return;
    }

    isSyncing = true;
    state.syncState = 'syncing';
    updateSyncUI();

    try {
      const cleanUrl = url.replace(/\/+$/, '');
      const headers = {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      };

      // 1. Process Outbox Queue (Offline mutations to be applied to Supabase)
      state.outbox = Array.isArray(state.outbox) ? state.outbox : [];
      if (state.outbox.length > 0) {
        const queue = [...state.outbox];
        for (const item of queue) {
          try {
            if (item.action === 'upsert' && item.payload) {
              const res = await fetch(`${cleanUrl}/rest/v1/${item.bucket}`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify(item.payload)
              });
              if (!res.ok) {
                console.warn(`Outbox push failed for ${item.bucket}/${item.recordId}:`, res.status);
              } else {
                state.outbox = state.outbox.filter(x => x.id !== item.id);
              }
            } else if (item.action === 'delete') {
              const res = await fetch(`${cleanUrl}/rest/v1/${item.bucket}?id=eq.${encodeURIComponent(item.recordId)}`, {
                method: 'DELETE',
                headers
              });
              if (!res.ok && res.status !== 404) {
                console.warn(`Outbox delete failed for ${item.bucket}/${item.recordId}:`, res.status);
              } else {
                state.outbox = state.outbox.filter(x => x.id !== item.id);
              }
            }
          } catch (itemErr) {
            console.warn('Outbox item dispatch error:', itemErr);
          }
        }
      }

      // If manual sync was triggered and outbox is clear, guarantee full push of existing records
      if (manual && state.outbox.length === 0) {
        await SupabaseSync.pushAll(url, key, true);
      }

      // 2. Pull remote updates from Supabase
      await SupabaseSync.pullAll(url, key, true);

      state.supabase.lastSyncAt = isoNow();
      state.supabase.status = 'Connected';
      state.syncState = state.outbox.length > 0 ? 'pending' : 'synced';
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      updateSyncUI();
      renderAll();

      if (manual) {
        toast('All changes synchronized ✓');
      }
    } catch (err) {
      console.warn('performSync error:', err);
      state.syncState = state.outbox.length > 0 ? 'pending' : 'synced';
      updateSyncUI();
      if (manual) toast(`Sync notice: ${err.message || 'Check connection'}`);
    } finally {
      isSyncing = false;
      updateSyncUI();
    }
  }

  let realtimeWs = null;
  let realtimeHeartbeat = null;
  let realtimeReconnectTimer = null;
  let wsMsgRef = 1;

  function initSupabaseRealtime() {
    const url = state.supabase?.url || DEFAULT_SUPABASE.url;
    const key = state.supabase?.anonKey || DEFAULT_SUPABASE.anonKey;
    if (!state.supabase?.autoSync || !url || !key || isPlaceholderUrl(url)) return;
    if (typeof WebSocket === 'undefined') return;
    const isLive = Boolean(Auth) && url.replace(/\/+$/, '') === Auth.PROJECT_URL;
    if (isLive && !Auth.isSignedIn()) return;
    if (realtimeWs && (realtimeWs.readyState === WebSocket.OPEN || realtimeWs.readyState === WebSocket.CONNECTING)) return;

    try {
      const wsUrl = url.replace(/^http/, 'ws').replace(/\/+$/, '') + `/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
      realtimeWs = new WebSocket(wsUrl);

      realtimeWs.onopen = async () => {
        clearInterval(realtimeHeartbeat);
        // Realtime enforces the same row-level security, so join with the advisor's token.
        const accessToken = isLive ? await Auth.accessToken().catch(() => null) : null;
        if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;
        realtimeHeartbeat = setInterval(() => {
          if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
            realtimeWs.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(wsMsgRef++) }));
          }
        }, 25000);

        realtimeWs.send(JSON.stringify({
          topic: 'realtime:public',
          event: 'phx_join',
          payload: {
            ...(accessToken ? { access_token: accessToken } : {}),
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
      };

      realtimeWs.onmessage = evt => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === 'postgres_changes' && msg.payload?.data) {
            handleRealtimeEvent(msg.payload.data);
          }
        } catch (e) {
          console.warn('Realtime parse error:', e);
        }
      };

      realtimeWs.onclose = () => {
        clearInterval(realtimeHeartbeat);
        scheduleRealtimeReconnect();
      };

      realtimeWs.onerror = () => {
        try { realtimeWs.close(); } catch {}
      };
    } catch (e) {
      console.warn('Realtime init error:', e);
      scheduleRealtimeReconnect();
    }
  }

  function scheduleRealtimeReconnect() {
    clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = setTimeout(() => {
      if (state.supabase?.autoSync && navigator.onLine) {
        initSupabaseRealtime();
      }
    }, 10000);
  }

  function handleRealtimeEvent(data) {
    const { table, type, record, old_record } = data;
    const recId = record?.id || old_record?.id;
    if (!recId) return;

    // If there is an unpushed outbox change for this record, skip to preserve local draft
    const hasPendingOutbox = (state.outbox || []).some(o => o.bucket === table && o.recordId === recId);
    if (hasPendingOutbox) return;

    if (table === 'customers') {
      if (type === 'DELETE') {
        state.customers = state.customers.filter(c => c.id !== recId);
      } else if (record) {
        const mapped = {
          id: record.id,
          name: record.name,
          phone: record.phone || '',
          city: record.city || '',
          dateOfBirth: record.date_of_birth || '',
          anniversaryDate: record.anniversary_date || '',
          notes: record.notes || '',
          createdAt: record.created_at || isoNow(),
          updatedAt: record.updated_at || isoNow()
        };
        const idx = state.customers.findIndex(c => c.id === mapped.id);
        if (idx >= 0) state.customers[idx] = { ...state.customers[idx], ...mapped };
        else state.customers.unshift(mapped);
      }
    } else if (table === 'policies') {
      if (type === 'DELETE') {
        state.policies = state.policies.filter(p => p.id !== recId);
      } else if (record) {
        const existing = policyBy(record.id);
        const mapped = {
          id: record.id,
          customerId: record.customer_id,
          customerName: record.customer_name || existing?.customerName || '',
          companyName: record.company_name,
          productName: record.product_name,
          categoryName: record.category_name || '',
          policyNumber: record.policy_number,
          startDate: record.start_date || '',
          renewalDueDate: record.renewal_due_date,
          premiumAmount: Number(record.premium_amount || 0),
          sumInsured: Number(record.sum_insured || 0),
          status: record.status || 'Active',
          previousPolicyId: record.previous_policy_id || null,
          notes: record.notes || '',
          hasDocument: record.has_document || existing?.hasDocument || false,
          documentName: record.document_name || existing?.documentName || '',
          createdAt: record.created_at || isoNow(),
          updatedAt: record.updated_at || isoNow()
        };
        const idx = state.policies.findIndex(p => p.id === mapped.id);
        if (idx >= 0) state.policies[idx] = { ...state.policies[idx], ...mapped };
        else state.policies.unshift(mapped);
      }
    } else if (table === 'family_members') {
      if (type === 'DELETE') {
        state.familyMembers = state.familyMembers.filter(f => f.id !== recId);
      } else if (record) {
        const mapped = {
          id: record.id,
          customerId: record.customer_id,
          fullName: record.full_name,
          relationship: record.relationship,
          dateOfBirth: record.date_of_birth || '',
          mobile: record.mobile || '',
          notes: record.notes || '',
          createdAt: record.created_at || isoNow()
        };
        const idx = state.familyMembers.findIndex(f => f.id === mapped.id);
        if (idx >= 0) state.familyMembers[idx] = { ...state.familyMembers[idx], ...mapped };
        else state.familyMembers.unshift(mapped);
      }
    } else if (table === 'appointments') {
      if (type === 'DELETE') {
        state.appointments = state.appointments.filter(a => a.id !== recId);
      } else if (record) {
        const mapped = {
          id: record.id,
          customerId: record.customer_id || null,
          customerName: record.customer_name || '',
          date: record.date,
          time: record.time || '',
          purpose: record.purpose,
          productName: record.product_name || '',
          companyName: record.company_name || '',
          reminderAt: record.reminder_at || '',
          status: record.status || 'Scheduled',
          notes: record.notes || '',
          followUpAt: record.follow_up_at || ''
        };
        const idx = state.appointments.findIndex(a => a.id === mapped.id);
        if (idx >= 0) state.appointments[idx] = { ...state.appointments[idx], ...mapped };
        else state.appointments.unshift(mapped);
      }
    } else if (table === 'documents') {
      state.documents = Array.isArray(state.documents) ? state.documents : [];
      if (type === 'DELETE') {
        state.documents = state.documents.filter(d => d.id !== recId);
      } else if (record) {
        const existing = state.documents.find(d => d.id === record.id);
        const mapped = {
          id: record.id,
          customerId: record.customer_id,
          customerName: record.customer_name || existing?.customerName || '',
          policyId: record.policy_id || null,
          familyMemberId: record.family_member_id || null,
          documentType: record.document_type,
          title: record.title,
          fileName: record.file_name,
          fileSize: Number(record.file_size || 0),
          mimeType: record.mime_type || 'application/pdf',
          createdAt: record.created_at || isoNow(),
          updatedAt: record.updated_at || isoNow()
        };
        const idx = state.documents.findIndex(d => d.id === mapped.id);
        if (idx >= 0) state.documents[idx] = { ...state.documents[idx], ...mapped };
        else state.documents.unshift(mapped);
      }
    }

    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    renderAll();
  }

  function startAutoSyncEngine() {
    // 5-minute periodic background sync
    setInterval(() => {
      if (state.supabase?.autoSync && navigator.onLine) {
        performSync(false);
      }
    }, 5 * 60 * 1000);

    // Auto-sync when device regains network connectivity
    window.addEventListener('online', () => {
      updateSyncUI();
      if (state.supabase?.autoSync) {
        performSync(false);
        initSupabaseRealtime();
      }
    });

    window.addEventListener('offline', () => {
      state.syncState = 'offline';
      updateSyncUI();
    });

    // Auto-sync when app resumes or window regains focus
    const onResume = () => {
      if (state.supabase?.autoSync && navigator.onLine) {
        performSync(false);
        initSupabaseRealtime();
      }
    };
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onResume();
    });

    // Sync right after the advisor signs in; drop the live channel after sign-out.
    window.addEventListener('insureclub-auth-changed', e => {
      if (realtimeWs) {
        try { realtimeWs.close(); } catch {}
        realtimeWs = null;
      }
      renderSettings();
      if (e.detail?.signedIn) {
        toast(`Signed in as ${e.detail.email || 'advisor'}`);
        performSync(true);
        initSupabaseRealtime();
      }
    });

    // Initial sync and Realtime connection shortly after boot
    setTimeout(() => {
      updateSyncUI();
      if (state.supabase?.autoSync && navigator.onLine) {
        performSync(false);
        initSupabaseRealtime();
      }
    }, 1800);
  }

  function periodTotal(start, end) {
    return state.policies.filter(p => p.status === 'Active' && p.startDate && p.startDate >= start && p.startDate <= end).reduce((s, p) => s + Number(p.premiumAmount || 0), 0);
  }

  function periodRange(kind, offset = 0) {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth();
    let a, b;
    if (kind === 'month') {
      a = new Date(y, m + offset, 1);
      b = new Date(y, m + offset + 1, 0);
    } else if (kind === 'quarter') {
      const q = Math.floor(m / 3) * 3 + offset * 3;
      a = new Date(y, q, 1);
      b = new Date(y, q + 3, 0);
    } else {
      a = new Date(y + offset, 0, 1);
      b = new Date(y + offset, 11, 31);
    }
    return [dateOnly(a), dateOnly(b)];
  }

  function renderHome() {
    const first = state.advisorName.split(' ')[0] || 'Advisor', h = new Date().getHours();
    $('#welcomeTitle').innerHTML = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'},<br><em>${esc(first)}.</em>`;
    $('#todayLabel').innerHTML = `${new Date().toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()}<br>${new Date().getDate()} ${new Date().toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}`;
    $('#performanceCards').innerHTML = ['month', 'quarter', 'year'].map(k => {
      const [a, b] = periodRange(k), [pa, pb] = periodRange(k, -1), v = periodTotal(a, b), prev = periodTotal(pa, pb), delta = prev ? Math.round((v - prev) / prev * 100) : null;
      return `<button class="metric" data-performance="${k}"><strong>${money(v)}</strong><span>THIS ${k.toUpperCase()}</span><small>${delta === null ? 'No prior comparison' : `${delta >= 0 ? '+' : ''}${delta}% vs previous`}</small></button>`;
    }).join('');
    const pending = state.reminders.filter(r => r.status !== 'Completed'),
          todayItems = pending.filter(r => String(r.dueAt).slice(0, 10) === today()),
          upcoming = pending.filter(r => {
            const d = daysBetween(String(r.dueAt).slice(0, 10), today());
            return d >= 0 && d <= 30;
          }).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    $('#todayActivities').innerHTML = todayItems.length ? todayItems.slice(0, 5).map(reminderCard).join('') : empty('Today is clear', 'No pending activities due today.');
    $('#upcomingList').innerHTML = upcoming.length ? upcoming.slice(0, 5).map(reminderCard).join('') : empty('Nothing due soon', 'Upcoming renewals and appointments will appear here.');
  }

  function reminderCard(r) {
    const c = customerBy(r.customerId), over = String(r.dueAt).slice(0, 10) < today() && r.status !== 'Completed';
    return `<article class="activity-card"><span class="activity-icon">${({ Birthday: '🎂', Anniversary: '♡', Renewal: '₹', Appointment: '◷', Porting: '⇄' }[r.type] || '✓')}</span><div class="activity-copy"><strong>${esc(r.customerName || c?.name || 'General')} · ${esc(r.activity || r.type)}</strong><span>${fmtDateTime(r.dueAt)}${r.notes ? ` · ${esc(r.notes)}` : ''}</span>${activeRoute === 'reminders' ? `<div class="reminder-actions"><button data-call="${esc(c?.phone || '')}">Call</button><button data-message-reminder="${r.id}">Message</button><button data-fix-appointment="${r.id}">Fix appointment</button><button data-snooze="${r.id}">Snooze</button><button data-complete-reminder="${r.id}">Complete</button><button data-open-customer="${esc(r.customerId || '')}">Open</button></div>` : ''}</div><span class="status ${over ? 'overdue' : r.status === 'Completed' ? 'done' : ''}">${esc(r.status === 'Completed' ? 'Done' : over ? 'Overdue' : r.type)}</span></article>`;
  }

  function renderClients() {
    const term = ($('#clientSearch')?.value || '').trim().toLowerCase();
    const filtered = state.customers.filter(c => [c.name, c.phone, c.city, ...state.familyMembers.filter(f => f.customerId === c.id).map(f => f.fullName)].some(v => String(v || '').toLowerCase().includes(term)));
    $('#clientList').classList.toggle('hidden', Boolean(profile.customerId));
    if (profile.customerId) {
      renderProfile();
      return;
    }
    $('#clientList').innerHTML = filtered.length ? filtered.map(c => {
      const pol = state.policies.filter(p => p.customerId === c.id && p.status === 'Active'),
            fam = state.familyMembers.filter(f => f.customerId === c.id),
            docs = state.documents.filter(d => d.customerId === c.id);
      return `<article class="client-card"><div class="card-head"><span class="client-avatar">${initials(c.name)}</span><div class="card-main"><strong>${esc(c.name)}</strong><span>${esc(c.phone || 'No phone')} · ${esc(c.city || 'City not set')}</span></div><div class="card-actions"><button class="icon-button" data-whatsapp="${c.id}">◉</button><button class="icon-button" data-open-customer="${c.id}">›</button></div></div><div class="card-foot"><span>${fam.length} family · ${docs.length} local doc${docs.length === 1 ? '' : 's'}</span><span>${pol.length} active polic${pol.length === 1 ? 'y' : 'ies'} · ${money(pol.reduce((s, p) => s + Number(p.premiumAmount || 0), 0))}</span></div></article>`;
    }).join('') : empty(term ? 'No matching customer' : 'Your CRM is ready', term ? 'Try another name or mobile number.' : 'Add your first real customer.');
  }

  function renderProfile() {
    const c = customerBy(profile.customerId);
    if (!c) {
      profile.customerId = null;
      renderClients();
      return;
    }
    const panel = $('#clientProfile');
    panel.classList.remove('hidden');
    const tabs = ['Overview', 'Family', 'Policies', 'Documents', 'Appointments', 'Reminders', 'Policy History', 'Activity History'];
    panel.innerHTML = `<div class="profile-hero"><button class="icon-button" data-close-profile>←</button><h2>${esc(c.name)}</h2><p>${esc(c.phone || 'No phone')} · ${esc(c.city || 'City not set')}</p></div><div class="profile-tabs">${tabs.map(t => `<button data-profile-tab="${t}" class="${profile.tab === t ? 'active' : ''}">${t}</button>`).join('')}</div><div class="profile-content">${profileTab(c)}</div>`;
  }

  function profileTab(c) {
    const allPols = state.policies.filter(p => p.customerId === c.id),
          active = allPols.filter(p => p.status === 'Active'),
          renewed = allPols.filter(p => p.status === 'Renewed' || p.status === 'Historical'),
          fam = state.familyMembers.filter(f => f.customerId === c.id),
          apps = state.appointments.filter(a => a.customerId === c.id),
          rems = state.reminders.filter(r => r.customerId === c.id),
          hist = state.policyHistory.filter(p => p.customerId === c.id),
          acts = state.activities.filter(a => a.customerId === c.id),
          docs = state.documents.filter(d => d.customerId === c.id);

    if (profile.tab === 'Overview') {
      const nextRenewal = active.filter(p => p.renewalDueDate).sort((a, b) => a.renewalDueDate.localeCompare(b.renewalDueDate))[0],
            nextApp = apps.filter(a => a.status === 'Scheduled').sort((a, b) => a.date.localeCompare(b.date))[0];
      return `<div class="info-grid">
        <div class="info-box"><span>Date of birth</span><strong>${fmtDate(c.dateOfBirth)}</strong></div>
        <div class="info-box"><span>Anniversary</span><strong>${fmtDate(c.anniversaryDate)}</strong></div>
        <div class="info-box"><span>Family members</span><strong>${fam.length}</strong></div>
        <div class="info-box"><span>Active policies</span><strong>${active.length}</strong></div>
        <div class="info-box"><span>Total active premium</span><strong>${money(active.reduce((s, p) => s + Number(p.premiumAmount || 0), 0))}</strong></div>
        <div class="info-box"><span>Older / Renewed policies</span><strong>${renewed.length} (preserved)</strong></div>
        <div class="info-box"><span>Attached local docs</span><strong>${docs.length}</strong></div>
        <div class="info-box"><span>Next renewal</span><strong>${fmtDate(nextRenewal?.renewalDueDate)}</strong></div>
      </div>
      <div class="inline-actions">
        <button data-edit-customer="${c.id}">Edit customer</button>
        <button data-family-new="${c.id}">Add family</button>
        <button data-policy-new="${c.id}">Add policy</button>
        <button data-doc-new="${c.id}">＋ Attach document (PAN / Birth Cert / Policy)</button>
        <button data-appointment-new="${c.id}">Appointment</button>
        <button class="danger" data-delete-customer="${c.id}">Delete</button>
      </div>`;
    }

    if (profile.tab === 'Family') {
      return `<div class="inline-actions"><button data-family-new="${c.id}">Add family member</button></div>
        ${fam.length ? fam.map(f => record(`${f.fullName} · ${f.relationship}`, `DOB ${fmtDate(f.dateOfBirth)} · Age ${age(f.dateOfBirth)}${f.mobile ? ` · ${f.mobile}` : ''}`, `<button data-family-edit="${f.id}">Edit</button><button data-doc-family="${f.id}">Attach Birth Cert / ID</button><button class="danger" data-family-delete="${f.id}">Delete</button>`)).join('') : empty('No family members', 'Add family members to include their birthdays.')}`;
    }

    if (profile.tab === 'Policies') {
      let displayed = activePolicyFilter === 'Active' ? active : (activePolicyFilter === 'Renewed' ? renewed : allPols);
      return `<div class="inline-actions" style="margin-bottom:10px">
        <button data-policy-new="${c.id}">＋ Add new policy</button>
      </div>
      <div class="subtab-bar">
        <button data-policy-filter="Active" class="${activePolicyFilter === 'Active' ? 'active' : ''}">Active (${active.length})</button>
        <button data-policy-filter="Renewed" class="${activePolicyFilter === 'Renewed' ? 'active' : ''}">Renewed / Preserved (${renewed.length})</button>
        <button data-policy-filter="All" class="${activePolicyFilter === 'All' ? 'active' : ''}">All Policies (${allPols.length})</button>
      </div>
      ${displayed.length ? displayed.map(policyRow).join('') : empty(activePolicyFilter === 'Renewed' ? 'No renewed policies yet' : 'No policies found', 'When you create a new policy or renew, older policies are always preserved.')}`;
    }

    if (profile.tab === 'Documents') {
      let displayedDocs = docs;
      if (activeDocumentFilter !== 'All') {
        displayedDocs = docs.filter(d => d.documentType === activeDocumentFilter);
      }
      return `<div class="inline-actions" style="margin-bottom:12px">
        <button data-doc-new="${c.id}">＋ Attach document (PAN / Birth Cert / Aadhaar / Policy)</button>
      </div>
      <div class="subtab-bar">
        <button data-doc-filter="All" class="${activeDocumentFilter === 'All' ? 'active' : ''}">All (${docs.length})</button>
        <button data-doc-filter="PAN Card" class="${activeDocumentFilter === 'PAN Card' ? 'active' : ''}">PAN Card</button>
        <button data-doc-filter="Birth Certificate" class="${activeDocumentFilter === 'Birth Certificate' ? 'active' : ''}">Birth Cert</button>
        <button data-doc-filter="Aadhaar Card" class="${activeDocumentFilter === 'Aadhaar Card' ? 'active' : ''}">Aadhaar</button>
        <button data-doc-filter="Policy Document" class="${activeDocumentFilter === 'Policy Document' ? 'active' : ''}">Policies</button>
      </div>
      ${displayedDocs.length ? displayedDocs.map(docCard).join('') : empty('No documents attached', 'Attach customer PAN card, birth certificate, Aadhaar card, or policy schedules. All files are stored 100% locally on your device.')}`;
    }

    if (profile.tab === 'Policy History') {
      return hist.length ? hist.map(p => record(`${p.companyName} · ${p.productName}`, `${p.policyNumber || 'No number'} · Renewal ${fmtDate(p.renewalDueDate)} · Premium ${money(p.premiumAmount)} · Preserved ${fmtDateTime(p.historicalAt)}`, '')).join('') : empty('No policy history', 'Renewed and older policies are safely preserved here.');
    }

    if (profile.tab === 'Appointments') {
      return `<div class="inline-actions"><button data-appointment-new="${c.id}">Fix appointment</button></div>
        ${apps.length ? apps.map(a => record(`${a.purpose} · ${a.status}`, `${fmtDate(a.date)} ${a.time || ''} · ${a.notes || ''}`, `<button data-appointment-edit="${a.id}">Edit</button>`)).join('') : empty('No appointments', 'Schedule a sales or service appointment.')}`;
    }

    if (profile.tab === 'Reminders') {
      return `<div class="inline-actions"><button data-reminder-new="${c.id}">Add reminder</button></div>
        ${rems.length ? rems.map(r => record(`${r.activity} · ${r.status}`, fmtDateTime(r.dueAt), r.status !== 'Completed' ? `<button data-complete-reminder="${r.id}">Complete</button>` : '')).join('') : empty('No reminders', 'Add a follow-up or service reminder.')}`;
    }

    return acts.length ? acts.map(a => record(a.text, fmtDateTime(a.createdAt), '')).join('') : empty('No activity yet', 'Major customer operations are recorded automatically.');
  }

  function record(title, text, actions) {
    return `<div class="record-row"><div class="row-top"><strong>${esc(title)}</strong></div><p>${esc(text)}</p>${actions ? `<div class="inline-actions">${actions}</div>` : ''}</div>`;
  }

  function docIcon(type) {
    if (/pan/i.test(type)) return '🪪';
    if (/birth/i.test(type)) return '📜';
    if (/aadhaar/i.test(type)) return '🪪';
    if (/policy/i.test(type)) return '📄';
    if (/medical/i.test(type)) return '🏥';
    if (/receipt/i.test(type)) return '🧾';
    return '📁';
  }

  function docCard(d) {
    const p = d.policyId ? policyBy(d.policyId) : null;
    const f = d.familyMemberId ? state.familyMembers.find(x => x.id === d.familyMemberId) : null;
    const tagClass = /pan/i.test(d.documentType) ? 'pan' : (/birth/i.test(d.documentType) ? 'birth' : (/aadhaar/i.test(d.documentType) ? 'aadhaar' : 'policy'));
    return `<article class="doc-card">
      <div class="doc-icon">${docIcon(d.documentType)}</div>
      <div class="doc-main">
        <div><span class="doc-tag ${tagClass}">${esc(d.documentType)}</span></div>
        <strong>${esc(d.title || d.fileName)}</strong>
        <span>${esc(d.fileName)}${d.fileSize ? ` · ${fmtFileSize(d.fileSize)}` : ''}${p ? ` · Policy ${esc(p.policyNumber || p.productName)}` : ''}${f ? ` · Family: ${esc(f.fullName)}` : ''} · Stored locally</span>
      </div>
      <div class="doc-actions">
        <button class="icon-button" data-view-doc="${d.id}" title="View">👁</button>
        <button class="icon-button" data-share-doc="${d.id}" title="Share">↗</button>
        <button class="icon-button" data-download-doc="${d.id}" title="Download">↓</button>
        <button class="icon-button danger-outline" data-delete-doc="${d.id}" title="Delete">✕</button>
      </div>
    </article>`;
  }

  function policyRow(p) {
    const isRenewed = p.status === 'Renewed' || p.status === 'Historical';
    const remaining = daysBetween(p.renewalDueDate, today());
    const stage = isRenewed ? 'Preserved / Renewed' : (remaining < 0 ? 'Overdue' : remaining === 0 ? 'Due today' : remaining <= 3 ? '3 days remaining' : remaining <= 7 ? '7 days remaining' : remaining <= 15 ? '15 days remaining' : remaining <= 30 ? '30 days remaining' : 'Active');
    const policyDocs = state.documents.filter(d => d.policyId === p.id);

    return `<div class="record-row">
      <div class="row-top">
        <strong>${esc(p.companyName || 'Company')} · ${esc(p.productName || 'Product')}</strong>
        <span class="${isRenewed ? 'badge-renewed' : 'badge-active'}">${esc(p.status || 'Active')}</span>
      </div>
      <p>Policy #${esc(p.policyNumber || 'No number')} · ${money(p.premiumAmount)} · Renewal ${fmtDate(p.renewalDueDate)} · ${stage}</p>
      ${isRenewed && p.startDate ? `<p style="color:#b45309;font-size:8.5px">Term: ${fmtDate(p.startDate)} to ${fmtDate(p.renewalDueDate)} · Preserved in history</p>` : ''}
      ${policyDocs.length ? `<p style="font-size:9px;color:var(--indigo)">Attached files (${policyDocs.length}): ${policyDocs.map(d => esc(d.title || d.fileName)).join(', ')}</p>` : ''}
      <div class="inline-actions">
        <button data-policy-edit="${p.id}">Edit</button>
        ${!isRenewed ? `<button data-policy-renew="${p.id}">Renew policy (Preserves old)</button>` : ''}
        <button data-doc-policy="${p.id}">＋ Attach document</button>
        ${!isRenewed ? `<button data-porting-new="${p.id}">Remind for porting</button>` : ''}
        <button class="danger" data-policy-delete="${p.id}">Delete</button>
      </div>
    </div>`;
  }

  function renderSearch() {
    const q = ($('#globalSearch')?.value || '').trim().toLowerCase(),
          company = $('#searchCompany')?.value || '',
          category = $('#searchCategory')?.value || '',
          status = $('#searchStatus')?.value || '',
          month = $('#searchMonth')?.value || '';
    const results = [];
    state.customers.forEach(c => {
      const fields = [['customer name', c.name], ['mobile', c.phone], ['city', c.city]],
            fam = state.familyMembers.filter(f => f.customerId === c.id);
      fields.push(...fam.map(f => ['family member', f.fullName]));
      const hit = !q ? null : fields.find(([, v]) => String(v || '').toLowerCase().includes(q));
      if (hit) results.push({ title: c.name, sub: c.phone || '', reason: `Matched ${hit[0]}: ${hit[1]}`, customerId: c.id });
    });
    state.policies.forEach(p => {
      if (company && p.companyName !== company || category && p.categoryName !== category || status && p.status !== status || month && String(new Date(`${p.renewalDueDate}T12:00:00`).getMonth() + 1) !== month) return;
      const fields = [['policy number', p.policyNumber], ['company', p.companyName], ['product', p.productName], ['category', p.categoryName], ['customer', p.customerName]],
            hit = q ? fields.find(([, v]) => String(v || '').toLowerCase().includes(q)) : ['filters', 'Selected filters'];
      if (hit) results.push({ title: `${p.customerName} · ${p.productName}`, sub: `${p.companyName} · ${p.policyNumber || 'No number'} (${p.status || 'Active'})`, reason: `Matched ${hit[0]}: ${hit[1]}`, customerId: p.customerId });
    });
    $('#searchResults').innerHTML = results.length ? results.map(r => `<article class="result-card" data-open-customer="${r.customerId}"><strong>${esc(r.title)}</strong><p>${esc(r.sub)}</p><div class="result-reason">${esc(r.reason)}</div></article>`).join('') : empty(q || company || category || status || month ? 'No matching records' : 'Search your whole CRM', 'Use any part of a name, number, company, product or category.');
  }

  function renderReminders() {
    const now = today(), tom = new Date();
    tom.setDate(tom.getDate() + 1);
    const tomorrow = dateOnly(tom);
    let list = state.reminders.slice();
    const f = activeReminderFilter;
    if (f === 'Today') list = list.filter(r => String(r.dueAt).slice(0, 10) === now && r.status !== 'Completed');
    else if (f === 'Tomorrow') list = list.filter(r => String(r.dueAt).slice(0, 10) === tomorrow && r.status !== 'Completed');
    else if (f === 'This Week') list = list.filter(r => { const d = daysBetween(String(r.dueAt).slice(0, 10), now); return d >= 0 && d <= 7 && r.status !== 'Completed'; });
    else if (f === 'Overdue') list = list.filter(r => String(r.dueAt).slice(0, 10) < now && r.status !== 'Completed');
    else if (f === 'Completed') list = list.filter(r => r.status === 'Completed');
    else if (!['All'].includes(f)) list = list.filter(r => r.type === f && r.status !== 'Completed');
    list.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    $('#reminderList').innerHTML = list.length ? list.map(reminderCard).join('') : empty(`No ${f.toLowerCase()} reminders`, 'This queue is clear.');
    $$('#reminderFilters button').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
    const count = state.reminders.filter(r => r.status !== 'Completed' && String(r.dueAt).slice(0, 10) <= now).length;
    $('#reminderBadge').textContent = count ? String(Math.min(count, 99)) : '';
  }

  function fillSelects() {
    const val = id => $(id)?.value || '';
    const mc = val('#messageClient'), mp = val('#messagePolicy'), mt = val('#messageTemplate');
    $('#messageClient').innerHTML = '<option value="">Select customer</option>' + selectOptions(state.customers, mc);
    if (state.customers.some(x => x.id === mc)) $('#messageClient').value = mc;
    const policies = state.policies.filter(p => !mc || p.customerId === mc);
    $('#messagePolicy').innerHTML = '<option value="">Optional policy</option>' + selectOptions(policies, mp, 'productName');
    if (policies.some(x => x.id === mp)) $('#messagePolicy').value = mp;
    $('#messageTemplate').innerHTML = '<option value="">Select template</option>' + selectOptions(state.messageTemplates, mt);
    if (state.messageTemplates.some(x => x.id === mt)) $('#messageTemplate').value = mt;
    $('#searchCompany').innerHTML = '<option value="">All companies</option>' + state.companies.map(x => `<option>${esc(x.name)}</option>`).join('');
    $('#searchCategory').innerHTML = '<option value="">All categories</option>' + state.categories.map(x => `<option>${esc(x.name)}</option>`).join('');
    if (!$('#searchMonth').dataset.ready) {
      $('#searchMonth').innerHTML = '<option value="">Any renewal month</option>' + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${new Date(2020, i, 1).toLocaleDateString('en-IN', { month: 'long' })}</option>`).join('');
      $('#searchMonth').dataset.ready = '1';
    }
  }

  function resolveTemplate() {
    const c = customerBy($('#messageClient').value), p = policyBy($('#messagePolicy').value), t = state.messageTemplates.find(x => x.id === $('#messageTemplate').value);
    if (!t) { $('#messagePreview').value = ''; return; }
    const family = state.familyMembers.find(f => f.customerId === c?.id), app = state.appointments.find(a => a.customerId === c?.id && a.status === 'Scheduled');
    const vars = {
      customer_name: c?.name || '',
      family_member_name: family?.fullName || '',
      policy_number: p?.policyNumber || '',
      company_name: p?.companyName || '',
      product_name: p?.productName || '',
      premium: money(p?.premiumAmount || 0),
      renewal_date: fmtDate(p?.renewalDueDate),
      appointment_date: fmtDate(app?.date),
      agent_name: state.advisorName
    };
    $('#messagePreview').value = t.body.replace(/{{\s*([a-z_]+)\s*}}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  }

  function renderMessages() {
    fillSelects();
    resolveTemplate();
    $('#templateList').innerHTML = state.messageTemplates.length ? state.messageTemplates.map(t => `<article class="template-card"><div class="card-head"><div><strong>${esc(t.name)}</strong><span class="status">${esc(t.type)}${t.isDefault ? ' · Default' : ''}</span></div><div class="card-actions"><button class="icon-button" data-template-edit="${t.id}">•••</button></div></div><p>${esc(t.body)}</p></article>`).join('') : empty('No message templates', 'Add a reusable template with placeholders.');
  }

  function renderSettings() {
    $('#advisorName').value = state.advisorName;
    if ($('#supabaseUrl')) $('#supabaseUrl').value = state.supabase?.url || DEFAULT_SUPABASE.url;
    if ($('#supabaseAnonKey')) $('#supabaseAnonKey').value = state.supabase?.anonKey || DEFAULT_SUPABASE.anonKey;
    if ($('#supabaseAutoSync')) $('#supabaseAutoSync').checked = state.supabase?.autoSync !== false;
    if ($('#supabaseStatus')) {
      const isConn = state.supabase?.status === 'Connected';
      const isAuto = state.supabase?.autoSync !== false;
      $('#supabaseStatus').className = `sync-badge ${isConn || isAuto ? 'connected' : 'disconnected'}`;
      $('#supabaseStatus').textContent = isConn ? 'Connected ✓ (Auto-sync active)' : (isAuto ? 'Integrated by default (Auto-sync active)' : 'Auto-sync paused');
    }
    if ($('#supabaseLastSync')) {
      $('#supabaseLastSync').textContent = state.supabase?.lastSyncAt ? `Last cloud sync: ${fmtDateTime(state.supabase.lastSyncAt)}` : 'Integrated by default · Auto-syncs on edit, resume & every 5 mins';
    }
    if ($('#docVaultSummary')) {
      const count = (state.documents || []).length;
      $('#docVaultSummary').textContent = `${count} document${count === 1 ? '' : 's'} (PAN, Birth Cert, Policies) stored securely in private local storage`;
    }
    updateSyncUI();
  }

  function renderAll() {
    ensureAutomaticReminders();
    renderHome();
    renderClients();
    fillSelects();
    renderSearch();
    renderReminders();
    renderMessages();
    renderSettings();
  }

  function customerForm(id) {
    const c = customerBy(id) || {};
    openForm(c.id ? 'Edit customer' : 'Add customer', 'CUSTOMER PROFILE', `<input type="hidden" name="id" value="${esc(c.id || '')}"><label>Full name<input name="name" required value="${esc(c.name || '')}"></label><div class="two-col"><label>Mobile<input name="phone" inputmode="tel" required value="${esc(c.phone || '')}"></label><label>City<input name="city" value="${esc(c.city || '')}"></label></div><div class="two-col"><label>Date of birth<input name="dateOfBirth" type="date" value="${esc(c.dateOfBirth || '')}"></label><label>Anniversary<input name="anniversaryDate" type="date" value="${esc(c.anniversaryDate || '')}"></label></div><label>Notes<textarea name="notes">${esc(c.notes || '')}</textarea></label><button class="primary-button">Save customer</button>`, data => {
      const current = customerBy(data.id),
            record = { ...(current || {}), id: data.id || uid('customer'), name: data.name.trim(), phone: data.phone.trim(), city: data.city.trim(), dateOfBirth: data.dateOfBirth, anniversaryDate: data.anniversaryDate, notes: data.notes.trim(), createdAt: current?.createdAt || isoNow(), updatedAt: isoNow() };
      state.customers = current ? state.customers.map(x => x.id === record.id ? record : x) : [record, ...state.customers];
      state.policies.forEach(p => { if (p.customerId === record.id) p.customerName = record.name; });
      queueOutbox('customers', 'upsert', record.id, {
        id: record.id,
        name: record.name,
        phone: record.phone || null,
        city: record.city || null,
        date_of_birth: record.dateOfBirth || null,
        anniversary_date: record.anniversaryDate || null,
        notes: record.notes || null,
        created_at: record.createdAt,
        updated_at: record.updatedAt
      });
      addActivity(record.id, current ? 'Customer profile updated' : 'Customer created');
      closeForm();
      persist('customer-saved');
    });
  }

  function familyForm(customerId, id) {
    const f = state.familyMembers.find(x => x.id === id) || {};
    openForm(f.id ? 'Edit family member' : 'Add family member', 'FAMILY', `<input type="hidden" name="id" value="${esc(f.id || '')}"><input type="hidden" name="customerId" value="${esc(customerId)}"><label>Full name<input name="fullName" required value="${esc(f.fullName || '')}"></label><label>Relationship<input name="relationship" required value="${esc(f.relationship || '')}"></label><div class="two-col"><label>Date of birth<input name="dateOfBirth" type="date" required value="${esc(f.dateOfBirth || '')}"></label><label>Mobile (optional)<input name="mobile" value="${esc(f.mobile || '')}"></label></div><label>Notes<textarea name="notes">${esc(f.notes || '')}</textarea></label><button class="primary-button">Save family member</button>`, data => {
      const duplicate = state.familyMembers.find(x => x.customerId === data.customerId && x.id !== data.id && x.fullName.trim().toLowerCase() === data.fullName.trim().toLowerCase() && x.dateOfBirth === data.dateOfBirth);
      if (duplicate) return toast('A matching family member already exists');
      const current = state.familyMembers.find(x => x.id === data.id),
            record = { ...current, id: data.id || uid('family'), customerId: data.customerId, fullName: data.fullName.trim(), relationship: data.relationship.trim(), dateOfBirth: data.dateOfBirth, mobile: data.mobile.trim(), notes: data.notes.trim() };
      state.familyMembers = current ? state.familyMembers.map(x => x.id === record.id ? record : x) : [record, ...state.familyMembers];
      queueOutbox('family_members', 'upsert', record.id, {
        id: record.id,
        customer_id: record.customerId,
        full_name: record.fullName,
        relationship: record.relationship,
        date_of_birth: record.dateOfBirth || null,
        mobile: record.mobile || null,
        notes: record.notes || null,
        created_at: record.createdAt
      });
      addActivity(customerId, current ? `Family member updated · ${record.fullName}` : `Family member added · ${record.fullName}`);
      closeForm();
      persist('family-saved');
    });
  }

  // --- Policy Creation: Guarantees Older Policies Are Never Overwritten or Deleted ---
  function policyForm(customerId, id) {
    const p = policyBy(id) || {}, cid = customerId || p.customerId || '';
    openForm(p.id ? 'Edit policy' : 'Add policy', 'POLICY', `<input type="hidden" name="id" value="${esc(p.id || '')}"><label>Customer<select name="customerId" required><option value="">Select customer</option>${selectOptions(state.customers, cid)}</select></label><div class="two-col"><label>Company<input name="companyName" required value="${esc(p.companyName || '')}"></label><label>Product<input name="productName" required value="${esc(p.productName || '')}"></label></div><div class="two-col"><label>Category<input name="categoryName" required value="${esc(p.categoryName || '')}"></label><label>Policy number<input name="policyNumber" required value="${esc(p.policyNumber || '')}"></label></div><div class="two-col"><label>Start date<input name="startDate" type="date" required value="${esc(p.startDate || today())}"></label><label>Renewal date<input name="renewalDueDate" type="date" required value="${esc(p.renewalDueDate || '')}"></label></div><div class="two-col"><label>Premium ₹<input name="premiumAmount" type="number" min="0" required value="${esc(p.premiumAmount || '')}"></label><label>Sum insured ₹<input name="sumInsured" type="number" min="0" value="${esc(p.sumInsured || '')}"></label></div><label>Status<select name="status"><option ${p.status === 'Active' || !p.status ? 'selected' : ''}>Active</option><option ${p.status === 'Renewed' ? 'selected' : ''}>Renewed</option><option ${p.status === 'Historical' ? 'selected' : ''}>Historical</option></select></label><label>Notes<textarea name="notes">${esc(p.notes || '')}</textarea></label><button class="primary-button">Save policy & reminders</button>`, data => {
      const c = customerBy(data.customerId);
      if (!c) return toast('Select a valid customer');

      const current = policyBy(data.id);
      const record = {
        ...(current || {}),
        id: data.id || uid('policy'),
        customerId: c.id,
        customerName: c.name,
        companyName: data.companyName.trim(),
        productName: data.productName.trim(),
        categoryName: data.categoryName.trim(),
        policyNumber: data.policyNumber.trim(),
        startDate: data.startDate,
        renewalDueDate: data.renewalDueDate,
        premiumAmount: Number(data.premiumAmount || 0),
        sumInsured: Number(data.sumInsured || 0),
        notes: data.notes.trim(),
        status: data.status || (current ? current.status : 'Active'),
        createdAt: current?.createdAt || isoNow(),
        updatedAt: isoNow()
      };

      if (current) {
        // Edit existing: update this policy only
        state.policies = state.policies.map(x => x.id === record.id ? record : x);
      } else {
        // Creating a new policy: PREPEND to state.policies. NEVER delete or overwrite older policies!
        state.policies = [record, ...state.policies];
      }

      queueOutbox('policies', 'upsert', record.id, {
        id: record.id,
        customer_id: record.customerId,
        customer_name: record.customerName || null,
        company_name: record.companyName,
        product_name: record.productName,
        category_name: record.categoryName || null,
        policy_number: record.policyNumber,
        start_date: record.startDate || null,
        renewal_due_date: record.renewalDueDate,
        premium_amount: Number(record.premiumAmount || 0),
        sum_insured: Number(record.sumInsured || 0),
        status: record.status || 'Active',
        previous_policy_id: record.previousPolicyId || null,
        notes: record.notes || null,
        has_document: Boolean(record.hasDocument),
        document_name: record.documentName || null,
        created_at: record.createdAt,
        updated_at: record.updatedAt
      });

      ensureReference(record.companyName, 'companies');
      ensureReference(record.productName, 'products');
      ensureReference(record.categoryName, 'categories');
      addActivity(c.id, current ? `Policy updated · ${record.productName}` : `Policy added · ${record.productName} (older policies preserved)`);
      closeForm();
      persist('policy-saved');
    });
  }

  // --- Policy Renewal: Preserves Old Policy With Status 'Renewed' & Documents Intact ---
  function renewPolicyForm(policyId) {
    const oldPolicy = policyBy(policyId);
    if (!oldPolicy) return toast('Policy not found');

    openForm('Renew policy', 'PRESERVE HISTORY', `<label>New renewal policy number<input name="policyNumber" required value="${esc(oldPolicy.policyNumber || '')}"></label><div class="two-col"><label>New start date<input name="startDate" type="date" required value="${esc(oldPolicy.renewalDueDate || today())}"></label><label>New renewal date<input name="renewalDueDate" type="date" required></label></div><div class="two-col"><label>Company<input name="companyName" required value="${esc(oldPolicy.companyName || '')}"></label><label>Product<input name="productName" required value="${esc(oldPolicy.productName || '')}"></label></div><div class="two-col"><label>Category<input name="categoryName" required value="${esc(oldPolicy.categoryName || '')}"></label><label>New premium ₹<input name="premiumAmount" type="number" required value="${esc(oldPolicy.premiumAmount || '')}"></label></div><label>Sum insured ₹<input name="sumInsured" type="number" value="${esc(oldPolicy.sumInsured || '')}"></label><label>Notes<textarea name="notes">${esc(oldPolicy.notes || '')}</textarea></label><button class="primary-button">Renew and preserve old policy</button>`, data => {
      // 1. Preserve the old policy: update status to 'Renewed' so it remains in state.policies with its documents intact!
      oldPolicy.status = 'Renewed';
      oldPolicy.updatedAt = isoNow();
      queueOutbox('policies', 'upsert', oldPolicy.id, {
        id: oldPolicy.id,
        customer_id: oldPolicy.customerId,
        customer_name: oldPolicy.customerName || null,
        company_name: oldPolicy.companyName,
        product_name: oldPolicy.productName,
        category_name: oldPolicy.categoryName || null,
        policy_number: oldPolicy.policyNumber,
        start_date: oldPolicy.startDate || null,
        renewal_due_date: oldPolicy.renewalDueDate,
        premium_amount: Number(oldPolicy.premiumAmount || 0),
        sum_insured: Number(oldPolicy.sumInsured || 0),
        status: 'Renewed',
        previous_policy_id: oldPolicy.previousPolicyId || null,
        notes: oldPolicy.notes || null,
        has_document: Boolean(oldPolicy.hasDocument),
        document_name: oldPolicy.documentName || null,
        created_at: oldPolicy.createdAt,
        updated_at: oldPolicy.updatedAt
      });

      // 2. Create the brand new policy record for the new term
      const newPolicy = {
        id: uid('policy'),
        customerId: oldPolicy.customerId,
        customerName: oldPolicy.customerName,
        companyName: data.companyName.trim(),
        productName: data.productName.trim(),
        categoryName: data.categoryName.trim(),
        policyNumber: data.policyNumber.trim(),
        startDate: data.startDate,
        renewalDueDate: data.renewalDueDate,
        premiumAmount: Number(data.premiumAmount || 0),
        sumInsured: Number(data.sumInsured || 0),
        notes: data.notes.trim(),
        status: 'Active',
        previousPolicyId: oldPolicy.id,
        hasDocument: false,
        documentName: '',
        createdAt: isoNow(),
        updatedAt: isoNow()
      };
      state.policies.unshift(newPolicy);
      queueOutbox('policies', 'upsert', newPolicy.id, {
        id: newPolicy.id,
        customer_id: newPolicy.customerId,
        customer_name: newPolicy.customerName || null,
        company_name: newPolicy.companyName,
        product_name: newPolicy.productName,
        category_name: newPolicy.categoryName || null,
        policy_number: newPolicy.policyNumber,
        start_date: newPolicy.startDate || null,
        renewal_due_date: newPolicy.renewalDueDate,
        premium_amount: Number(newPolicy.premiumAmount || 0),
        sum_insured: Number(newPolicy.sumInsured || 0),
        status: 'Active',
        previous_policy_id: newPolicy.previousPolicyId || null,
        notes: newPolicy.notes || null,
        has_document: false,
        document_name: null,
        created_at: newPolicy.createdAt,
        updated_at: newPolicy.updatedAt
      });

      // 3. Also record in policy history
      state.policyHistory.unshift({
        ...oldPolicy,
        historyId: uid('history'),
        sourcePolicyId: oldPolicy.id,
        renewedToPolicyId: newPolicy.id,
        status: 'Renewed / Preserved',
        historicalAt: isoNow()
      });

      // Clear old renewal reminders for the old policy
      state.reminders = state.reminders.filter(r => r.policyId !== oldPolicy.id);

      addActivity(oldPolicy.customerId, `Policy renewed · ${newPolicy.productName} (Older policy preserved as Renewed)`);
      closeForm();
      persist('policy-renewed');
      toast('Policy renewed · Old policy preserved with all documents');
    });
  }

  // --- Document Attachment Modal: Attach PAN, Birth Cert, Aadhaar, Policies, etc. ---
  function documentForm(customerId, policyId, familyMemberId) {
    const c = customerBy(customerId);
    const pols = state.policies.filter(p => p.customerId === customerId);
    const fams = state.familyMembers.filter(f => f.customerId === customerId);
    const docTypes = [
      'PAN Card',
      'Birth Certificate',
      'Aadhaar Card',
      'Policy Document',
      'Proposal Form',
      'Premium Receipt',
      'Driving License',
      'Passport / Voter ID',
      'Medical Report',
      'Porting Document',
      'Other Document'
    ];

    openForm('Attach local document', 'DOCUMENT VAULT', `
      <input type="hidden" name="customerId" value="${esc(customerId)}">
      <label>Document type
        <select name="documentType" required>
          ${docTypes.map(t => `<option value="${t}" ${t === 'PAN Card' && !policyId && !familyMemberId ? 'selected' : (t === 'Policy Document' && policyId ? 'selected' : (t === 'Birth Certificate' && familyMemberId ? 'selected' : ''))}>${t}</option>`).join('')}
        </select>
      </label>
      <label>Document title / Note
        <input name="title" placeholder="e.g. Rahul PAN Card or 2026 Policy Schedule" required>
      </label>
      <div class="two-col">
        <label>Link to policy (optional)
          <select name="policyId">
            <option value="">General customer doc</option>
            ${selectOptions(pols, policyId || '', 'productName')}
          </select>
        </label>
        <label>Link to family member (optional)
          <select name="familyMemberId">
            <option value="">None</option>
            ${selectOptions(fams, familyMemberId || '', 'fullName')}
          </select>
        </label>
      </div>
      <p class="privacy-note" style="margin-bottom:14px">Local storage guarantee: Files are stored 100% locally in your phone's isolated storage and are not transmitted to cloud servers.</p>
      <button class="primary-button" id="startAttachBtn">Choose file (PDF or Image)</button>
    `, data => {
      const docId = uid('doc');
      pendingDocUpload = {
        id: docId,
        customerId: data.customerId,
        customerName: c?.name || '',
        policyId: data.policyId || null,
        familyMemberId: data.familyMemberId || null,
        documentType: data.documentType,
        title: data.title.trim()
      };
      closeForm();
      window.InsureClubNative?.selectAttachment?.(docId, data.documentType, data.title.trim());
    });
  }

  function appointmentForm(customerId, id) {
    const a = state.appointments.find(x => x.id === id) || {}, cid = customerId || a.customerId || '';
    openForm(a.id ? 'Edit appointment' : 'Fix appointment', 'SALES & SERVICE', `<input type="hidden" name="id" value="${esc(a.id || '')}"><label>Customer<select name="customerId" required><option value="">Select customer</option>${selectOptions(state.customers, cid)}</select></label><div class="two-col"><label>Date<input name="date" type="date" required value="${esc(a.date || today())}"></label><label>Time<input name="time" type="time" required value="${esc(a.time || '10:00')}"></label></div><label>Purpose<input name="purpose" required value="${esc(a.purpose || '')}"></label><div class="two-col"><label>Product<input name="productName" value="${esc(a.productName || '')}"></label><label>Company<input name="companyName" value="${esc(a.companyName || '')}"></label></div><label>Reminder date & time<input name="reminderAt" type="datetime-local" required value="${esc(a.reminderAt || '')}"></label><label>Status<select name="status">${['Scheduled', 'Completed', 'Rescheduled', 'Cancelled', 'Customer Not Available', 'Follow-up Required'].map(x => `<option ${a.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Notes<textarea name="notes">${esc(a.notes || '')}</textarea></label><label>Next follow-up (required when follow-up needed)<input name="followUpAt" type="datetime-local" value="${esc(a.followUpAt || '')}"></label><button class="primary-button">Save appointment</button>`, data => {
      if (data.status === 'Follow-up Required' && !data.followUpAt) return toast('Enter the next follow-up date and time');
      const c = customerBy(data.customerId), current = state.appointments.find(x => x.id === data.id),
            record = { ...current, id: data.id || uid('appointment'), customerId: c.id, customerName: c.name, date: data.date, time: data.time, purpose: data.purpose.trim(), productName: data.productName.trim(), companyName: data.companyName.trim(), reminderAt: data.reminderAt, status: data.status, notes: data.notes.trim(), followUpAt: data.followUpAt };
      state.appointments = current ? state.appointments.map(x => x.id === record.id ? record : x) : [record, ...state.appointments];
      queueOutbox('appointments', 'upsert', record.id, {
        id: record.id,
        customer_id: record.customerId || null,
        customer_name: record.customerName || null,
        date: record.date,
        time: record.time || null,
        purpose: record.purpose,
        product_name: record.productName || null,
        company_name: record.companyName || null,
        reminder_at: record.reminderAt || null,
        status: record.status || 'Scheduled',
        notes: record.notes || null,
        follow_up_at: record.followUpAt || null
      });
      if (record.status === 'Follow-up Required') state.reminders.push({ id: uid('reminder'), customerId: c.id, customerName: c.name, type: 'Follow-up', activity: 'Appointment follow-up', dueAt: record.followUpAt, status: 'Pending', notes: record.notes, auto: false });
      addActivity(c.id, `${current ? 'Appointment updated' : 'Appointment fixed'} · ${record.purpose}`);
      closeForm();
      persist('appointment-saved');
    });
  }

  function reminderForm(customerId) {
    openForm('Add reminder', 'FOLLOW-UP', `<label>Customer<select name="customerId"><option value="">General reminder</option>${selectOptions(state.customers, customerId || '')}</select></label><label>Activity type<select name="type">${['Renewal', 'Appointment', 'Sales Call', 'Follow-up', 'Document Collection', 'Policy Delivery', 'General'].map(x => `<option>${x}</option>`).join('')}</select></label><label>Activity<input name="activity" required></label><label>Due date & time<input name="dueAt" type="datetime-local" required></label><label>Notes<textarea name="notes"></textarea></label><button class="primary-button">Save reminder</button>`, data => {
      const c = customerBy(data.customerId);
      state.reminders.unshift({ id: uid('reminder'), customerId: c?.id || '', customerName: c?.name || 'General', type: data.type, activity: data.activity.trim(), dueAt: data.dueAt, status: 'Pending', notes: data.notes.trim(), auto: false });
      if (c) addActivity(c.id, `Reminder added · ${data.activity.trim()}`);
      closeForm();
      persist('reminder-saved');
    });
  }

  function templateForm(id) {
    const t = state.messageTemplates.find(x => x.id === id) || {};
    openForm(t.id ? 'Edit message template' : 'Add message template', 'MESSAGE TEMPLATE', `<input type="hidden" name="id" value="${esc(t.id || '')}"><label>Template name<input name="name" required value="${esc(t.name || '')}"></label><label>Type<select name="type">${['Birthday', 'Policy Renewal', 'Anniversary', 'Appointment request', 'Renewal follow-up', 'Sales call follow-up', 'Policy porting', 'General follow-up'].map(x => `<option ${t.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Message<textarea name="body" rows="7" required>${esc(t.body || '')}</textarea></label><p class="privacy-note">Variables: {{customer_name}}, {{family_member_name}}, {{policy_number}}, {{company_name}}, {{product_name}}, {{premium}}, {{renewal_date}}, {{appointment_date}}, {{agent_name}}</p><label><input name="isDefault" type="checkbox" ${t.isDefault ? 'checked' : ''}> Set as default for this type</label><button class="primary-button">Save template</button>${t.id ? `<div class="inline-actions"><button type="button" class="danger" data-template-delete="${t.id}">Delete template</button></div>` : ''}`, data => {
      const current = state.messageTemplates.find(x => x.id === data.id),
            record = { ...current, id: data.id || uid('template'), name: data.name.trim(), type: data.type, body: data.body.trim(), isDefault: data.isDefault === 'on' };
      if (record.isDefault) state.messageTemplates.forEach(x => { if (x.type === record.type) x.isDefault = false; });
      state.messageTemplates = current ? state.messageTemplates.map(x => x.id === record.id ? record : x) : [record, ...state.messageTemplates];
      closeForm();
      persist('template-saved');
    });
  }

  function portingForm(policyId) {
    const p = policyBy(policyId), existing = state.portingReminders.find(x => x.policyId === policyId && !['Ported', 'Cancelled'].includes(x.status)) || {};
    openForm('Remind for porting', 'PORTING OPPORTUNITY', `<input type="hidden" name="id" value="${esc(existing.id || '')}"><input type="hidden" name="policyId" value="${esc(policyId)}"><label>Existing company<input name="existingCompany" required value="${esc(existing.existingCompany || p.companyName)}"></label><label>Existing policy<input name="existingPolicy" required value="${esc(existing.existingPolicy || p.policyNumber)}"></label><label>Renewal date<input name="renewalDate" type="date" required value="${esc(existing.renewalDate || p.renewalDueDate)}"></label><div class="two-col"><label>Target company<input name="targetCompany" value="${esc(existing.targetCompany || '')}"></label><label>Target product<input name="targetProduct" value="${esc(existing.targetProduct || '')}"></label></div><label>Reminder date<input name="reminderDate" type="date" required value="${esc(existing.reminderDate || '')}"></label><label>Status<select name="status">${['Pending', 'Customer Contacted', 'Appointment Fixed', 'Porting In Process', 'Ported', 'Not Interested', 'Cancelled'].map(x => `<option ${existing.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>Notes<textarea name="notes">${esc(existing.notes || '')}</textarea></label><button class="primary-button">Save porting reminder</button>`, data => {
      const c = customerBy(p.customerId), current = state.portingReminders.find(x => x.id === data.id),
            record = { ...current, id: data.id || uid('porting'), policyId: p.id, customerId: c.id, customerName: c.name, existingCompany: data.existingCompany.trim(), existingPolicy: data.existingPolicy.trim(), renewalDate: data.renewalDate, targetCompany: data.targetCompany.trim(), targetProduct: data.targetProduct.trim(), reminderDate: data.reminderDate, status: data.status, notes: data.notes.trim() };
      state.portingReminders = current ? state.portingReminders.map(x => x.id === record.id ? record : x) : [record, ...state.portingReminders];
      addActivity(c.id, `Porting reminder · ${record.status}`);
      closeForm();
      persist('porting-saved');
    });
  }

  function snooze(id) {
    choice('Snooze reminder', 'Choose when this reminder should return.', [
      { id: '10', label: '10 minutes' },
      { id: '30', label: '30 minutes' },
      { id: '60', label: '1 hour' },
      { id: 'tomorrow', label: 'Tomorrow' },
      { id: 'custom', label: 'Select date' }
    ]);
    $('#choiceModal').dataset.snooze = id;
  }

  function applySnooze(id, value) {
    const r = state.reminders.find(x => x.id === id);
    if (!r) return;
    let d = new Date();
    if (value === 'tomorrow') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else d = new Date(Date.now() + Number(value) * 60000);
    r.snoozedFrom = r.id;
    r.id = uid('reminder');
    r.dueAt = d.toISOString().slice(0, 16);
    r.status = 'Pending';
    closeChoice();
    delete $('#choiceModal').dataset.snooze;
    persist('reminder-snoozed');
    toast('Reminder snoozed');
  }

  function filenameFor(p) {
    const clean = v => String(v || 'Policy').replace(/[^A-Za-z0-9]+/g, '');
    return `${clean(p.customerName)}_${clean(p.companyName)}_${clean(p.productName)}_${clean(p.policyNumber)}.pdf`;
  }

  function mergeState(imported) {
    ARRAYS.forEach(k => {
      const map = new Map((state[k] || []).map(x => [x.id, x]));
      (imported[k] || []).forEach(x => { if (!map.has(x.id)) map.set(x.id, x); });
      state[k] = [...map.values()];
    });
    if (!state.advisorName) state.advisorName = imported.advisorName || 'Advisor';
  }

  // --- Document Callbacks from Native Bridge ---
  window.onGenericDocumentAdded = raw => {
    try {
      const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const targetDoc = pendingDocUpload || {};
      const docRecord = {
        id: meta.id || targetDoc.id || uid('doc'),
        customerId: targetDoc.customerId || profile.customerId || '',
        customerName: targetDoc.customerName || (profile.customerId ? customerBy(profile.customerId)?.name : ''),
        policyId: targetDoc.policyId || null,
        familyMemberId: targetDoc.familyMemberId || null,
        documentType: meta.documentType || targetDoc.documentType || 'General Document',
        title: meta.title || targetDoc.title || meta.fileName,
        fileName: meta.fileName,
        fileSize: Number(meta.fileSize || 0),
        mimeType: meta.mimeType || 'application/pdf',
        extension: meta.extension || 'pdf',
        createdAt: isoNow(),
        updatedAt: isoNow()
      };

      state.documents = Array.isArray(state.documents) ? state.documents : [];
      state.documents = [docRecord, ...state.documents.filter(d => d.id !== docRecord.id)];

      if (docRecord.policyId) {
        const pol = policyBy(docRecord.policyId);
        if (pol) {
          pol.hasDocument = true;
          pol.documentName = docRecord.fileName;
          pol.documentUpdatedAt = isoNow();
        }
      }

      queueOutbox('documents', 'upsert', docRecord.id, {
        id: docRecord.id,
        customer_id: docRecord.customerId,
        customer_name: docRecord.customerName || null,
        policy_id: docRecord.policyId || null,
        family_member_id: docRecord.familyMemberId || null,
        document_type: docRecord.documentType,
        title: docRecord.title,
        file_name: docRecord.fileName,
        file_size: Number(docRecord.fileSize || 0),
        mime_type: docRecord.mimeType || 'application/pdf',
        created_at: docRecord.createdAt,
        updated_at: docRecord.updatedAt
      });

      addActivity(docRecord.customerId, `Document stored locally · ${docRecord.documentType} (${docRecord.title})`);
      pendingDocUpload = null;
      persist('document-attached');
      toast(`${docRecord.documentType} attached and stored locally ✓`);
    } catch (e) {
      toast('Failed to record attached document');
    }
  };

  window.onPolicyDocumentAdded = (policyId, name) => {
    const p = policyBy(policyId);
    if (!p) return;
    p.hasDocument = true;
    p.documentName = name;
    p.documentUpdatedAt = isoNow();

    state.documents = Array.isArray(state.documents) ? state.documents : [];
    if (!state.documents.some(d => d.policyId === p.id)) {
      state.documents.unshift({
        id: `doc-pol-${p.id}`,
        customerId: p.customerId,
        customerName: p.customerName || '',
        policyId: p.id,
        familyMemberId: null,
        documentType: 'Policy Document',
        title: `${p.companyName} ${p.productName} Schedule`,
        fileName: name,
        fileSize: 0,
        mimeType: 'application/pdf',
        createdAt: isoNow(),
        updatedAt: isoNow()
      });
    }

    queueOutbox('documents', 'upsert', `doc-pol-${p.id}`, {
      id: `doc-pol-${p.id}`,
      customer_id: p.customerId,
      customer_name: p.customerName || null,
      policy_id: p.id,
      family_member_id: null,
      document_type: 'Policy Document',
      title: `${p.companyName} ${p.productName} Schedule`,
      file_name: name,
      file_size: 0,
      mime_type: 'application/pdf',
      created_at: isoNow(),
      updated_at: isoNow()
    });
    queueOutbox('policies', 'upsert', p.id, {
      id: p.id,
      customer_id: p.customerId,
      customer_name: p.customerName || null,
      company_name: p.companyName,
      product_name: p.productName,
      category_name: p.categoryName || null,
      policy_number: p.policyNumber,
      start_date: p.startDate || null,
      renewal_due_date: p.renewalDueDate,
      premium_amount: Number(p.premiumAmount || 0),
      sum_insured: Number(p.sumInsured || 0),
      status: p.status || 'Active',
      previous_policy_id: p.previousPolicyId || null,
      notes: p.notes || null,
      has_document: true,
      document_name: name,
      created_at: p.createdAt || isoNow(),
      updated_at: isoNow()
    });

    addActivity(p.customerId, `Policy PDF added · ${p.productName}`);
    persist('policy-document-added');
    toast('Policy PDF stored locally');
  };

  // --- Click Event Delegation ---
  document.addEventListener('click', e => {
    const t = e.target.closest('button,[data-open-customer],[data-performance],[data-policy-filter],[data-doc-filter]');
    if (!t) return;

    if (t.dataset.route) route(t.dataset.route);
    if (t.dataset.action === 'customer-new' || t.dataset.editCustomer) customerForm(t.dataset.editCustomer);
    if (t.dataset.action === 'policy-new' || t.dataset.policyNew !== undefined) policyForm(t.dataset.policyNew || profile.customerId || '');
    if (t.dataset.action === 'appointment-new' || t.dataset.appointmentNew !== undefined) appointmentForm(t.dataset.appointmentNew || profile.customerId || '');
    if (t.dataset.action === 'reminder-new' || t.dataset.reminderNew !== undefined) reminderForm(t.dataset.reminderNew || profile.customerId || '');
    if (t.dataset.action === 'template-new') templateForm();
    if (t.dataset.templateEdit) templateForm(t.dataset.templateEdit);
    if (t.matches('[data-close-modal]')) closeForm();
    if (t.matches('[data-close-choice]')) closeChoice();
    if (t.dataset.openCustomer !== undefined) {
      profile.customerId = t.dataset.openCustomer;
      profile.tab = 'Overview';
      route('clients');
    }
    if (t.hasAttribute('data-close-profile')) {
      profile.customerId = null;
      $('#clientProfile').classList.add('hidden');
      renderClients();
    }
    if (t.dataset.profileTab) {
      profile.tab = t.dataset.profileTab;
      renderProfile();
    }

    // Policy and Document Filter Pills
    if (t.dataset.policyFilter) {
      activePolicyFilter = t.dataset.policyFilter;
      renderProfile();
    }
    if (t.dataset.docFilter) {
      activeDocumentFilter = t.dataset.docFilter;
      renderProfile();
    }

    // Document attachments
    if (t.dataset.docNew) documentForm(t.dataset.docNew);
    if (t.dataset.docPolicy) documentForm(policyBy(t.dataset.docPolicy)?.customerId || profile.customerId, t.dataset.docPolicy);
    if (t.dataset.docFamily) {
      const fam = state.familyMembers.find(x => x.id === t.dataset.docFamily);
      if (fam) documentForm(fam.customerId, null, fam.id);
    }
    if (t.dataset.viewDoc) window.InsureClubNative?.viewDocument?.(t.dataset.viewDoc);
    if (t.dataset.shareDoc) window.InsureClubNative?.shareDocument?.(t.dataset.shareDoc);
    if (t.dataset.downloadDoc) {
      const doc = state.documents.find(x => x.id === t.dataset.downloadDoc);
      if (doc) window.InsureClubNative?.downloadDocument?.(doc.id, doc.fileName || `${doc.title || 'doc'}.${doc.extension || 'pdf'}`);
    }
    if (t.dataset.deleteDoc) {
      const doc = state.documents.find(x => x.id === t.dataset.deleteDoc);
      if (doc && confirm(`Delete ${doc.documentType}: "${doc.title || doc.fileName}"? The local file will be removed.`)) {
        window.InsureClubNative?.deleteDocument?.(doc.id);
        queueOutbox('documents', 'delete', doc.id, null);
        state.documents = state.documents.filter(x => x.id !== doc.id);
        if (doc.policyId) {
          const pol = policyBy(doc.policyId);
          if (pol && !state.documents.some(d => d.policyId === pol.id)) {
            pol.hasDocument = false;
            pol.documentName = '';
            queueOutbox('policies', 'upsert', pol.id, {
              id: pol.id,
              customer_id: pol.customerId,
              customer_name: pol.customerName || null,
              company_name: pol.companyName,
              product_name: pol.productName,
              category_name: pol.categoryName || null,
              policy_number: pol.policyNumber,
              start_date: pol.startDate || null,
              renewal_due_date: pol.renewalDueDate,
              premium_amount: Number(pol.premiumAmount || 0),
              sum_insured: Number(pol.sumInsured || 0),
              status: pol.status || 'Active',
              previous_policy_id: pol.previousPolicyId || null,
              notes: pol.notes || null,
              has_document: false,
              document_name: null,
              created_at: pol.createdAt || isoNow(),
              updated_at: isoNow()
            });
          }
        }
        addActivity(doc.customerId, `Document deleted · ${doc.title || doc.fileName}`);
        persist('document-deleted');
        toast('Local document deleted');
      }
    }

    // Family Member Actions
    if (t.dataset.familyNew) familyForm(t.dataset.familyNew);
    if (t.dataset.familyEdit) {
      const f = state.familyMembers.find(x => x.id === t.dataset.familyEdit);
      familyForm(f.customerId, f.id);
    }
    if (t.dataset.familyDelete) {
      const f = state.familyMembers.find(x => x.id === t.dataset.familyDelete);
      if (f && confirm(`Delete ${f.fullName}?`)) {
        queueOutbox('family_members', 'delete', f.id, null);
        state.familyMembers = state.familyMembers.filter(x => x.id !== f.id);
        state.reminders = state.reminders.filter(x => x.familyMemberId !== f.id);
        addActivity(f.customerId, `Family member deleted · ${f.fullName}`);
        persist('family-deleted');
      }
    }

    // Policy Actions
    if (t.dataset.policyEdit) policyForm('', t.dataset.policyEdit);
    if (t.dataset.appointmentEdit) {
      const a = state.appointments.find(x => x.id === t.dataset.appointmentEdit);
      appointmentForm(a.customerId, a.id);
    }
    if (t.dataset.deleteCustomer) {
      const c = customerBy(t.dataset.deleteCustomer);
      if (c && confirm(`Delete ${c.name} and all linked policies, documents, family, reminders and appointments?`)) {
        state.documents.filter(d => d.customerId === c.id).forEach(d => {
          window.InsureClubNative?.deleteDocument?.(d.id);
          queueOutbox('documents', 'delete', d.id, null);
        });
        state.policies.filter(p => p.customerId === c.id).forEach(p => {
          if (p.hasDocument) window.InsureClubNative?.deletePolicyPdf?.(p.id);
          queueOutbox('policies', 'delete', p.id, null);
        });
        state.familyMembers.filter(f => f.customerId === c.id).forEach(f => {
          queueOutbox('family_members', 'delete', f.id, null);
        });
        state.appointments.filter(a => a.customerId === c.id).forEach(a => {
          queueOutbox('appointments', 'delete', a.id, null);
        });
        queueOutbox('customers', 'delete', c.id, null);
        ARRAYS.forEach(k => {
          if (k === 'customers') state[k] = state[k].filter(x => x.id !== c.id);
          else state[k] = state[k].filter(x => x.customerId !== c.id);
        });
        profile.customerId = null;
        $('#clientProfile').classList.add('hidden');
        persist('customer-deleted');
        toast('Customer and all records deleted');
      }
    }
    if (t.dataset.policyDelete) {
      const p = policyBy(t.dataset.policyDelete);
      if (p && confirm(`Delete policy ${p.policyNumber || p.productName}? This will only delete this specific policy.`)) {
        if (p.hasDocument) window.InsureClubNative?.deletePolicyPdf?.(p.id);
        state.documents.filter(d => d.policyId === p.id).forEach(d => {
          window.InsureClubNative?.deleteDocument?.(d.id);
          queueOutbox('documents', 'delete', d.id, null);
        });
        queueOutbox('policies', 'delete', p.id, null);
        state.policies = state.policies.filter(x => x.id !== p.id);
        state.reminders = state.reminders.filter(x => x.policyId !== p.id);
        state.portingReminders = state.portingReminders.filter(x => x.policyId !== p.id);
        addActivity(p.customerId, `Policy deleted · ${p.productName}`);
        persist('policy-deleted');
      }
    }
    if (t.dataset.policyRenew) renewPolicyForm(t.dataset.policyRenew);
    if (t.dataset.portingNew) portingForm(t.dataset.portingNew);

    // Legacy PDF buttons
    if (t.dataset.addPdf) window.InsureClubNative?.selectPolicyPdf?.(t.dataset.addPdf);
    if (t.dataset.viewPdf) window.InsureClubNative?.viewPolicyPdf?.(t.dataset.viewPdf);
    if (t.dataset.sharePdf) window.InsureClubNative?.sharePolicyPdf?.(t.dataset.sharePdf);
    if (t.dataset.downloadPdf) {
      const p = policyBy(t.dataset.downloadPdf);
      window.InsureClubNative?.downloadPolicyPdf?.(p.id, filenameFor(p));
    }
    if (t.dataset.deletePdf) {
      const p = policyBy(t.dataset.deletePdf);
      if (p && confirm('Delete this policy PDF?')) {
        window.InsureClubNative?.deletePolicyPdf?.(p.id);
        p.hasDocument = false;
        p.documentName = '';
        state.documents = state.documents.filter(d => d.policyId !== p.id);
        queueOutbox('documents', 'delete', `doc-pol-${p.id}`, null);
        queueOutbox('policies', 'upsert', p.id, {
          id: p.id,
          customer_id: p.customerId,
          customer_name: p.customerName || null,
          company_name: p.companyName,
          product_name: p.productName,
          category_name: p.categoryName || null,
          policy_number: p.policyNumber,
          start_date: p.startDate || null,
          renewal_due_date: p.renewalDueDate,
          premium_amount: Number(p.premiumAmount || 0),
          sum_insured: Number(p.sumInsured || 0),
          status: p.status || 'Active',
          previous_policy_id: p.previousPolicyId || null,
          notes: p.notes || null,
          has_document: false,
          document_name: null,
          created_at: p.createdAt || isoNow(),
          updated_at: isoNow()
        });
        addActivity(p.customerId, `Policy PDF deleted · ${p.productName}`);
        persist('policy-document-deleted');
      }
    }

    // Communication Actions
    if (t.dataset.call) window.InsureClubNative?.callPhone?.(t.dataset.call);
    if (t.dataset.whatsapp) {
      $('#messageClient').value = t.dataset.whatsapp;
      renderMessages();
      route('messages');
    }
    if (t.dataset.messageReminder) {
      const r = state.reminders.find(x => x.id === t.dataset.messageReminder);
      $('#messageClient').value = r.customerId;
      const type = r.type === 'Birthday' ? 'Birthday' : r.type === 'Renewal' ? 'Policy Renewal' : r.type === 'Anniversary' ? 'Anniversary' : 'General follow-up';
      const tpl = state.messageTemplates.find(x => x.type === type && x.isDefault) || state.messageTemplates.find(x => x.type === type);
      if (tpl) $('#messageTemplate').value = tpl.id;
      renderMessages();
      route('messages');
    }
    if (t.dataset.fixAppointment) {
      const r = state.reminders.find(x => x.id === t.dataset.fixAppointment);
      appointmentForm(r.customerId);
    }
    if (t.dataset.snooze) snooze(t.dataset.snooze);
    if (t.dataset.completeReminder) {
      const r = state.reminders.find(x => x.id === t.dataset.completeReminder);
      if (r) {
        r.status = 'Completed';
        r.completedAt = isoNow();
        addActivity(r.customerId, `${r.activity} completed`);
        persist('reminder-completed');
      }
    }
    if (t.dataset.performance) {
      const [a, b] = periodRange(t.dataset.performance);
      $('#globalSearch').value = '';
      route('search');
      toast(`Showing policies booked ${fmtDate(a)} to ${fmtDate(b)}`);
      $('#searchResults').innerHTML = state.policies.filter(p => p.status === 'Active' && p.startDate >= a && p.startDate <= b).map(p => `<article class="result-card" data-open-customer="${p.customerId}"><strong>${esc(p.customerName)} · ${money(p.premiumAmount)}</strong><p>${esc(p.companyName)} · ${esc(p.productName)} · ${fmtDate(p.startDate)}</p></article>`).join('') || empty('No contributing policies', 'No active booked premium in this period.');
    }

    if (t.dataset.action === 'backup-now') {
      window.InsureClubAppBackup('manual-backup');
      toast('Creating verified backup…');
    }

    if (t.dataset.templateDelete) {
      const item = state.messageTemplates.find(x => x.id === t.dataset.templateDelete);
      if (item && confirm(`Delete template ${item.name}?`)) {
        state.messageTemplates = state.messageTemplates.filter(x => x.id !== item.id);
        closeForm();
        persist('template-deleted');
      }
    }

    if (t.dataset.choice) {
      const sid = $('#choiceModal').dataset.snooze;
      if (t.dataset.choice === 'cancel') {
        closeChoice();
        delete $('#choiceModal').dataset.snooze;
      } else if (sid) {
        if (t.dataset.choice === 'custom') {
          closeChoice();
          openForm('Snooze until', 'REMINDER', `<label>Date & time<input name="dueAt" type="datetime-local" required></label><button class="primary-button">Snooze reminder</button>`, d => {
            const r = state.reminders.find(x => x.id === sid);
            r.snoozedFrom = r.id;
            r.id = uid('reminder');
            r.dueAt = d.dueAt;
            r.status = 'Pending';
            closeForm();
            persist('reminder-snoozed');
          });
        } else applySnooze(sid, t.dataset.choice);
      } else if (t.dataset.choice === 'replace' || t.dataset.choice === 'merge') {
        window.InsureClubNative?.commitImport?.(t.dataset.choice);
      } else if (t.dataset.choice === 'restore-confirm') {
        window.InsureClubNative?.restoreLatestBackup?.();
      }
    }
  });

  // --- Dynamic Form Submission ---
  $('#dynamicForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!formSubmit) return;
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    formSubmit(data);
  });

  // Search & Filter Listeners
  $('#clientSearch').addEventListener('input', renderClients);
  $('#globalSearch').addEventListener('input', renderSearch);
  ['searchCompany', 'searchCategory', 'searchStatus', 'searchMonth'].forEach(id => $(`#${id}`).addEventListener('change', renderSearch));
  $('#reminderFilters').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) {
      activeReminderFilter = b.dataset.filter;
      renderReminders();
    }
  });

  ['messageClient', 'messagePolicy', 'messageTemplate'].forEach(id => $(`#${id}`).addEventListener('change', () => {
    if (id === 'messageClient') fillSelects();
    resolveTemplate();
  }));

  $('#copyMessage').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#messagePreview').value);
      toast('Message copied');
    } catch {
      toast('Select and copy the message manually');
    }
  });
  $('#shareMessage').addEventListener('click', () => window.InsureClubNative?.shareText?.($('#messagePreview').value));
  $('#sendWhatsApp').addEventListener('click', () => {
    const c = customerBy($('#messageClient').value);
    if (!c) return toast('Choose a customer first');
    window.InsureClubNative?.openWhatsApp?.(c.phone || '', $('#messagePreview').value);
  });

  $('#saveAdvisor').addEventListener('click', () => {
    state.advisorName = $('#advisorName').value.trim() || 'Advisor';
    persist('advisor-updated');
  });

  // --- Popup Notification Settings Listeners ---
  $('#enableNotifications').addEventListener('click', () => window.InsureClubNative?.requestNotifications?.());
  $('#notificationSettings')?.addEventListener('click', () => window.InsureClubNative?.openNotificationSettings?.());
  $('#alarmSettings')?.addEventListener('click', () => window.InsureClubNative?.openAlarmSettings?.());
  $('#testPopupBtn')?.addEventListener('click', () => {
    const sample = state.policies.find(p => p.status === 'Active') || { customerName: 'Manpreet Singh', productName: 'Term Life Care', renewalDueDate: today() };
    window.InsureClubNative?.testPopupNotification?.('InsureClub Popup Alert', `Policy renewal reminder · ${sample.customerName} · ${sample.productName} · Due ${fmtDate(sample.renewalDueDate)}`);
  });
  $('#resyncRemindersBtn')?.addEventListener('click', () => {
    window.InsureClubNative?.clearDeliveredReminders?.();
    persist('reminders-resynced');
    toast('Reminder history cleared and resynced');
  });

  // --- Supabase Cloud Sync UI Handlers ---
  $('#saveSupabaseCreds')?.addEventListener('click', () => {
    state.supabase = state.supabase || {};
    state.supabase.url = ($('#supabaseUrl').value || '').trim() || DEFAULT_SUPABASE.url;
    state.supabase.anonKey = ($('#supabaseAnonKey').value || '').trim() || DEFAULT_SUPABASE.anonKey;
    state.supabase.autoSync = Boolean($('#supabaseAutoSync').checked);
    state.supabase.status = state.supabase.url ? 'Connected' : 'Not configured';
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    renderSettings();
    toast('Supabase configuration saved');
    if (state.supabase.autoSync && navigator.onLine) {
      performSync(false);
      initSupabaseRealtime();
    }
  });

  $('#testSupabaseBtn')?.addEventListener('click', async () => {
    const url = ($('#supabaseUrl').value || '').trim() || state.supabase?.url || DEFAULT_SUPABASE.url;
    const key = ($('#supabaseAnonKey').value || '').trim() || state.supabase?.anonKey || DEFAULT_SUPABASE.anonKey;
    if (!url || !key) return toast('Enter Supabase URL and Anon Key');
    if (Auth && url.replace(/\/+$/, '') === Auth.PROJECT_URL && !Auth.isSignedIn()) {
      Auth.prompt();
      return;
    }
    toast('Testing Supabase connection…');
    try {
      await SupabaseSync.testConnection(url, key);
      state.supabase.status = 'Connected';
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      renderSettings();
      toast('Supabase connection verified ✓');
    } catch (err) {
      state.supabase.status = 'Error';
      renderSettings();
      alert(`Supabase connection notice:\n${err.message}`);
    }
  });

  
  $('#copySchemaBtn')?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      } else {
        const ta = document.createElement('textarea');
        ta.value = SUPABASE_SCHEMA_SQL;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast('SQL Schema copied to clipboard ✓');
    } catch {
      toast('Could not copy schema automatically');
    }
  });

  $('#syncNowBtn')?.addEventListener('click', () => performSync(true));
  $('#topbarSyncBtn')?.addEventListener('click', () => performSync(true));

  // Advisor sign-in card above the sync controls in Settings.
  if (Auth && $('#syncStatusBanner')) {
    const holder = document.createElement('div');
    holder.style.margin = '0 0 12px';
    const banner = $('#syncStatusBanner');
    banner.parentElement.insertBefore(holder, banner);
    Auth.mount(holder);
  }

  // Backup & Restore
  $('#exportBackup').addEventListener('click', () => window.InsureClubNative?.exportData?.(JSON.stringify(state)));
  $('#importBackup').addEventListener('click', () => window.InsureClubNative?.inspectImport?.());
  $('#restoreBackup').addEventListener('click', () => choice('Restore latest backup', 'This will replace the current data with the last safe automatic backup. Export first if you need another copy.', [{ id: 'cancel', label: 'Cancel' }, { id: 'restore-confirm', label: 'Restore', danger: true }]));

  // Native Callbacks
  window.onNativeNotificationPermission = enabled => {
    const b = $('#enableNotifications');
    if (b) {
      b.textContent = enabled ? 'Popup reminders active ✓' : 'Enable popup reminders';
      b.classList.toggle('enabled', enabled);
    }
  };
  window.onNativeReady = raw => {
    try {
      const i = JSON.parse(raw);
      updateBackupInfo(i);
    } catch {}
  };
  window.onBackupCompleted = raw => {
    try {
      const i = JSON.parse(raw);
      state.backupMetadata = i;
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      updateBackupInfo(i);
    } catch {}
  };
  function updateBackupInfo(i) {
    if ($('#lastBackup')) {
      $('#lastBackup').textContent = i?.available && i.backupDate ? `Last safe backup: ${fmtDateTime(i.backupDate)}` : 'No backup created yet';
    }
  }

  window.onExportCompleted = () => toast('Complete backup exported (including all local documents)');
  window.onNativeFileError = message => toast(message || 'File operation failed');
  window.onPolicyDownloadCompleted = () => toast('Document downloaded successfully');

  window.onImportInspected = raw => {
    pendingImportSummary = JSON.parse(raw);
    choice('Validated InsureClub backup', `Backup: ${fmtDateTime(pendingImportSummary.backupDate)} · ${pendingImportSummary.customers} customers · ${pendingImportSummary.policies} policies · ${pendingImportSummary.familyMembers} family members. Replace current data or merge records with unique IDs?`, [
      { id: 'replace', label: 'Replace', danger: true },
      { id: 'merge', label: 'Merge safely' }
    ]);
  };

  window.onImportCommitted = (raw, mode, date) => {
    const imported = JSON.parse(raw);
    if (mode === 'replace') state = imported;
    else mergeState(imported);
    closeChoice();
    persist('backup-imported');
    toast(`Backup from ${fmtDateTime(date)} restored`);
  };

  window.onRestoreReady = (raw, date) => {
    state = JSON.parse(raw);
    closeChoice();
    persist('automatic-backup-restored');
    toast(`Restored backup from ${fmtDateTime(date)}`);
  };

  // Initial Boot
  ensureAutomaticReminders();
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  renderAll();
  startAutoSyncEngine();
  if (window.InsureClubNative?.notificationsEnabled) {
    window.onNativeNotificationPermission(window.InsureClubNative.notificationsEnabled());
  }
})();
