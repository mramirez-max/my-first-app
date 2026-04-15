// Ontop approved terminology glossary
// Source of truth lives in the `glossary_entries` Supabase table.
// This file holds: types, helper functions, and the static seed used in migration 009.

export type TermStatus = 'preferred' | 'sunsetting' | 'deprecated' | 'internal_only'

export interface GlossaryEntry {
  id?: string           // UUID from DB (absent for static seed entries)
  deprecated: string[]  // all old / internal names
  preferred: string     // approved external name (empty string for deprecated/internal_only)
  status: TermStatus
  note?: string
  category: string
}

export interface TermAlert {
  area: string
  deprecatedTerm: string
  preferred: string
  status: TermStatus
  excerpt: string       // surrounding sentence (up to 130 chars)
}

// ---------------------------------------------------------------------------
// Static seed — used by migration 009_glossary.sql and as fallback
// ---------------------------------------------------------------------------

export const ONTOP_GLOSSARY: GlossaryEntry[] = [
  // ── Contract Types ────────────────────────────────────────────────────────
  {
    category: 'Contract Types',
    deprecated: ['You Sign', 'YouSign', 'Payment Agent'],
    preferred: 'Direct Hiring',
    status: 'preferred',
  },
  {
    category: 'Contract Types',
    deprecated: ['Ontop Signs', 'Service Provider', 'ONTS'],
    preferred: 'Contractor of Record',
    status: 'preferred',
  },
  {
    category: 'Contract Types',
    deprecated: ['EOR', 'Employer of Record', 'FTE'],
    preferred: 'Employee',
    status: 'sunsetting',
    note: 'Do not offer. Escalate to account team.',
  },

  // ── Protection Add-ons ────────────────────────────────────────────────────
  {
    category: 'Protection Add-ons',
    deprecated: ['Ontop Signs base protection'],
    preferred: 'Ontop Protection — Compliance Coverage',
    status: 'preferred',
    note: 'Up to $30K per worker. No misclassification coverage.',
  },
  {
    category: 'Protection Add-ons',
    deprecated: ['CPRO', 'Contractor Pro'],
    preferred: 'Ontop Protection — Contractor of Record (US)',
    status: 'preferred',
    note: 'US-specific. Up to $10K per client ($30K if migrated from Direct Hiring). No misclassification coverage.',
  },
  {
    category: 'Protection Add-ons',
    deprecated: ['Ontop Guard'],
    preferred: 'Ontop Protection — Ontop Guard',
    status: 'preferred',
    note: 'Only tier with misclassification coverage, up to $100K per client.',
  },

  // ── Invoice Types ─────────────────────────────────────────────────────────
  {
    category: 'Invoice Types',
    deprecated: ['OMF', 'Ontop Membership Fee'],
    preferred: 'Platform Subscription Fee',
    status: 'preferred',
  },
  {
    category: 'Invoice Types',
    deprecated: ['ONTW', 'Ontop Worker Invoice'],
    preferred: 'Contractor Invoice',
    status: 'preferred',
  },
  {
    category: 'Invoice Types',
    deprecated: ['ONTF', 'Transactional Fees'],
    preferred: 'Processing Fee',
    status: 'preferred',
  },

  // ── Payment Flows ─────────────────────────────────────────────────────────
  {
    category: 'Payment Flows',
    deprecated: ['Pay-ins', 'Payins'],
    preferred: 'Client Payments',
    status: 'preferred',
  },
  {
    category: 'Payment Flows',
    deprecated: ['Pay-outs', 'Payouts'],
    preferred: 'Contractor Payouts',
    status: 'preferred',
    note: 'Contractor transferring money outside Ontop Global Account.',
  },
  {
    category: 'Payment Flows',
    deprecated: ['Employee Novelties'],
    preferred: 'Novelties',
    status: 'preferred',
    note: 'Mid-cycle pay changes: bonuses, deductions, one-time adjustments.',
  },
  {
    category: 'Payment Flows',
    deprecated: ['Contract Amendment'],
    preferred: 'Amendment',
    status: 'preferred',
    note: 'Changes to base contract terms.',
  },
  {
    category: 'Payment Flows',
    deprecated: ['ADMV'],
    preferred: '',
    status: 'internal_only',
    note: 'Internal only — never use externally.',
  },

  // ── Billing ───────────────────────────────────────────────────────────────
  {
    category: 'Billing',
    deprecated: ['Flex Seats'],
    preferred: 'Pay per Contract',
    status: 'preferred',
    note: 'Variable monthly billing based on number of active contracts.',
  },
  {
    category: 'Billing',
    deprecated: ['Global Seats'],
    preferred: 'Fixed Plan',
    status: 'preferred',
    note: 'Fixed committed seats; overage charged at standard rate if exceeded.',
  },
  {
    category: 'Billing',
    deprecated: ['Proration'],
    preferred: 'Prorated Billing',
    status: 'preferred',
    note: 'Pay per Contract plan only — charged for days active, not full month.',
  },
  {
    category: 'Billing',
    deprecated: ['Annual Billing'],
    preferred: 'Annual Commitment (Monthly Payments)',
    status: 'preferred',
    note: '12-month agreement, billed monthly.',
  },
  {
    category: 'Billing',
    deprecated: ['Membership', 'Seats'],
    preferred: 'Platform Subscription',
    status: 'preferred',
  },

  // ── Platform & Accounts ───────────────────────────────────────────────────
  {
    category: 'Platform & Accounts',
    deprecated: ['Quick Start'],
    preferred: 'Self-Service Sign-up',
    status: 'preferred',
    note: 'Not a product — standard webpage registration flow.',
  },
  {
    category: 'Platform & Accounts',
    deprecated: ['Ontop Balance'],
    preferred: 'Client Balance',
    status: 'preferred',
    note: 'Client-side only.',
  },
  {
    category: 'Platform & Accounts',
    deprecated: ['Ontop Wallet', 'Wallet'],
    preferred: 'Global Account',
    status: 'preferred',
  },
  {
    category: 'Platform & Accounts',
    deprecated: ['Global Account — Payroll Account', 'Global Account - Payroll Account'],
    preferred: 'Payroll Account',
    status: 'preferred',
    note: 'Tied to active Ontop client relationship.',
  },
  {
    category: 'Platform & Accounts',
    deprecated: ['Global Account — Stablecoin Account', 'Global Account - Stablecoin Account', 'Stablecoin Account'],
    preferred: 'Personal Account',
    status: 'preferred',
    note: 'Primary account; workers can receive here without a Payroll Account.',
  },
  {
    category: 'Platform & Accounts',
    deprecated: ['Global Account — Future Fund', 'Global Account - Future Fund'],
    preferred: 'Future Fund Account',
    status: 'preferred',
  },
  {
    category: 'Platform & Accounts',
    deprecated: ['Reserve', 'Ontop Reserve'],
    preferred: 'Ontop Reserve',
    status: 'preferred',
    note: 'Worker-paid subscription for cashback and exclusive benefits.',
  },
  {
    category: 'Platform & Accounts',
    deprecated: ['DirectPay'],
    preferred: '',
    status: 'deprecated',
    note: 'Do not use or offer.',
  },
  {
    category: 'Platform & Accounts',
    deprecated: ['Wanderlust'],
    preferred: '',
    status: 'deprecated',
    note: 'Remove from all communications.',
  },

  // ── Benefits ─────────────────────────────────────────────────────────────
  {
    category: 'Benefits',
    deprecated: ['Ontop Crew', 'Perks'],
    preferred: 'Benefits',
    status: 'preferred',
  },
  {
    category: 'Benefits',
    deprecated: ['Health', 'Insurance'],
    preferred: 'Health',
    status: 'preferred',
    note: 'Under Benefits.',
  },
  {
    category: 'Benefits',
    deprecated: ['Coworking', 'Pluria'],
    preferred: 'Workspace Access',
    status: 'preferred',
    note: 'Under Benefits.',
  },
  {
    category: 'Benefits',
    deprecated: ['Learning', 'Udemy', 'Coursera'],
    preferred: 'Learning Benefits',
    status: 'preferred',
    note: 'Under Benefits.',
  },
  {
    category: 'Benefits',
    deprecated: ['Assist', 'Ontop Assist'],
    preferred: 'Ontop Assist',
    status: 'preferred',
    note: 'Under Benefits.',
  },

  // ── People & Roles ────────────────────────────────────────────────────────
  {
    category: 'People & Roles',
    deprecated: ['Ontopper'],
    preferred: '',
    status: 'internal_only',
    note: 'Never use in client-facing copy.',
  },
  {
    category: 'People & Roles',
    deprecated: ['Worker', 'Contractor'],
    preferred: 'Remote Worker',
    status: 'preferred',
  },
  {
    category: 'People & Roles',
    deprecated: ['Admin'],
    preferred: 'Account Admin',
    status: 'preferred',
  },
  {
    category: 'People & Roles',
    deprecated: ['EOR Employee'],
    preferred: 'Employee',
    status: 'sunsetting',
    note: 'Sunsetting context only.',
  },
]

