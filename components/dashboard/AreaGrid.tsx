import Link from 'next/link'
import { Area, HealthStatus, getHealthStatus } from '@/types'

interface AreaHealth {
  area: Area
  avgConfidence: number | null
  objectiveCount: number
}

interface AreaGridProps {
  areaHealthData: AreaHealth[]
}

const HEALTH_STYLES: Record<HealthStatus, { dot: string; label: string; labelColor: string; border: string }> = {
  green:  { dot: 'bg-emerald-400', label: 'On Track',  labelColor: 'text-emerald-400', border: 'border-emerald-500/25' },
  yellow: { dot: 'bg-yellow-400',  label: 'At Risk',   labelColor: 'text-yellow-400',  border: 'border-yellow-400/25'  },
  red:    { dot: 'bg-red-400',     label: 'Off Track', labelColor: 'text-red-400',     border: 'border-red-500/25'     },
  none:   { dot: 'bg-white/25',    label: 'No Data',   labelColor: 'text-white/30',    border: 'border-white/10'       },
}

const AREA_SLUGS: Record<string, string> = {
  'Operations': 'operations',
  'Revenue': 'revenue',
  'Marketing': 'marketing',
  'Customer Success': 'customer-success',
  'Finance': 'finance',
  'Legal': 'legal',
  'Compliance': 'compliance',
  'People': 'people',
  'Tech': 'tech',
  'Product': 'product',
  'Worker Journey': 'worker-journey',
  'Sales': 'sales',
}

export default function AreaGrid({ areaHealthData }: AreaGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {areaHealthData.map(({ area, avgConfidence, objectiveCount }) => {
        const health = getHealthStatus(avgConfidence)
        const style = HEALTH_STYLES[health]
        const slug = AREA_SLUGS[area.name] ?? area.name.toLowerCase().replace(/ /g, '-')

        return (
          <Link
            key={area.id}
            href={`/areas/${slug}`}
            className={`block rounded-xl border overflow-hidden hover:brightness-110 transition-all hover:scale-[1.02] bg-gradient-to-br from-[#1c1540] to-[#23174B] ${style.border}`}
          >
            <div className="p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} />
                <span className={`text-xs font-semibold uppercase tracking-wide truncate ${style.labelColor}`}>
                  {style.label}
                </span>
              </div>
              <p className="text-sm font-bold text-white leading-tight">{area.name}</p>
              <p className="text-xs text-white/40 mt-1.5">
                {objectiveCount} objective{objectiveCount !== 1 ? 's' : ''}
                {avgConfidence !== null && (
                  <span className="text-white/50"> · {avgConfidence.toFixed(1)}/5</span>
                )}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
