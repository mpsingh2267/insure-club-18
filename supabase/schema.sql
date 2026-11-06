-- InsureClub CRM - Supabase Database Schema
-- Provides cloud database storage and multi-device sync for customers, policies,
-- family members, appointments, reminders, document metadata, and templates.
-- NOTE: In accordance with local-first privacy requirements, physical attached
-- files (PDFs, images, scans) are stored locally on device storage. Only metadata
-- is synced in the documents table.

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    city TEXT,
    address TEXT,
    date_of_birth DATE,
    anniversary_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Policies Table
-- Stores all policies. When a policy is renewed, older policies remain intact
-- with status 'Renewed' or 'Historical' and are NEVER deleted.
CREATE TABLE IF NOT EXISTS public.policies (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT,
    company_name TEXT NOT NULL,
    product_name TEXT NOT NULL,
    category_name TEXT,
    policy_number TEXT NOT NULL,
    start_date DATE,
    renewal_due_date DATE NOT NULL,
    premium_amount NUMERIC(12, 2) DEFAULT 0,
    sum_insured NUMERIC(14, 2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Renewed', 'Historical', 'Expired', 'Cancelled'
    previous_policy_id TEXT REFERENCES public.policies(id) ON DELETE SET NULL,
    notes TEXT,
    has_document BOOLEAN DEFAULT false,
    document_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Family Members Table
CREATE TABLE IF NOT EXISTS public.family_members (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    date_of_birth DATE,
    mobile TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Appointments Table
CREATE TABLE IF NOT EXISTS public.appointments (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT,
    date DATE NOT NULL,
    time TEXT,
    purpose TEXT NOT NULL,
    product_name TEXT,
    company_name TEXT,
    reminder_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'Scheduled',
    notes TEXT,
    follow_up_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Reminders Table
CREATE TABLE IF NOT EXISTS public.reminders (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT,
    policy_id TEXT REFERENCES public.policies(id) ON DELETE CASCADE,
    family_member_id TEXT REFERENCES public.family_members(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    activity TEXT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    notes TEXT,
    auto BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Document Metadata Table (Local-First: Binaries stay on local device storage)
-- Tracks PAN cards, birth certificates, policy documents, Aadhaar cards, etc.
CREATE TABLE IF NOT EXISTS public.documents (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT,
    policy_id TEXT REFERENCES public.policies(id) ON DELETE SET NULL,
    family_member_id TEXT REFERENCES public.family_members(id) ON DELETE SET NULL,
    document_type TEXT NOT NULL, -- 'PAN Card', 'Birth Certificate', 'Aadhaar Card', 'Policy Document', etc.
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT DEFAULT 0,
    mime_type TEXT DEFAULT 'application/pdf',
    local_storage_path TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Porting Reminders Table
CREATE TABLE IF NOT EXISTS public.porting_reminders (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_name TEXT,
    policy_id TEXT REFERENCES public.policies(id) ON DELETE CASCADE,
    existing_company TEXT,
    existing_policy TEXT,
    renewal_date DATE,
    target_company TEXT,
    target_product TEXT,
    reminder_date DATE,
    status TEXT NOT NULL DEFAULT 'Pending',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Message Templates Table
CREATE TABLE IF NOT EXISTS public.message_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    body TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Activities / Audit Logs Table
CREATE TABLE IF NOT EXISTS public.activities (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_policies_customer_id ON public.policies(customer_id);
CREATE INDEX IF NOT EXISTS idx_policies_renewal_due_date ON public.policies(renewal_due_date);
CREATE INDEX IF NOT EXISTS idx_policies_status ON public.policies(status);
CREATE INDEX IF NOT EXISTS idx_family_customer_id ON public.family_members(customer_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON public.reminders(due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON public.reminders(status);
CREATE INDEX IF NOT EXISTS idx_documents_customer_id ON public.documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_policy_id ON public.documents(policy_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON public.documents(document_type);

-- Row Level Security (RLS) Policies
-- Allow public anon API access for InsureClub CRM client with anon key
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.porting_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Allow read/write for authenticated users or anon API with project key
DO $$
BEGIN
    DROP POLICY IF EXISTS "Anon public access to customers" ON public.customers;
    CREATE POLICY "Anon public access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon public access to policies" ON public.policies;
    CREATE POLICY "Anon public access to policies" ON public.policies FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon public access to family_members" ON public.family_members;
    CREATE POLICY "Anon public access to family_members" ON public.family_members FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon public access to appointments" ON public.appointments;
    CREATE POLICY "Anon public access to appointments" ON public.appointments FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon public access to reminders" ON public.reminders;
    CREATE POLICY "Anon public access to reminders" ON public.reminders FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon public access to documents" ON public.documents;
    CREATE POLICY "Anon public access to documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon public access to porting_reminders" ON public.porting_reminders;
    CREATE POLICY "Anon public access to porting_reminders" ON public.porting_reminders FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon public access to message_templates" ON public.message_templates;
    CREATE POLICY "Anon public access to message_templates" ON public.message_templates FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Anon public access to activities" ON public.activities;
    CREATE POLICY "Anon public access to activities" ON public.activities FOR ALL USING (true) WITH CHECK (true);
END $$;
