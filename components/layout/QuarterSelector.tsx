'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

interface QuarterSelectorProps {
  currentQuarter: number
  currentYear: number
  selectedQuarter: number
  selectedYear: number
}

function generateQuarters(fromQ: number, fromY: number, count = 6) {
  const result = []
  let q = fromQ, y = fromY
  for (let i = 0; i < count; i++) {
    result.push({ quarter: q, year: y })
    q--
    if (q === 0) { q = 4; y-- }
  }
  return result
}

export default function QuarterSelector({
  currentQuarter,
  currentYear,
  selectedQuarter,
  selectedYear,
}: QuarterSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const quarters = generateQuarters(currentQuarter, currentYear)
  const isCurrentSelected = selectedQuarter === currentQuarter && selectedYear === currentYear

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const [q, y] = e.target.value.split('-').map(Number)
    const params = new URLSearchParams(searchParams.toString())
    if (q === currentQuarter && y === currentYear) {
      params.delete('q')
      params.delete('y')
    } else {
      params.set('q', String(q))
      params.set('y', String(y))
    }
    const query = params.toString()
    router.push(`${pathname}${query ? `?${query}` : ''}`)
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={`${selectedQuarter}-${selectedYear}`}
        onChange={handleChange}
        className="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-white/8 border border-white/12 text-sm font-semibold text-white cursor-pointer hover:bg-white/12 transition-colors focus:outline-none focus:border-[#FF5A70]/50"
      >
        {quarters.map(({ quarter, year }) => {
          const isCurrent = quarter === currentQuarter && year === currentYear
          return (
            <option
              key={`${quarter}-${year}`}
              value={`${quarter}-${year}`}
              className="bg-[#1c1540] text-white"
            >
              Q{quarter} {year}{isCurrent ? ' (current)' : ''}
            </option>
          )
        })}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 text-white/50 pointer-events-none" />
    </div>
  )
}
