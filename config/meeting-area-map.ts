// Meeting configurations: maps calendar event keywords → areas + meeting context
// Matched case-insensitively (substring) against calendar event titles

export interface SimpleMeeting {
  type: 'simple'
  areas: string[]
}

export interface GroupedMeeting {
  type: 'grouped'
  areas: string[]
  purpose: string
  focusQuestions: string[]
}

export type MeetingConfig = SimpleMeeting | GroupedMeeting

export const MEETING_AREA_MAP: Record<string, MeetingConfig> = {
  // --- 1:1 leadership meetings ---
  'CCO':  { type: 'simple', areas: ['Customer Success'] },
  'CRO':  { type: 'simple', areas: ['Revenue'] },
  'CFO':  { type: 'simple', areas: ['Finance'] },
  'CHRO': { type: 'simple', areas: ['People'] },
  'COO':  { type: 'simple', areas: ['Operations'] },
  'CTO':  { type: 'simple', areas: ['Tech'] },
  'CPO':  { type: 'simple', areas: ['Product'] },
  'CMO':  { type: 'simple', areas: ['Marketing'] },
  'CLO':  { type: 'simple', areas: ['Legal'] },
  'CCRO': { type: 'simple', areas: ['Compliance'] },

  // --- Grouped cross-functional reviews ---

  'GTM': {
    type: 'grouped',
    areas: ['Revenue', 'Product', 'Marketing'],
    purpose: `Go-to-market execution review. This is not only about pipeline — it covers the full GTM picture:
how we are positioning our products in the market, whether the message is resonating with the right customers,
whether marketing is generating enough qualified pipeline, and whether product is shipping what sales and
marketing need to compete and close. Look for misalignments across the three areas.`,
    focusQuestions: [
      'Is the pipeline healthy and on pace to hit revenue targets?',
      'Are we positioning our products clearly and competitively? Is the differentiation story landing?',
      'Is marketing reaching the right ICP with the right message, or are we generating noise?',
      'Is product delivering what GTM needs — features, pricing, packaging — on the right timeline?',
      'Are there misalignments between what we\'re selling, what we\'re building, and how we\'re marketing it?',
    ],
  },

  'Health Check': {
    type: 'grouped',
    areas: ['People', 'Finance', 'Legal', 'Customer Success'],
    purpose: `Organizational health review across people, financial fitness, legal risk, and customer satisfaction.
Identify whether pressures in one area are creating risks in others — e.g. financial tightening driving attrition,
or legal exposure affecting customer confidence.`,
    focusQuestions: [
      'Are we financially on track — burn rate, ARR vs plan, and runway?',
      'Is the team healthy — attrition, hiring pace, and morale signals?',
      'Are there outstanding legal risks or unresolved compliance gaps?',
      'How are customers feeling — NPS, churn, and escalations?',
      'Are financial or operational pressures creating cascading people or customer risks?',
    ],
  },

  'Health Check SLT': {
    type: 'grouped',
    areas: ['People', 'Finance', 'Legal', 'Customer Success'],
    purpose: `Senior leadership team organizational health review across people, financial fitness, legal risk,
and customer satisfaction. Flag anything that requires SLT decision or escalation.`,
    focusQuestions: [
      'Are we financially on track — burn rate, ARR vs plan, and runway?',
      'Is the team healthy — attrition, hiring pace, and morale signals?',
      'Are there outstanding legal risks or unresolved compliance gaps?',
      'How are customers feeling — NPS, churn, and escalations?',
      'Is there anything that requires SLT escalation or a decision today?',
    ],
  },

  'Global Account': {
    type: 'grouped',
    areas: ['Revenue', 'Product', 'Tech', 'Legal', 'Compliance'],
    purpose: `Global and enterprise account health review. Focus on whether we are winning, retaining, and
expanding strategic accounts — and whether product delivery, technical reliability, legal agreements, and
compliance posture are supporting or blocking that. Look for cross-team blockers on key deals.`,
    focusQuestions: [
      'Are we winning and retaining global and enterprise accounts?',
      'Is Product delivering the features and roadmap that strategic accounts are counting on?',
      'Is Tech providing the reliability and SLAs that enterprise customers require?',
      'Are there legal or compliance blockers on active or upcoming deals?',
      'What cross-team dependencies are slowing enterprise momentum right now?',
    ],
  },
}
