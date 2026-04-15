-- Glossary entries table
-- Stores Ontop's approved terminology mappings (deprecated → preferred).
-- Admins manage these via the Admin Panel; runtime code reads them for AI prompts and form guardrails.

CREATE TABLE IF NOT EXISTS glossary_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL,
  deprecated  text[] NOT NULL,
  preferred   text NOT NULL DEFAULT '',
  status      text NOT NULL CHECK (status IN ('preferred', 'sunsetting', 'deprecated', 'internal_only')),
  note        text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE glossary_entries ENABLE ROW LEVEL SECURITY;

-- Everyone (including unauthenticated) can read — needed for client-side form scanning
CREATE POLICY "glossary_select" ON glossary_entries
  FOR SELECT USING (true);

-- Only admins can write
CREATE POLICY "glossary_insert" ON glossary_entries
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "glossary_update" ON glossary_entries
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "glossary_delete" ON glossary_entries
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_glossary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER glossary_updated_at
  BEFORE UPDATE ON glossary_entries
  FOR EACH ROW EXECUTE FUNCTION update_glossary_updated_at();

-- ── Seed data ─────────────────────────────────────────────────────────────────

INSERT INTO glossary_entries (category, deprecated, preferred, status, note) VALUES
-- Contract Types
('Contract Types', ARRAY['You Sign', 'YouSign', 'Payment Agent'], 'Direct Hiring', 'preferred', NULL),
('Contract Types', ARRAY['Ontop Signs', 'Service Provider', 'ONTS'], 'Contractor of Record', 'preferred', NULL),
('Contract Types', ARRAY['EOR', 'Employer of Record', 'FTE'], 'Employee', 'sunsetting', 'Do not offer. Escalate to account team.'),

-- Protection Add-ons
('Protection Add-ons', ARRAY['Ontop Signs base protection'], 'Ontop Protection — Compliance Coverage', 'preferred', 'Up to $30K per worker. No misclassification coverage.'),
('Protection Add-ons', ARRAY['CPRO', 'Contractor Pro'], 'Ontop Protection — Contractor of Record (US)', 'preferred', 'US-specific. Up to $10K per client ($30K if migrated from Direct Hiring). No misclassification coverage.'),
('Protection Add-ons', ARRAY['Ontop Guard'], 'Ontop Protection — Ontop Guard', 'preferred', 'Only tier with misclassification coverage, up to $100K per client.'),

-- Invoice Types
('Invoice Types', ARRAY['OMF', 'Ontop Membership Fee'], 'Platform Subscription Fee', 'preferred', NULL),
('Invoice Types', ARRAY['ONTW', 'Ontop Worker Invoice'], 'Contractor Invoice', 'preferred', NULL),
('Invoice Types', ARRAY['ONTF', 'Transactional Fees'], 'Processing Fee', 'preferred', NULL),

-- Payment Flows
('Payment Flows', ARRAY['Pay-ins', 'Payins'], 'Client Payments', 'preferred', NULL),
('Payment Flows', ARRAY['Pay-outs', 'Payouts'], 'Contractor Payouts', 'preferred', 'Contractor transferring money outside Ontop Global Account.'),
('Payment Flows', ARRAY['Employee Novelties'], 'Novelties', 'preferred', 'Mid-cycle pay changes: bonuses, deductions, one-time adjustments.'),
('Payment Flows', ARRAY['Contract Amendment'], 'Amendment', 'preferred', 'Changes to base contract terms.'),
('Payment Flows', ARRAY['ADMV'], '', 'internal_only', 'Internal only — never use externally.'),

-- Billing
('Billing', ARRAY['Flex Seats'], 'Pay per Contract', 'preferred', 'Variable monthly billing based on number of active contracts.'),
('Billing', ARRAY['Global Seats'], 'Fixed Plan', 'preferred', 'Fixed committed seats; overage charged at standard rate if exceeded.'),
('Billing', ARRAY['Proration'], 'Prorated Billing', 'preferred', 'Pay per Contract plan only — charged for days active, not full month.'),
('Billing', ARRAY['Annual Billing'], 'Annual Commitment (Monthly Payments)', 'preferred', '12-month agreement, billed monthly.'),
('Billing', ARRAY['Membership', 'Seats'], 'Platform Subscription', 'preferred', NULL),

-- Platform & Accounts
('Platform & Accounts', ARRAY['Quick Start'], 'Self-Service Sign-up', 'preferred', 'Not a product — standard webpage registration flow.'),
('Platform & Accounts', ARRAY['Ontop Balance'], 'Client Balance', 'preferred', 'Client-side only.'),
('Platform & Accounts', ARRAY['Ontop Wallet', 'Wallet'], 'Global Account', 'preferred', NULL),
('Platform & Accounts', ARRAY['Global Account — Payroll Account', 'Global Account - Payroll Account'], 'Payroll Account', 'preferred', 'Tied to active Ontop client relationship.'),
('Platform & Accounts', ARRAY['Global Account — Stablecoin Account', 'Global Account - Stablecoin Account', 'Stablecoin Account'], 'Personal Account', 'preferred', 'Primary account; workers can receive here without a Payroll Account.'),
('Platform & Accounts', ARRAY['Global Account — Future Fund', 'Global Account - Future Fund'], 'Future Fund Account', 'preferred', NULL),
('Platform & Accounts', ARRAY['Reserve', 'Ontop Reserve'], 'Ontop Reserve', 'preferred', 'Worker-paid subscription for cashback and exclusive benefits.'),
('Platform & Accounts', ARRAY['DirectPay'], '', 'deprecated', 'Do not use or offer.'),
('Platform & Accounts', ARRAY['Wanderlust'], '', 'deprecated', 'Remove from all communications.'),

-- Benefits
('Benefits', ARRAY['Ontop Crew', 'Perks'], 'Benefits', 'preferred', NULL),
('Benefits', ARRAY['Health', 'Insurance'], 'Health', 'preferred', 'Under Benefits.'),
('Benefits', ARRAY['Coworking', 'Pluria'], 'Workspace Access', 'preferred', 'Under Benefits.'),
('Benefits', ARRAY['Learning', 'Udemy', 'Coursera'], 'Learning Benefits', 'preferred', 'Under Benefits.'),
('Benefits', ARRAY['Assist', 'Ontop Assist'], 'Ontop Assist', 'preferred', 'Under Benefits.'),

-- People & Roles
('People & Roles', ARRAY['Ontopper'], '', 'internal_only', 'Never use in client-facing copy.'),
('People & Roles', ARRAY['Worker', 'Contractor'], 'Remote Worker', 'preferred', NULL),
('People & Roles', ARRAY['Admin'], 'Account Admin', 'preferred', NULL),
('People & Roles', ARRAY['EOR Employee'], 'Employee', 'sunsetting', 'Sunsetting context only.');
