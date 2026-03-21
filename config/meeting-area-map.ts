// Maps meeting name keywords → app area names
// Matched case-insensitively against calendar event titles
// FS = Revenue (includes Sales + Customer Activation, formerly Worker Journey)

export const MEETING_AREA_MAP: Record<string, string[]> = {
  // 1:1 leadership meetings
  'CCO':  ['Customer Success'],
  'CRO':  ['Revenue'],
  'CFO':  ['Finance'],
  'CHRO': ['People'],
  'COO':  ['Operations'],
  'CTO':  ['Tech'],
  'CPO':  ['Product'],
  'CMO':  ['Marketing'],
  'CLO':  ['Legal'],
  'CCRO': ['Compliance'],

  // Grouped biweekly reviews
  // Global Account = FS (Revenue) + Product + Tech + Legal + Compliance
  'Global Account': ['Revenue', 'Product', 'Tech', 'Legal', 'Compliance'],

  // GTM = FS (Revenue) + Product + Marketing
  'GTM': ['Revenue', 'Product', 'Marketing'],

  // Health Check = People + Finance + Legal + Customer Success
  'Health Check': ['People', 'Finance', 'Legal', 'Customer Success'],
  'Health check': ['People', 'Finance', 'Legal', 'Customer Success'],
  'Health Check SLT': ['People', 'Finance', 'Legal', 'Customer Success'],
}
