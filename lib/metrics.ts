export type MetricFormat = 'currency' | 'percent' | 'number' | 'decimal'

export interface MetricDefinition {
  name: string
  category: string
  format: MetricFormat
  aliases?: string[]  // alternative CSV names that map to this metric
}

export const METRIC_CATEGORIES = [
  'Revenue',
  'Volume',
  'Growth',
  'Network',
  'Banking & Cards',
  'People & Efficiency',
] as const

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  // Revenue
  { name: 'ARR',                         category: 'Revenue',             format: 'currency' },
  { name: 'MRR',                         category: 'Revenue',             format: 'currency' },
  { name: 'Take Rate',                   category: 'Revenue',             format: 'percent'  },
  { name: 'Total Effective New Revenue', category: 'Revenue',             format: 'currency', aliases: ['total effective', 'total effective new revenue'] },
  { name: 'Total MRR HR Business',       category: 'Revenue',             format: 'currency' },
  { name: 'Total Bank Revenue + Yield',  category: 'Revenue',             format: 'currency' },
  // Volume
  { name: 'Annual TPV',                  category: 'Volume',              format: 'currency' },
  { name: 'Monthly TPV',                 category: 'Volume',              format: 'currency' },
  { name: 'Number of Payouts Done',      category: 'Volume',              format: 'number'   },
  { name: 'Payouts Value',               category: 'Volume',              format: 'currency' },
  // Growth
  { name: 'MoM TPV (%)',                 category: 'Growth',              format: 'percent'  },
  { name: 'MoM MRR (%)',                 category: 'Growth',              format: 'percent'  },
  { name: 'New Companies',               category: 'Growth',              format: 'number'   },
  { name: 'Company Churn',               category: 'Growth',              format: 'percent'  },
  { name: 'MRR Churn',                   category: 'Growth',              format: 'percent'  },
  // Network
  { name: 'Workers',                     category: 'Network',             format: 'number'   },
  { name: 'Companies',                   category: 'Network',             format: 'number'   },
  { name: 'Workers per Company',         category: 'Network',             format: 'decimal'  },
  { name: 'Avg. User Income',            category: 'Network',             format: 'currency' },
  // Banking & Cards
  { name: 'Total Savings (MAB)',         category: 'Banking & Cards',     format: 'currency' },
  { name: 'Active Cards',                category: 'Banking & Cards',     format: 'number'   },
  { name: 'Total Card Spending',         category: 'Banking & Cards',     format: 'currency' },
  // People & Efficiency
  { name: 'Headcount',                   category: 'People & Efficiency', format: 'number'   },
  { name: 'Burn',                        category: 'People & Efficiency', format: 'currency', aliases: ['burn/ operational cash', 'burn/operational cash', 'operational cash'] },
  { name: 'Revenue per Team Member',     category: 'People & Efficiency', format: 'currency' },
  { name: 'ARR per Team Member',         category: 'People & Efficiency', format: 'currency' },
]

export function formatMetricValue(value: number | null | undefined, format: MetricFormat): string {
  if (value === null || value === undefined) return '—'
  switch (format) {
    case 'currency':
      if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
      if (Math.abs(value) >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`
      return `$${value.toLocaleString()}`
    case 'percent':
      return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`
    case 'decimal':
      return value.toFixed(2)
    case 'number':
      return value.toLocaleString()
  }
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