// ---------------------------------------------------------------------------
// buildTerminologyRules — dynamic system-prompt block built from live entries
// ---------------------------------------------------------------------------

export function buildTerminologyRules(entries: GlossaryEntry[]): string {
  const sunsetTerms = entries
    .filter(e => e.status === 'sunsetting')
    .flatMap(e => e.deprecated)
    .join(', ')

  const deprecatedTerms = entries
    .filter(e => e.status === 'deprecated')
    .flatMap(e => e.deprecated)
    .join(', ')

  const internalTerms = entries
    .filter(e => e.status === 'internal_only')
    .flatMap(e => e.deprecated)
    .join(', ')

  const substitutions = entries
    .filter(e => e.status === 'preferred' && e.preferred)
    .map(e => `${e.deprecated.join(' / ')} → ${e.preferred}`)
    .join('\n')

  const neverUseLines = [
    sunsetTerms    ? `NEVER USE — escalate to account team: ${sunsetTerms}` : '',
    deprecatedTerms ? `NEVER USE — deprecated, remove from all communications: ${deprecatedTerms}` : '',
    internalTerms  ? `INTERNAL ONLY — never appear in responses: ${internalTerms}` : '',
  ].filter(Boolean).join('\n')

  return `ONTOP TERMINOLOGY RULES:
Always use Ontop's preferred terminology. If a deprecated term appears in context, silently substitute the correct one in your response. Never use these terms in any client or worker-facing output.

${neverUseLines}

Key substitutions:
${substitutions}`
}

