'use client'

import {
  LineChart,
  Line,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface KRTrendChartProps {
  updates: { current_value: number; week_date: string }[]
  targetValue: number
  unit: string
}

function formatWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type DataPoint = { current_value: number; week_date: string; unit: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as DataPoint
  return (
    <div className="rounded-lg border border-white/10 bg-[#1c1540] px-3 py-2 text-xs text-white shadow-lg">
      <p className="text-white/40 mb-0.5">Week of {formatWeek(d.week_date)}</p>
      <p className="font-semibold">
        {d.current_value.toLocaleString()} {d.unit}
      </p>
    </div>
  )
}

export default function KRTrendChart({ updates, targetValue, unit }: KRTrendChartProps) {
  const data = updates.map(u => ({ ...u, unit }))

  return (
    <div className="w-full h-[90px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
          <ReferenceLine
            y={targetValue}
            stroke="rgba(255,255,255,0.15)"
            strokeDasharray="4 3"
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="current_value"
            stroke="#FF5A70"
            strokeWidth={2}
            dot={{ r: 3, fill: '#FF5A70', strokeWidth: 0 }}
            activeDot={{ r: 4, fill: '#FF5A70', stroke: 'rgba(255,90,112,0.3)', strokeWidth: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
