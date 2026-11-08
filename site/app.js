/**
 * InsureClub Cloud Database Console
 * Direct Supabase PostgreSQL Client & Management Application
 * With Dual-Mode Engine: Seamless Local Sandbox & Live Cloud Sync
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'insureclub_cloud_portal_state_v1';
  const Auth = window.InsureClubAuth;
  // Live InsureClub cloud project (data access requires an advisor sign-in, see supabase-auth.js).
  const DEFAULT_SUPABASE = {
    url: Auth ? Auth.PROJECT_URL : 'https://pzezoumopzwczakpsdlk.supabase.co',
    anonKey: Auth ? Auth.PUBLISHABLE_KEY : 'sb_publishable_M6hWtVUT1bwaAkV2Ma6VKw_OzToQzvz'
  };
  // Offline demo mode (sample data in this browser only).
  const SANDBOX_SUPABASE = {
    url: 'https://insureclub-sync.supabase.co',
    anonKey: 'sandbox'
  };
  const isLiveProject = url => (Auth ? Auth.isProjectUrl(url) : String(url || '').replace(/\/+$/, '') === DEFAULT_SUPABASE.url);
  const needsSignIn = () => Boolean(Auth) && isLiveProject(state.supabase?.url) && !Auth.isSignedIn();

  // Pre-bundled SQL schema for 1-click execution in Supabase SQL editor
  const SUPABASE_SCHEMA_SQL = "-- InsureClub CRM - Supabase Database Schema\n-- Provides cloud database storage and multi-device sync for customers, policies,\n-- family members, appointments, reminders, document metadata, and templates.\n-- NOTE: In accordance with local-first privacy requirements, physical attached\n-- files (PDFs, images, scans) are stored locally on device storage. Only metadata\n-- is synced in the documents table.\n\n-- 1. Customers Table\nCREATE TABLE IF NOT EXISTS public.customers (\n    id TEXT PRIMARY KEY,\n    name TEXT NOT NULL,\n    phone TEXT,\n    email TEXT,\n    city TEXT,\n    address TEXT,\n    date_of_birth DATE,\n    anniversary_date DATE,\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 2. Policies Table\n-- Stores all policies. When a policy is renewed, older policies remain intact\n-- with status 'Renewed' or 'Historical' and are NEVER deleted.\nCREATE TABLE IF NOT EXISTS public.policies (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    company_name TEXT NOT NULL,\n    product_name TEXT NOT NULL,\n    category_name TEXT,\n    policy_number TEXT NOT NULL,\n    start_date DATE,\n    renewal_due_date DATE NOT NULL,\n    premium_amount NUMERIC(12, 2) DEFAULT 0,\n    sum_insured NUMERIC(14, 2) DEFAULT 0,\n    status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Renewed', 'Historical', 'Expired', 'Cancelled'\n    previous_policy_id TEXT REFERENCES public.policies(id) ON DELETE SET NULL,\n    notes TEXT,\n    has_document BOOLEAN DEFAULT false,\n    document_name TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 3. Family Members Table\nCREATE TABLE IF NOT EXISTS public.family_members (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,\n    full_name TEXT NOT NULL,\n    relationship TEXT NOT NULL,\n    date_of_birth DATE,\n    mobile TEXT,\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 4. Appointments Table\nCREATE TABLE IF NOT EXISTS public.appointments (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    date DATE NOT NULL,\n    time TEXT,\n    purpose TEXT NOT NULL,\n    product_name TEXT,\n    company_name TEXT,\n    reminder_at TIMESTAMPTZ,\n    status TEXT NOT NULL DEFAULT 'Scheduled',\n    notes TEXT,\n    follow_up_at TIMESTAMPTZ,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 5. Reminders Table\nCREATE TABLE IF NOT EXISTS public.reminders (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    policy_id TEXT REFERENCES public.policies(id) ON DELETE CASCADE,\n    family_member_id TEXT REFERENCES public.family_members(id) ON DELETE CASCADE,\n    type TEXT NOT NULL,\n    activity TEXT NOT NULL,\n    due_at TIMESTAMPTZ NOT NULL,\n    status TEXT NOT NULL DEFAULT 'Pending',\n    notes TEXT,\n    auto BOOLEAN DEFAULT false,\n    completed_at TIMESTAMPTZ,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 6. Document Metadata Table (Local-First: Binaries stay on local device storage)\n-- Tracks PAN cards, birth certificates, policy documents, Aadhaar cards, etc.\nCREATE TABLE IF NOT EXISTS public.documents (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    policy_id TEXT REFERENCES public.policies(id) ON DELETE SET NULL,\n    family_member_id TEXT REFERENCES public.family_members(id) ON DELETE SET NULL,\n    document_type TEXT NOT NULL, -- 'PAN Card', 'Birth Certificate', 'Aadhaar Card', 'Policy Document', etc.\n    title TEXT NOT NULL,\n    file_name TEXT NOT NULL,\n    file_size BIGINT DEFAULT 0,\n    mime_type TEXT DEFAULT 'application/pdf',\n    local_storage_path TEXT,\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 7. Porting Reminders Table\nCREATE TABLE IF NOT EXISTS public.porting_reminders (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,\n    customer_name TEXT,\n    policy_id TEXT REFERENCES public.policies(id) ON DELETE CASCADE,\n    existing_company TEXT,\n    existing_policy TEXT,\n    renewal_date DATE,\n    target_company TEXT,\n    target_product TEXT,\n    reminder_date DATE,\n    status TEXT NOT NULL DEFAULT 'Pending',\n    notes TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 8. Message Templates Table\nCREATE TABLE IF NOT EXISTS public.message_templates (\n    id TEXT PRIMARY KEY,\n    name TEXT NOT NULL,\n    type TEXT NOT NULL,\n    body TEXT NOT NULL,\n    is_default BOOLEAN DEFAULT false,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- 9. Activities / Audit Logs Table\nCREATE TABLE IF NOT EXISTS public.activities (\n    id TEXT PRIMARY KEY,\n    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,\n    type TEXT NOT NULL,\n    text TEXT NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\n\n-- Indexes for lightning fast queries\nCREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);\nCREATE INDEX IF NOT EXISTS idx_policies_customer_id ON public.policies(customer_id);\nCREATE INDEX IF NOT EXISTS idx_policies_renewal_due_date ON public.policies(renewal_due_date);\nCREATE INDEX IF NOT EXISTS idx_policies_status ON public.policies(status);\nCREATE INDEX IF NOT EXISTS idx_family_customer_id ON public.family_members(customer_id);\nCREATE INDEX IF NOT EXISTS idx_reminders_due_at ON public.reminders(due_at);\nCREATE INDEX IF NOT EXISTS idx_reminders_status ON public.reminders(status);\nCREATE INDEX IF NOT EXISTS idx_documents_customer_id ON public.documents(customer_id);\nCREATE INDEX IF NOT EXISTS idx_documents_policy_id ON public.documents(policy_id);\nCREATE INDEX IF NOT EXISTS idx_documents_type ON public.documents(document_type);\n\n-- Access control\n-- CRM data holds customer personal and policy details, so the public (anon) key\n-- alone must never read or write it. Only signed-in Supabase Auth users whose\n-- confirmed email is listed in public.crm_members get access.\n--\n-- Add an advisor:  INSERT INTO public.crm_members (email) VALUES ('advisor@example.com');\n-- (Create their login first: Supabase dashboard -> Authentication -> Users -> Add user.)\n\nCREATE TABLE IF NOT EXISTS public.crm_members (\n    email TEXT PRIMARY KEY,\n    role TEXT NOT NULL DEFAULT 'advisor',\n    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())\n);\nALTER TABLE public.crm_members ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON public.crm_members FROM anon, authenticated;\n\n-- Lives in a private schema so it is not callable through the REST API.\nCREATE SCHEMA IF NOT EXISTS private;\nREVOKE ALL ON SCHEMA private FROM PUBLIC, anon;\nGRANT USAGE ON SCHEMA private TO authenticated;\n\nCREATE OR REPLACE FUNCTION private.is_crm_member()\nRETURNS BOOLEAN\nLANGUAGE sql\nSTABLE\nSECURITY DEFINER\nSET search_path = ''\nAS $$\n    SELECT EXISTS (\n        SELECT 1\n        FROM auth.users u\n        JOIN public.crm_members m ON lower(m.email) = lower(u.email)\n        WHERE u.id = auth.uid()\n          AND u.email_confirmed_at IS NOT NULL\n    );\n$$;\nREVOKE ALL ON FUNCTION private.is_crm_member() FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION private.is_crm_member() TO authenticated;\n\nALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.porting_reminders ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;\n\nDO $$\nDECLARE\n    t TEXT;\nBEGIN\n    FOREACH t IN ARRAY ARRAY['customers', 'policies', 'family_members', 'appointments', 'reminders',\n                             'documents', 'porting_reminders', 'message_templates', 'activities']\n    LOOP\n        -- Remove the old wide-open policy from earlier versions of this schema.\n        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Anon public access to ' || t, t);\n        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'CRM members full access', t);\n        EXECUTE format(\n            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT private.is_crm_member())) WITH CHECK ((SELECT private.is_crm_member()))',\n            'CRM members full access', t);\n        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);\n        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);\n    END LOOP;\nEND $$;\n\n-- Live updates for the web portal (respects the policies above).\nDO $$\nDECLARE\n    t TEXT;\nBEGIN\n    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN\n        FOREACH t IN ARRAY ARRAY['customers', 'policies', 'family_members', 'appointments', 'documents']\n        LOOP\n            IF NOT EXISTS (\n                SELECT 1 FROM pg_publication_tables\n                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t\n            ) THEN\n                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);\n            END IF;\n        END LOOP;\n    END IF;\nEND $$;\n";

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

  // Detect sandbox placeholder vs real user Supabase project
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

  function sanitizeNetworkError(err) {
    const msg = err?.message || String(err);
    if (/load failed|failed to fetch|network error|eai_again|getaddrinfo/i.test(msg)) {
      return 'Could not reach Supabase cloud host. Verify Project URL or internet connection.';
    }
    return msg;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Built-in Sample CRM Data for Instant Offline Sandbox
  const SAMPLE_DATA = {
    customers: [
      {
        id: 'cust-demo-1',
        name: 'Rahul Sharma',
        phone: '9876543210',
        city: 'New Delhi',
        date_of_birth: '1985-05-14',
        anniversary_date: '2012-11-20',
        notes: 'VIP Client • Optima Secure Family Floater + Term Life. Prefers renewal notifications via WhatsApp.',
        created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 86400000).toISOString()
      },
      {
        id: 'cust-demo-2',
        name: 'Priya Verma',
        phone: '9812345678',
        city: 'Mumbai',
        date_of_birth: '1990-08-22',
        anniversary_date: '2018-02-14',
        notes: 'Senior Product Manager • Pure term protection & critical illness rider. PAN and Birth Certificate on file.',
        created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 86400000).toISOString()
      },
      {
        id: 'cust-demo-3',
        name: 'Manpreet Singh',
        phone: '9988776655',
        city: 'Chandigarh',
        date_of_birth: '1982-01-10',
        anniversary_date: '2008-10-18',
        notes: 'Fleet operator • Private car comprehensive and family health. Porting inquiry pending for parents.',
        created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 86400000).toISOString()
      }
    ],
    policies: [
      {
        id: 'pol-demo-1',
        customer_id: 'cust-demo-1',
        customer_name: 'Rahul Sharma',
        company_name: 'HDFC ERGO General Insurance',
        product_name: 'Optima Secure Family Floater',
        category_name: 'Health Insurance',
        policy_number: 'HDFC-OPT-884920',
        start_date: new Date(Date.now() - 340 * 86400000).toISOString().slice(0, 10),
        renewal_due_date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
        premium_amount: 18500,
        sum_insured: 1000000,
        status: 'Active',
        notes: '2 Adults + 1 Child. Includes 2x Restore benefit and zero deductible.',
        has_document: true,
        document_name: 'HDFC_OptimaSecure_Schedule.pdf',
        created_at: new Date(Date.now() - 340 * 86400000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'pol-demo-2',
        customer_id: 'cust-demo-1',
        customer_name: 'Rahul Sharma',
        company_name: 'Star Health Insurance',
        product_name: 'Family Health Optima (Previous Year)',
        category_name: 'Health Insurance',
        policy_number: 'STAR-FHO-772911',
        start_date: new Date(Date.now() - 705 * 86400000).toISOString().slice(0, 10),
        renewal_due_date: new Date(Date.now() - 340 * 86400000).toISOString().slice(0, 10),
        premium_amount: 14200,
        sum_insured: 500000,
        status: 'Renewed',
        notes: 'PRESERVED HISTORICAL TERM: Upgraded to HDFC ERGO upon renewal. Preserved permanently in database.',
        has_document: true,
        document_name: 'StarHealth_PriorYear_Receipt.pdf',
        created_at: new Date(Date.now() - 705 * 86400000).toISOString(),
        updated_at: new Date(Date.now() - 340 * 86400000).toISOString()
      },
      {
        id: 'pol-demo-3',
        customer_id: 'cust-demo-2',
        customer_name: 'Priya Verma',
        company_name: 'Tata AIA Life Insurance',
        product_name: 'Sampoorna Raksha Supreme',
        category_name: 'Term Life Insurance',
        policy_number: 'TATA-SRS-551029',
        start_date: new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10),
        renewal_due_date: new Date(Date.now() + 165 * 86400000).toISOString().slice(0, 10),
        premium_amount: 24000,
        sum_insured: 10000000,
        status: 'Active',
        notes: 'Sum Insured: ₹1.00 Crore. Term up to age 75 with critical illness rider.',
        has_document: true,
        document_name: 'Tata_Sampoorna_Policy.pdf',
        created_at: new Date(Date.now() - 200 * 86400000).toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'pol-demo-4',
        customer_id: 'cust-demo-3',
        customer_name: 'Manpreet Singh',
        company_name: 'ICICI Lombard General Insurance',
        product_name: 'Private Car Comprehensive Policy',
        category_name: 'Motor Insurance',
        policy_number: 'ICICI-MOT-991204',
        start_date: new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10),
        renewal_due_date: new Date(Date.now() + 245 * 86400000).toISOString().slice(0, 10),
        premium_amount: 12800,
        sum_insured: 650000,
        status: 'Active',
        notes: 'Hyundai Creta 1.5 SX. Zero depreciation + Return to Invoice cover.',
        has_document: true,
        document_name: 'ICICI_Car_Insurance_Schedule.pdf',
        created_at: new Date(Date.now() - 120 * 86400000).toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    familyMembers: [
      {
        id: 'fam-demo-1',
        customer_id: 'cust-demo-1',
        full_name: 'Priya Sharma',
        relationship: 'Spouse',
        date_of_birth: '1988-03-12',
        mobile: '9876543211',
        notes: 'Covered under HDFC ERGO family floater'
      },
      {
        id: 'fam-demo-2',
        customer_id: 'cust-demo-1',
        full_name: 'Aarav Sharma',
        relationship: 'Son',
        date_of_birth: '2015-09-04',
        mobile: null,
        notes: 'Birth certificate registered in local document vault'
      },
      {
        id: 'fam-demo-3',
        customer_id: 'cust-demo-2',
        full_name: 'Vikram Verma',
        relationship: 'Spouse',
        date_of_birth: '1989-12-05',
        mobile: '9812345679',
        notes: 'Nominee for Tata AIA Term Life policy'
      }
    ],
    documents: [
      {
        id: 'doc-demo-1',
        customer_id: 'cust-demo-1',
        customer_name: 'Rahul Sharma',
        document_type: 'PAN Card',
        title: 'Rahul Sharma Verified PAN Card',
        file_name: 'PAN_RahulSharma_Original.pdf',
        file_size: 425984,
        mime_type: 'application/pdf',
        local_storage_path: '/storage/emulated/0/InsureClub/documents/PAN_RahulSharma.pdf',
        notes: 'Physical binary file stays on local device storage. Cloud synchronizes metadata.',
        created_at: new Date(Date.now() - 60 * 86400000).toISOString()
      },
      {
        id: 'doc-demo-2',
        customer_id: 'cust-demo-1',
        customer_name: 'Rahul Sharma',
        document_type: 'Birth Certificate',
        title: 'Aarav Sharma Municipal Birth Certificate',
        file_name: 'BirthCertificate_Aarav.pdf',
        file_size: 819200,
        mime_type: 'application/pdf',
        local_storage_path: '/storage/emulated/0/InsureClub/documents/BC_Aarav.pdf',
        notes: 'Attached for age verification in family floater.',
        created_at: new Date(Date.now() - 55 * 86400000).toISOString()
      },
      {
        id: 'doc-demo-3',
        customer_id: 'cust-demo-1',
        customer_name: 'Rahul Sharma',
        document_type: 'Policy Document',
        title: 'HDFC ERGO Optima Secure Schedule',
        file_name: 'HDFC_OptimaSecure_Schedule.pdf',
        file_size: 1450000,
        mime_type: 'application/pdf',
        local_storage_path: '/storage/emulated/0/InsureClub/documents/Policy_HDFC_884920.pdf',
        notes: 'Complete terms & conditions schedule.',
        created_at: new Date(Date.now() - 340 * 86400000).toISOString()
      },
      {
        id: 'doc-demo-4',
        customer_id: 'cust-demo-2',
        customer_name: 'Priya Verma',
        document_type: 'PAN Card',
        title: 'Priya Verma Verified PAN Card',
        file_name: 'PAN_PriyaVerma_Scan.jpg',
        file_size: 312000,
        mime_type: 'image/jpeg',
        local_storage_path: '/storage/emulated/0/InsureClub/documents/PAN_PriyaVerma.jpg',
        notes: 'Verified e-PAN copy for KYC completion.',
        created_at: new Date(Date.now() - 45 * 86400000).toISOString()
      }
    ],
    appointments: [
      {
        id: 'apt-demo-1',
        customer_id: 'cust-demo-1',
        customer_name: 'Rahul Sharma',
        date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
        time: '11:30 AM',
        purpose: 'Annual Health Portfolio Review & Super Top-Up Proposal',
        company_name: 'HDFC ERGO',
        product_name: 'my:health Medisure Super Top Up',
        status: 'Scheduled',
        notes: 'Review restoration benefits and consider ₹25L super top-up coverage.',
        created_at: new Date().toISOString()
      },
      {
        id: 'apt-demo-2',
        customer_id: 'cust-demo-3',
        customer_name: 'Manpreet Singh',
        date: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10),
        time: '04:00 PM',
        purpose: 'Commercial Vehicle Porting Consultation',
        company_name: 'ICICI Lombard',
        product_name: 'Commercial Goods Carrier Package',
        status: 'Scheduled',
        notes: 'Discuss fleet renewal terms and NCB discount transfer.',
        created_at: new Date().toISOString()
      }
    ],
    reminders: [
      {
        id: 'rem-demo-1',
        customer_id: 'cust-demo-1',
        customer_name: 'Rahul Sharma',
        type: 'Policy Renewal',
        activity: 'HDFC ERGO Optima Secure Renewal Due (₹18,500)',
        due_at: new Date(Date.now() + 20 * 86400000).toISOString(),
        status: 'Pending',
        notes: 'Send payment link via WhatsApp and verify no-claim cumulative bonus multiplier.',
        created_at: new Date().toISOString()
      },
      {
        id: 'rem-demo-2',
        customer_id: 'cust-demo-2',
        customer_name: 'Priya Verma',
        type: 'Birthday Wish',
        activity: 'Send Birthday Greetings & Policy Health Checkup Reminder',
        due_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        status: 'Pending',
        notes: 'Send personalized birthday graphic greeting.',
        created_at: new Date().toISOString()
      }
    ]
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
    connectionStatus: 'sandbox' // 'sandbox', 'connected', 'connecting', 'offline'
  };

  function isSandboxMode() {
    return isPlaceholderUrl(state.supabase?.url);
  }

  function seedSampleDataIfNeeded() {
    if (!state.customers || state.customers.length === 0) {
      state.customers = JSON.parse(JSON.stringify(SAMPLE_DATA.customers));
      state.policies = JSON.parse(JSON.stringify(SAMPLE_DATA.policies));
      state.familyMembers = JSON.parse(JSON.stringify(SAMPLE_DATA.familyMembers));
      state.documents = JSON.parse(JSON.stringify(SAMPLE_DATA.documents));
      state.appointments = JSON.parse(JSON.stringify(SAMPLE_DATA.appointments));
      state.reminders = JSON.parse(JSON.stringify(SAMPLE_DATA.reminders));
      persistState();
    }
  }

  // Load persisted cache
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (cached) {
      state = { ...state, ...cached };
      if (!state.supabase?.url) state.supabase = { ...DEFAULT_SUPABASE };
      // Any saved address for this project (typed by hand earlier) -> canonical URL + key.
      if (isLiveProject(state.supabase.url)) {
        state.supabase = { ...DEFAULT_SUPABASE };
      }
      // One-time move from the old placeholder project to the live cloud project.
      // The old sandbox data is kept in a separate backup key, never deleted.
      if (state.supabase.url === SANDBOX_SUPABASE.url && !state.sandboxChosen) {
        localStorage.setItem(`${STORAGE_KEY}_sandbox_backup`, JSON.stringify(cached));
        state.supabase = { ...DEFAULT_SUPABASE };
        ['customers', 'policies', 'familyMembers', 'appointments', 'reminders', 'documents'].forEach(k => { state[k] = []; });
      }
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
      if (isPlaceholderUrl(this.getBaseUrl())) {
        return [];
      }
      const url = `${this.getBaseUrl()}/rest/v1/${table}${params ? (params.startsWith('?') ? params : '?' + params) : ''}`;
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders()
      }, 8000);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      return await res.json();
    },

    async upsert(table, payload) {
      const url = `${this.getBaseUrl()}/rest/v1/${table}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(payload)
      }, 9000);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upsert error (${res.status}): ${text || res.statusText}`);
      }
      return await res.json();
    },

    async remove(table, id) {
      const url = `${this.getBaseUrl()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
      const res = await fetchWithTimeout(url, {
        method: 'DELETE',
        headers: this.getHeaders()
      }, 8000);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Delete error (${res.status}): ${text || res.statusText}`);
      }
      return true;
    },

    async ping(url, key) {
      const cleanUrl = (url || this.getBaseUrl()).replace(/\/+$/, '');
      const cleanKey = key || (state.supabase.anonKey || DEFAULT_SUPABASE.anonKey);
      if (isPlaceholderUrl(cleanUrl)) {
        throw new Error('Default placeholder URL is not an active Supabase project. Enter your real project URL.');
      }
      const start = performance.now();
      const res = await fetchWithTimeout(`${cleanUrl}/rest/v1/customers?select=count&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': cleanKey,
          'Authorization': `Bearer ${cleanKey}`,
          'Accept': 'application/json'
        }
      }, 7000);
      const duration = Math.round(performance.now() - start);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
      }
      return { success: true, latency: duration };
    }
  };

  // --- Unified Dual-Mode DataStore ---
  const DataStore = {
    isSandbox() {
      return isSandboxMode();
    },

    tableToListKey(table) {
      if (table === 'family_members') return 'familyMembers';
      return table;
    },

    async upsert(table, record) {
      const listKey = this.tableToListKey(table);
      const arr = state[listKey] || [];
      const idx = arr.findIndex(x => x.id === record.id);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...record };
      } else {
        arr.unshift(record);
      }
      state[listKey] = arr;
      persistState();
      renderAll();

      if (!this.isSandbox()) {
        try {
          await Supabase.upsert(table, record);
        } catch (err) {
          console.warn(`Supabase upsert cloud notice for ${table}:`, err);
          throw new Error(sanitizeNetworkError(err));
        }
      }
      return record;
    },

    async remove(table, id) {
      const listKey = this.tableToListKey(table);
      state[listKey] = (state[listKey] || []).filter(x => x.id !== id);
      persistState();
      renderAll();

      if (!this.isSandbox()) {
        try {
          await Supabase.remove(table, id);
        } catch (err) {
          console.warn(`Supabase delete cloud notice for ${table}:`, err);
          throw new Error(sanitizeNetworkError(err));
        }
      }
      return true;
    },

    async fetchAll(silent = false) {
      if (this.isSandbox()) {
        seedSampleDataIfNeeded();
        setConnectionStatus('sandbox');
        renderAll();
        if (!silent) toast('Local Sandbox active: All features ready offline ✓', 'info');
        return true;
      }
      return await fetchCloudData(silent);
    }
  };

  // --- Realtime WebSocket Connection ---
  let realtimeWs = null;
  let realtimeHeartbeat = null;
  let wsMsgRef = 1;

  function initRealtime() {
    if (isSandboxMode()) {
      if (realtimeWs) {
        try { realtimeWs.close(); } catch {}
        realtimeWs = null;
      }
      clearInterval(realtimeHeartbeat);
      return;
    }

    const url = state.supabase?.url;
    const key = state.supabase?.anonKey;
    if (!url || !key) return;
    if (needsSignIn()) return;

    try {
      if (realtimeWs && (realtimeWs.readyState === WebSocket.OPEN || realtimeWs.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const wsUrl = url.replace(/^http/, 'ws').replace(/\/+$/, '') + `/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
      realtimeWs = new WebSocket(wsUrl);

      realtimeWs.onopen = async () => {
        clearInterval(realtimeHeartbeat);
        // Realtime enforces the same row-level security, so join with the advisor's token.
        const accessToken = isLiveProject(url) && Auth ? await Auth.accessToken().catch(() => null) : null;
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
        setConnectionStatus('connected', Auth?.email() || undefined);
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
        if (!isSandboxMode()) {
          setTimeout(initRealtime, 8000);
        }
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

  function setConnectionStatus(status, detail) {
    state.connectionStatus = status;
    const pill = $('#connectionPill');
    const txt = $('#connectionText');
    const banner = $('#sandboxBanner');

    if (pill && txt) {
      pill.className = `status-pill ${status}`;
      if (status === 'sandbox') {
        txt.textContent = 'Local Sandbox Mode';
        pill.title = 'Running in Local Sandbox Mode — Click to configure live Supabase';
      } else if (status === 'connected') {
        txt.textContent = detail ? `Supabase Connected (${detail})` : 'Supabase Connected';
        pill.title = 'Connected to Supabase PostgreSQL cloud';
      } else if (status === 'signin') {
        txt.textContent = 'Sign in to view cloud data';
        pill.title = 'Sign in with your advisor account to load InsureClub cloud data';
      } else if (status === 'connecting') {
        txt.textContent = 'Connecting to Supabase…';
        pill.title = 'Connecting to Supabase cloud';
      } else {
        txt.textContent = 'Cloud Offline / Local Cache';
        pill.title = 'Supabase unreachable — using local storage cache';
      }
    }

    if (banner) {
      banner.style.display = status === 'sandbox' ? 'flex' : 'none';
    }
  }

  // --- Fetch All Data from Supabase ---
  async function fetchCloudData(silent = false) {
    if (isSandboxMode()) {
      return await DataStore.fetchAll(silent);
    }

    if (needsSignIn()) {
      setConnectionStatus('signin');
      renderAll();
      if (!silent) Auth.prompt();
      return false;
    }

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

      setConnectionStatus('connected', Auth?.email() || undefined);
      persistState();
      renderAll();

      if ($('#lastSyncLabel')) {
        $('#lastSyncLabel').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
      }

      if (!silent) toast('Synced live with Supabase cloud database ✓', 'success');
      return true;
    } catch (err) {
      console.warn('fetchCloudData notice:', err);
      setConnectionStatus('offline');
      const friendly = sanitizeNetworkError(err);
      if (!silent) toast(`Cloud sync notice: ${friendly}`, 'error');
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
    if ($('#kpiPreservedPolicies')) $('#kpiPreservedPolicies').textContent = `${preservedPols.length} historical term${preservedPols.length === 1 ? '' : 's'} preserved`;
    if ($('#kpiPremium')) $('#kpiPremium').textContent = fmtCurrency(totalPremium);
    if ($('#kpiCoverage')) $('#kpiCoverage').textContent = fmtCurrency(totalSumInsured);

    // Recent Policies Table
    const polTbody = $('#upcomingRenewalsTable');
    if (polTbody) {
      if (state.policies.length === 0) {
        polTbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No policies recorded yet.</td></tr>';
      } else {
        polTbody.innerHTML = state.policies.slice(0, 6).map(p => `
          <tr>
            <td><strong>${esc(p.policy_number)}</strong></td>
            <td>${esc(p.customer_name || '—')}</td>
            <td>${esc(p.company_name)} • ${esc(p.product_name)}</td>
            <td><strong>${fmtCurrency(p.premium_amount)}</strong></td>
            <td>${fmtDate(p.renewal_due_date)}</td>
            <td><span class="badge status-${(p.status || 'Active').toLowerCase()}">${esc(p.status || 'Active')}</span></td>
          </tr>
        `).join('');
      }
    }

    // Reminders Feed
    const remFeed = $('#upcomingRemindersFeed');
    if (remFeed) {
      const pendingReminders = state.reminders.filter(r => (r.status || 'Pending').toLowerCase() === 'pending').slice(0, 5);
      if (pendingReminders.length === 0) {
        remFeed.innerHTML = '<div class="empty-feed">No pending reminders. All tasks caught up!</div>';
      } else {
        remFeed.innerHTML = pendingReminders.map(r => `
          <div class="feed-item">
            <div class="feed-icon">${r.type === 'Policy Renewal' ? '📋' : (r.type === 'Birthday Wish' ? '🎂' : '⏰')}</div>
            <div class="feed-body">
              <div class="feed-title">${esc(r.activity)}</div>
              <div class="feed-meta">${esc(r.customer_name || 'Client')} • Due: ${fmtDate(r.due_at)}</div>
            </div>
            <button class="btn sm secondary" data-complete-reminder="${esc(r.id)}">Done</button>
          </div>
        `).join('');
      }
    }

    // Appointments Feed
    const aptFeed = $('#upcomingAppointmentsFeed');
    if (aptFeed) {
      const pendingApts = state.appointments.filter(a => (a.status || 'Scheduled').toLowerCase() === 'scheduled').slice(0, 5);
      if (pendingApts.length === 0) {
        aptFeed.innerHTML = '<div class="empty-feed">No appointments scheduled.</div>';
      } else {
        aptFeed.innerHTML = pendingApts.map(a => `
          <div class="feed-item">
            <div class="feed-icon">📅</div>
            <div class="feed-body">
              <div class="feed-title">${esc(a.purpose)}</div>
              <div class="feed-meta">${esc(a.customer_name || 'Client')} • ${fmtDate(a.date)} at ${esc(a.time || 'TBD')}</div>
            </div>
            <span class="badge info">${esc(a.status)}</span>
          </div>
        `).join('');
      }
    }
  }

  // 2. Customers Renderer
  function renderCustomers() {
    const tbody = $('#customersTableBody');
    if (!tbody) return;

    const query = ($('#customerSearch')?.value || '').toLowerCase().trim();
    const filtered = state.customers.filter(c => {
      if (!query) return true;
      return (c.name || '').toLowerCase().includes(query) ||
             (c.phone || '').toLowerCase().includes(query) ||
             (c.city || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No matching customers found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const customerPols = state.policies.filter(p => p.customer_id === c.id);
      const activePols = customerPols.filter(p => (p.status || 'Active').toLowerCase() === 'active');
      const totalPrem = activePols.reduce((sum, p) => sum + Number(p.premium_amount || 0), 0);
      const customerDocs = state.documents.filter(d => d.customer_id === c.id);

      return `
        <tr>
          <td>
            <div class="cust-name-cell">
              <span class="cust-avatar">${esc(c.name.slice(0, 2).toUpperCase())}</span>
              <div>
                <a href="#" class="cust-link" data-view-customer="${esc(c.id)}">${esc(c.name)}</a>
                <div class="table-subtext">${esc(c.city || 'No city')}</div>
              </div>
            </div>
          </td>
          <td>${esc(c.phone || '—')}</td>
          <td>
            <span class="badge ${activePols.length > 0 ? 'success' : 'default'}">
              ${activePols.length} Active / ${customerPols.length} Total
            </span>
          </td>
          <td><strong>${fmtCurrency(totalPrem)}</strong></td>
          <td>
            <span class="badge info">${customerDocs.length} files attached</span>
          </td>
          <td class="action-cell">
            <button class="icon-btn" data-view-customer="${esc(c.id)}" title="View Customer Dossier">👁️</button>
            <button class="icon-btn" data-edit-customer="${esc(c.id)}" title="Edit Customer">✏️</button>
            <button class="icon-btn delete" data-delete-customer="${esc(c.id)}" title="Delete Customer">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 3. Customer Detail Drawer
  function renderCustomerDrawer(customerId) {
    const c = state.customers.find(x => x.id === customerId);
    if (!c) return;

    const drawer = $('#customerDrawer');
    const body = $('#customerDrawerBody');
    if (!drawer || !body) return;

    const pols = state.policies.filter(p => p.customer_id === c.id);
    const activePols = pols.filter(p => (p.status || 'Active').toLowerCase() === 'active');
    const preservedPols = pols.filter(p => ['renewed', 'historical'].includes((p.status || '').toLowerCase()));
    const fam = state.familyMembers.filter(f => f.customer_id === c.id);
    const docs = state.documents.filter(d => d.customer_id === c.id);

    body.innerHTML = `
      <div class="drawer-header-info">
        <div class="drawer-avatar">${esc(c.name.slice(0, 2).toUpperCase())}</div>
        <div>
          <h2>${esc(c.name)}</h2>
          <div class="drawer-meta">${esc(c.phone || 'No phone')} • ${esc(c.city || 'No location')}</div>
        </div>
      </div>

      <div class="drawer-kpis">
        <div class="drawer-kpi">
          <span>Active Policies</span>
          <strong>${activePols.length}</strong>
        </div>
        <div class="drawer-kpi">
          <span>Preserved Terms</span>
          <strong>${preservedPols.length}</strong>
        </div>
        <div class="drawer-kpi">
          <span>Documents</span>
          <strong>${docs.length}</strong>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-sec-head">
          <h3>Customer Profile</h3>
          <button class="btn sm secondary" data-edit-customer="${esc(c.id)}">Edit</button>
        </div>
        <div class="profile-grid">
          <div><label>Date of Birth</label><div>${fmtDate(c.date_of_birth)}</div></div>
          <div><label>Anniversary</label><div>${fmtDate(c.anniversary_date)}</div></div>
          <div style="grid-column: span 2"><label>Notes</label><div>${esc(c.notes || 'None')}</div></div>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-sec-head">
          <h3>Policies (${pols.length})</h3>
          <button class="btn sm primary" data-modal="policyModal" data-prefill-customer="${esc(c.id)}">＋ Add Policy</button>
        </div>
        ${pols.length === 0 ? '<p class="empty-text">No policies registered.</p>' : `
          <div class="mini-list">
            ${pols.map(p => `
              <div class="mini-card ${(p.status || '').toLowerCase()}">
                <div class="mini-head">
                  <strong>${esc(p.product_name)}</strong>
                  <span class="badge status-${(p.status || 'Active').toLowerCase()}">${esc(p.status || 'Active')}</span>
                </div>
                <div class="mini-sub">${esc(p.company_name)} • No: ${esc(p.policy_number)}</div>
                <div class="mini-foot">
                  <span>Premium: ${fmtCurrency(p.premium_amount)}</span>
                  <span>Due: ${fmtDate(p.renewal_due_date)}</span>
                </div>
                ${p.status === 'Active' ? `
                  <button class="btn sm secondary" style="margin-top:8px; width:100%" data-renew-policy="${esc(p.id)}">
                    🔄 Renew Policy (Preserves this record)
                  </button>
                ` : `
                  <div class="preserved-tag">✓ Preserved historical term (Never deleted)</div>
                `}
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div class="drawer-section">
        <div class="drawer-sec-head">
          <h3>Family Members (${fam.length})</h3>
        </div>
        ${fam.length === 0 ? '<p class="empty-text">No family members registered.</p>' : `
          <div class="mini-list">
            ${fam.map(f => `
              <div class="mini-card">
                <div class="mini-head">
                  <strong>${esc(f.full_name)}</strong>
                  <span class="badge default">${esc(f.relationship)}</span>
                </div>
                <div class="mini-sub">DOB: ${fmtDate(f.date_of_birth)} ${f.mobile ? '• ' + esc(f.mobile) : ''}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div class="drawer-section">
        <div class="drawer-sec-head">
          <h3>Attached Documents & Local Vault (${docs.length})</h3>
          <button class="btn sm primary" data-modal="documentModal" data-prefill-customer="${esc(c.id)}">＋ Attach Document</button>
        </div>
        ${docs.length === 0 ? '<p class="empty-text">No documents registered for this customer.</p>' : `
          <div class="mini-list">
            ${docs.map(d => `
              <div class="mini-card">
                <div class="mini-head">
                  <strong>${esc(d.title)}</strong>
                  <span class="badge info">${esc(d.document_type)}</span>
                </div>
                <div class="mini-sub">${esc(d.file_name)} (${fmtFileSize(d.file_size)})</div>
                <div class="vault-local-path">📁 Local Storage: ${esc(d.local_storage_path || 'Stored in device vault')}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    drawer.classList.add('open');
  }

  // 4. Policies Renderer
  function renderPolicies() {
    const tbody = $('#policiesTableBody');
    if (!tbody) return;

    const query = ($('#policySearch')?.value || '').toLowerCase().trim();
    const filter = state.policyFilter || 'all';

    const filtered = state.policies.filter(p => {
      if (filter === 'active' && (p.status || 'Active').toLowerCase() !== 'active') return false;
      if (filter === 'renewed' && !['renewed', 'historical'].includes((p.status || '').toLowerCase())) return false;
      if (filter === 'expired' && (p.status || '').toLowerCase() !== 'expired') return false;

      if (!query) return true;
      return (p.policy_number || '').toLowerCase().includes(query) ||
             (p.customer_name || '').toLowerCase().includes(query) ||
             (p.company_name || '').toLowerCase().includes(query) ||
             (p.product_name || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No matching policies found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const isHistorical = ['renewed', 'historical'].includes((p.status || '').toLowerCase());
      return `
        <tr class="${isHistorical ? 'historical-row' : ''}">
          <td>
            <strong>${esc(p.policy_number)}</strong>
            ${p.previous_policy_id ? '<span class="badge default" title="Linked to previous term">Renewed Term</span>' : ''}
          </td>
          <td>
            <a href="#" class="cust-link" data-view-customer="${esc(p.customer_id)}">${esc(p.customer_name || 'Client')}</a>
          </td>
          <td>
            <div>${esc(p.product_name)}</div>
            <div class="table-subtext">${esc(p.company_name)} ${p.category_name ? '• ' + esc(p.category_name) : ''}</div>
          </td>
          <td><strong>${fmtCurrency(p.premium_amount)}</strong></td>
          <td>${fmtCurrency(p.sum_insured)}</td>
          <td>
            <div>${fmtDate(p.renewal_due_date)}</div>
            <div class="table-subtext">Start: ${fmtDate(p.start_date)}</div>
          </td>
          <td>
            <span class="badge status-${(p.status || 'Active').toLowerCase()}">${esc(p.status || 'Active')}</span>
          </td>
          <td class="action-cell">
            ${!isHistorical ? `
              <button class="btn sm secondary" data-renew-policy="${esc(p.id)}" title="Renew policy while preserving older term">
                🔄 Renew
              </button>
            ` : `
              <span class="preserved-tag">Preserved</span>
            `}
            <button class="icon-btn delete" data-delete-policy="${esc(p.id)}" title="Delete policy">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5. Documents Renderer
  function renderDocuments() {
    const tbody = $('#documentsTableBody');
    if (!tbody) return;

    const query = ($('#docSearch')?.value || '').toLowerCase().trim();
    const filter = state.docFilter || 'all';

    const filtered = state.documents.filter(d => {
      if (filter !== 'all' && (d.document_type || '').toLowerCase() !== filter.toLowerCase()) return false;
      if (!query) return true;
      return (d.title || '').toLowerCase().includes(query) ||
             (d.file_name || '').toLowerCase().includes(query) ||
             (d.customer_name || '').toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No document metadata records registered.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(d => `
      <tr>
        <td>
          <div class="doc-icon-cell">
            <span class="doc-badge-icon">${d.document_type === 'PAN Card' ? '🪪' : (d.document_type === 'Birth Certificate' ? '📜' : '📄')}</span>
            <div>
              <strong>${esc(d.title)}</strong>
              <div class="table-subtext">${esc(d.file_name)} • ${fmtFileSize(d.file_size)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge info">${esc(d.document_type)}</span>
        </td>
        <td>
          <a href="#" class="cust-link" data-view-customer="${esc(d.customer_id)}">${esc(d.customer_name || 'Client')}</a>
        </td>
        <td>
          <div class="vault-path-text">${esc(d.local_storage_path || 'Isolated Device Storage')}</div>
          <div class="privacy-note">🔒 Binary stays local on device storage</div>
        </td>
        <td>${fmtDate(d.created_at)}</td>
        <td class="action-cell">
          <button class="icon-btn delete" data-delete-doc="${esc(d.id)}" title="Delete metadata record">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  // 6. Appointments Renderer
  function renderAppointments() {
    const tbody = $('#appointmentsTableBody');
    if (!tbody) return;

    if (state.appointments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No appointments scheduled.</td></tr>';
      return;
    }

    tbody.innerHTML = state.appointments.map(a => `
      <tr>
        <td>
          <strong>${fmtDate(a.date)}</strong>
          <div class="table-subtext">${esc(a.time || 'All Day')}</div>
        </td>
        <td>
          <a href="#" class="cust-link" data-view-customer="${esc(a.customer_id)}">${esc(a.customer_name || 'Client')}</a>
        </td>
        <td>
          <div><strong>${esc(a.purpose)}</strong></div>
          <div class="table-subtext">${esc(a.company_name || '')} ${a.product_name ? '• ' + esc(a.product_name) : ''}</div>
        </td>
        <td><span class="badge info">${esc(a.status || 'Scheduled')}</span></td>
        <td>${esc(a.notes || '—')}</td>
        <td class="action-cell">
          <button class="icon-btn" data-edit-appointment="${esc(a.id)}">✏️</button>
        </td>
      </tr>
    `).join('');
  }

  // 7. Reminders Renderer
  function renderReminders() {
    const tbody = $('#remindersTableBody');
    if (!tbody) return;

    if (state.reminders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No reminders found.</td></tr>';
      return;
    }

    tbody.innerHTML = state.reminders.map(r => {
      const isCompleted = (r.status || '').toLowerCase() === 'completed';
      return `
        <tr class="${isCompleted ? 'completed-row' : ''}">
          <td>
            <span class="badge default">${esc(r.type)}</span>
          </td>
          <td>
            <strong>${esc(r.activity)}</strong>
            ${r.notes ? `<div class="table-subtext">${esc(r.notes)}</div>` : ''}
          </td>
          <td>
            <a href="#" class="cust-link" data-view-customer="${esc(r.customer_id)}">${esc(r.customer_name || 'Client')}</a>
          </td>
          <td>${fmtDate(r.due_at)}</td>
          <td>
            <span class="badge ${isCompleted ? 'success' : 'warning'}">${esc(r.status || 'Pending')}</span>
          </td>
          <td class="action-cell">
            ${!isCompleted ? `
              <button class="btn sm secondary" data-complete-reminder="${esc(r.id)}">✓ Done</button>
            ` : `
              <span class="table-subtext">Completed</span>
            `}
            <button class="icon-btn delete" data-delete-reminder="${esc(r.id)}">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 8. Raw Table Explorer
  function renderRawExplorer() {
    const select = $('#rawTableSelect');
    const thead = $('#rawTableHeader');
    const tbody = $('#rawTableBody');
    const countBadge = $('#rawRowCount');
    if (!select || !thead || !tbody) return;

    const tableName = select.value;
    const listKey = tableName === 'family_members' ? 'familyMembers' : tableName;
    const records = state[listKey] || [];

    if (countBadge) countBadge.textContent = `${records.length} records`;

    if (records.length === 0) {
      thead.innerHTML = '<tr><th>Status</th></tr>';
      tbody.innerHTML = '<tr><td class="empty-cell">Table is currently empty in local storage cache.</td></tr>';
      return;
    }

    const columns = Object.keys(records[0]);
    thead.innerHTML = `<tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
    tbody.innerHTML = records.map(row => `
      <tr>
        ${columns.map(c => {
          let val = row[c];
          if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
          return `<td>${esc(val ?? '—')}</td>`;
        }).join('')}
      </tr>
    `).join('');
  }

  // --- Export Utilities ---
  function downloadFile(filename, content, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportTableToCsv(rows, filename = 'export.csv') {
    if (!rows || rows.length === 0) return toast('No data to export', 'error');
    const headers = Object.keys(rows[0]);
    const escapeCsv = v => {
      if (v === null || v === undefined) return '';
      const str = String(v).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
    };
    const lines = [
      headers.join(','),
      ...rows.map(row => headers.map(h => escapeCsv(row[h])).join(','))
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
        await DataStore.upsert('customers', data);
        closeModal('customerModal');
        form.reset();
        const modeNotice = isSandboxMode() ? 'saved in Local Sandbox ✓' : 'saved to Supabase ✓';
        toast(`Customer "${data.name}" ${modeNotice}`, 'success');
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
        await DataStore.upsert('policies', data);
        closeModal('policyModal');
        form.reset();
        const modeNotice = isSandboxMode() ? 'saved in Local Sandbox ✓' : 'saved to Supabase ✓';
        toast(`Policy "${data.product_name}" ${modeNotice}`, 'success');
      } catch (err) {
        toast(`Save policy failed: ${err.message}`, 'error');
      }
    });

    // 3. Renew Policy Form (Policy Preservation: older term is kept permanently)
    $('#renewForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const oldPolicyId = form.old_policy_id.value;
      const oldPol = state.policies.find(x => x.id === oldPolicyId);
      if (!oldPol) return toast('Old policy not found', 'error');

      try {
        // 1. Preserve the old policy term: update status to 'Renewed'
        await DataStore.upsert('policies', {
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
        await DataStore.upsert('policies', newPolicy);

        closeModal('renewModal');
        form.reset();
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
        local_storage_path: `/storage/emulated/0/InsureClub/documents/${form.file_name.value.trim()}`,
        notes: 'File stored in local device vault. Metadata synced to database.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        await DataStore.upsert('documents', data);
        closeModal('documentModal');
        form.reset();
        toast(`${data.document_type} metadata registered successfully ✓`, 'success');
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
        await DataStore.upsert('appointments', data);
        closeModal('appointmentModal');
        form.reset();
        toast('Appointment scheduled successfully ✓', 'success');
      } catch (err) {
        toast(`Appointment scheduling failed: ${err.message}`, 'error');
      }
    });

    // 6. Settings Form: Save & Connect
    $('#settingsForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const rawUrl = ($('#cfgSupabaseUrl').value || '').trim();
      const rawKey = ($('#cfgSupabaseKey').value || '').trim();

      if (!rawUrl || isPlaceholderUrl(rawUrl)) {
        state.supabase.url = SANDBOX_SUPABASE.url;
        state.supabase.anonKey = SANDBOX_SUPABASE.anonKey;
        state.sandboxChosen = true;
        persistState();
        setConnectionStatus('sandbox');
        initRealtime();
        DataStore.fetchAll(true);
        toast('Switched to Local Sandbox Mode ✓', 'info');
        return;
      }

      state.supabase.url = isLiveProject(rawUrl) ? DEFAULT_SUPABASE.url : rawUrl;
      state.supabase.anonKey = isLiveProject(rawUrl) ? DEFAULT_SUPABASE.anonKey : rawKey;
      state.sandboxChosen = false;
      persistState();
      toast('Supabase credentials saved. Connecting to cloud…', 'info');
      initRealtime();
      await fetchCloudData(false);
    });

    // 7. Copy SQL Schema
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
        toast('SQL Schema copied to clipboard! Paste into Supabase SQL Editor ✓', 'success');
      } catch (err) {
        toast('Could not auto-copy schema. You can find schema.sql in supabase/ folder.', 'error');
      }
    });

    // 8. Test Connection
    $('#testConnBtn')?.addEventListener('click', async () => {
      const url = ($('#cfgSupabaseUrl').value || '').trim() || state.supabase.url;
      const key = ($('#cfgSupabaseKey').value || '').trim() || state.supabase.anonKey;
      const resultBox = $('#testResultBox');
      resultBox.classList.remove('hidden', 'success', 'error');
      resultBox.textContent = 'Testing connection to Supabase cloud…';

      if (isPlaceholderUrl(url)) {
        resultBox.classList.add('error');
        resultBox.innerHTML = '<strong>Local Sandbox URL Detected:</strong><br>The default domain <code>insureclub-sync.supabase.co</code> is a sandbox placeholder for local offline testing.<br><br>To connect a live cloud database, enter your real Supabase Project URL (e.g. <code>https://your-ref.supabase.co</code>) and public anon key.';
        toast('Default URL is a sandbox placeholder', 'info');
        return;
      }

      try {
        const res = await Supabase.ping(url, key);
        resultBox.classList.add('success');
        resultBox.innerHTML = `<strong>✓ Connection Verified!</strong><br>Successfully reached Supabase cloud in <strong>${res.latency} ms</strong>. Table access and REST endpoints are active and ready.`;
        toast('Connection verified ✓', 'success');
      } catch (err) {
        resultBox.classList.add('error');
        const friendly = sanitizeNetworkError(err);
        resultBox.innerHTML = `<strong>✕ Connection Notice:</strong><br>${esc(friendly)}<br><small style="color:var(--text-muted);margin-top:6px;display:block">Technical error: ${esc(err.message)}</small>`;
        toast('Connection test notice', 'error');
      }
    });

    // 9. Push Sandbox Data to Cloud
    $('#pushToCloudBtn')?.addEventListener('click', async () => {
      if (isSandboxMode()) {
        toast('Please enter your live Supabase URL and click "Save & Connect" first before pushing data.', 'error');
        return;
      }

      const totalItems = state.customers.length + state.policies.length + state.documents.length;
      if (totalItems === 0) {
        toast('No local records to push', 'info');
        return;
      }

      if (!confirm(`Push ${state.customers.length} customers, ${state.policies.length} policies, and ${state.documents.length} document records to your live Supabase cloud database?`)) {
        return;
      }

      const btn = $('#pushToCloudBtn');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Pushing data…';

      try {
        if (state.customers.length) await Supabase.upsert('customers', state.customers);
        if (state.policies.length) await Supabase.upsert('policies', state.policies);
        if (state.familyMembers.length) await Supabase.upsert('family_members', state.familyMembers);
        if (state.documents.length) await Supabase.upsert('documents', state.documents);
        if (state.appointments.length) await Supabase.upsert('appointments', state.appointments);
        if (state.reminders.length) await Supabase.upsert('reminders', state.reminders);

        toast(`Pushed ${totalItems} records to Supabase cloud database! ✓`, 'success');
        await fetchCloudData(true);
      } catch (err) {
        toast(`Push notice: ${sanitizeNetworkError(err)}`, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    // 10. Reset to Local Sandbox Defaults
    $('#resetDefaultsBtn')?.addEventListener('click', () => {
      $('#cfgSupabaseUrl').value = SANDBOX_SUPABASE.url;
      $('#cfgSupabaseKey').value = SANDBOX_SUPABASE.anonKey;
      state.supabase.url = SANDBOX_SUPABASE.url;
      state.supabase.anonKey = SANDBOX_SUPABASE.anonKey;
      state.sandboxChosen = true;
      persistState();
      seedSampleDataIfNeeded();
      setConnectionStatus('sandbox');
      initRealtime();
      renderAll();
      toast('Switched to Local Sandbox Mode ✓', 'success');
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
        if (c && confirm(`Delete customer "${c.name}"? Linked policies and documents will also be removed.`)) {
          try {
            await DataStore.remove('customers', c.id);
            toast(`Customer "${c.name}" deleted`, 'info');
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
            await DataStore.remove('policies', p.id);
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
            await DataStore.remove('documents', d.id);
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
            await DataStore.upsert('reminders', {
              ...r,
              status: 'Completed',
              completed_at: new Date().toISOString()
            });
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
            await DataStore.remove('reminders', r.id);
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

    // Refresh Data (Sandbox vs Live)
    $('#refreshCloudBtn')?.addEventListener('click', () => DataStore.fetchAll(false));

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

    if (isSandboxMode()) seedSampleDataIfNeeded();
    setupForms();
    setupEventDelegation();
    renderAll();

    // Advisor sign-in card on the Settings page.
    const settingsForm = $('#settingsForm');
    if (Auth && settingsForm) {
      const holder = document.createElement('div');
      holder.style.marginBottom = '16px';
      settingsForm.parentElement.insertBefore(holder, settingsForm);
      Auth.mount(holder);
    }

    window.addEventListener('insureclub-auth-changed', e => {
      if (isSandboxMode() || !isLiveProject(state.supabase?.url)) return;
      if (realtimeWs) {
        try { realtimeWs.close(); } catch {}
        realtimeWs = null;
      }
      if (e.detail?.signedIn) {
        initRealtime();
        fetchCloudData(false);
      } else {
        ['customers', 'policies', 'familyMembers', 'appointments', 'reminders', 'documents'].forEach(k => { state[k] = []; });
        persistState();
        setConnectionStatus('signin');
        renderAll();
      }
    });

    if (isSandboxMode()) {
      setConnectionStatus('sandbox');
    } else if (needsSignIn()) {
      ['customers', 'policies', 'familyMembers', 'appointments', 'reminders', 'documents'].forEach(k => { state[k] = []; });
      persistState();
      renderAll();
      setConnectionStatus('signin');
      Auth.prompt();
    } else {
      initRealtime();
      DataStore.fetchAll(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