// ---------------------------------------------------------------------------
// scanForDeprecatedTerms — scan a single OKR update text for deprecated terms
// ---------------------------------------------------------------------------

export function scanForDeprecatedTerms(area: string, text: string, entries: GlossaryEntry[]): TermAlert[] {
  const seen   = new Set<string>()
  const alerts: TermAlert[] = []

  for (const entry of entries) {
    for (const originalTerm of entry.deprecated) {
      // Skip entries where the deprecated term IS the preferred term (no real substitution)
      if (entry.status === 'preferred' && entry.preferred.toLowerCase() === originalTerm.toLowerCase()) continue

      const dedupeKey = `${area}::${originalTerm.toLowerCase()}`
      if (seen.has(dedupeKey)) continue

      const escaped = originalTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'i')
      if (!pattern.test(text)) continue

      seen.add(dedupeKey)

      const match  = pattern.exec(text)!
      const start  = Math.max(0, match.index - 60)
      const end    = Math.min(text.length, match.index + match[0].length + 60)
      let excerpt  = text.slice(start, end).replace(/\n/g, ' ').trim()
      if (start > 0) excerpt = '…' + excerpt
      if (end < text.length) excerpt = excerpt + '…'

      alerts.push({
        area,
        deprecatedTerm: match[0],
        preferred:      entry.preferred,
        status:         entry.status,
        excerpt:        excerpt.slice(0, 130),
      })
    }
  }

  return alerts
}
