import Link from 'next/link'
import { CompanyObjective } from '@/types'
import { ArrowRight } from 'lucide-react'

interface CompanyOKRSummaryProps {
  objectives: CompanyObjective[]
  areaCountByObjective: Record<string, number>
}

const OBJ_COLORS = [
  'from-[#FF5A70] to-[#4A268C]',
  'from-[#6364BF] to-[#4A268C]',
  'from-[#883883] to-[#4A268C]',
]

export default function CompanyOKRSummary({ objectives, areaCountByObjective }: CompanyOKRSummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {objectives.map((obj, i) => {
        const areaCount = areaCountByObjective[obj.id] ?? 0

        return (
          <Link
            key={obj.id}
            href="/company"
            className="group block rounded-xl border border-white/8 overflow-hidden hover:shadow-lg hover:border-white/15 transition-all"
          >
            <div className={`bg-gradient-to-r ${OBJ_COLORS[i % OBJ_COLORS.length]} p-5`}>
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">
                Company Objective {i + 1}
              </p>
              <p className="text-sm font-semibold text-white leading-snug line-clamp-3">
                {obj.title}
              </p>
            </div>
            <div className="p-4 bg-[#140e2e] flex items-center justify-between">
              <span className="text-xs text-white/50">
                {areaCount > 0
                  ? `${areaCount} area${areaCount !== 1 ? 's' : ''} contributing`
                  : 'No areas aligned yet'}
              </span>
              <ArrowRight size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
