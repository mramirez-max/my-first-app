'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, Clock, TrendingDown, Sparkles, CheckCircle2 } from 'lucide-react'

export interface ComputedInsight {
  type: 'missing' | 'stale' | 'at_risk'
  area: string
  message: string
}

export interface AreaInsightData {
  areaName: string
  krs: string[]
  recentUpdates: string[]
}

interface InsightsPanelProps {
  insights: ComputedInsight[]
  areaData: AreaInsightData[]
  quarter: number
  year: number
}

const TYPE_CONFIG = {
  missing: { icon: AlertCircle, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', label: 'No OKRs' },
  stale:   { icon: Clock,        color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20', label: 'No updates' },
  at_risk: { icon: TrendingDown,  color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20',    label: 'At risk' },
  ai:      { icon: Sparkles,      color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20',   label: 'Untracked' },
}

type AnyInsight = ComputedInsight | { type: 'ai'; area: string; message: string }

export default function InsightsPanel({ insights, areaData, quarter, year }: InsightsPanelProps) {
  const [aiInsights, setAiInsights] = useState<{ area: string; message: string }[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)

  async function runAIScan() {
    setScanning(true)
    try {
      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areas: areaData }),
      })
      const data = await res.json()
      setAiInsights(data.insights ?? [])
    } finally {
      setScanning(false)
      setScanned(true)
    }
  }

  const allInsights: AnyInsight[] = [
    ...insights,
    ...aiInsights.map(i => ({ ...i, type: 'ai' as const })),
  ]

  return (
    <section className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Executive Insights — Q{quarter} {year}</h2>
          <p className="text-sm text-white/40 mt-0.5">OKRs needing attention across all areas</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={runAIScan}
          disabled={scanning}
          className="gap-2 border-white/15 text-white/70 hover:text-white hover:bg-white/5 shrink-0"
        >
          <Sparkles size={13} className={scanning ? 'animate-pulse text-blue-400' : ''} />
          {scanning ? 'Scanning…' : scanned ? 'Rescan' : 'Scan for untracked work'}
        </Button>
      </div>

      {allInsights.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-white/40 py-2">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {scanned
            ? 'All areas look good — no issues detected.'
            : 'No flagged items. Run a scan to detect untracked work.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {allInsights.map((ins, i) => {
            const cfg = TYPE_CONFIG[ins.type]
            const Icon = cfg.icon
            return (
              <li
                key={i}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${cfg.bg} ${cfg.border}`}
              >
                <Icon size={14} className={`mt-0.5 shrink-0 ${cfg.color}`} />
                <div className="min-w-0">
                  <span className={`text-xs font-medium ${cfg.color} mr-2`}>{ins.area}</span>
                  <span className="text-sm text-white/70">{ins.message}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
