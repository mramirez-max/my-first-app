'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Area } from '@/types'
import { ComputedInsight, AreaInsightData } from '@/components/admin/InsightsPanel'
import InsightsPanel from '@/components/admin/InsightsPanel'
import { Sparkles, Loader2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AreaQuestion {
  area: string
  questions: string[]
}

interface AreaPayload extends AreaInsightData {
  companyObjectives: string[]
}

interface ExecutiveClientProps {
  insights: ComputedInsight[]
  areaData: AreaInsightData[]
  areasPayload: AreaPayload[]
  areas: Area[]
  quarter: number
  year: number
}

export default function ExecutiveClient({
  insights, areaData, areasPayload, areas, quarter, year,
}: ExecutiveClientProps) {
  const [questions, setQuestions] = useState<AreaQuestion[]>([])
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set())

  async function generateQuestions() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areas: areasPayload }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`)
        return
      }
      const qs: AreaQuestion[] = data.questions ?? []
      if (qs.length === 0) {
        setError('No questions were returned. The area OKRs may be empty.')
        return
      }
      setQuestions(qs)
      setExpandedAreas(new Set(qs.map((q: AreaQuestion) => q.area)))
      setGenerated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  function toggleArea(areaName: string) {
    setExpandedAreas(prev => {
      const next = new Set(prev)
      next.has(areaName) ? next.delete(areaName) : next.add(areaName)
      return next
    })
  }

  const areasWithData = areasPayload.filter(a => a.krs.length > 0)

  return (
    <div className="space-y-8">
      {/* Insights section */}
      <InsightsPanel
        insights={insights}
        areaData={areaData}
        areas={areas}
        quarter={quarter}
        year={year}
      />

      {/* Suggested questions section */}
      <section className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-white">
              Suggested Follow-Up Questions — Q{quarter} {year}
            </h2>
            <p className="text-sm text-white/40 mt-0.5">
              AI-generated questions to ask each area lead based on their OKRs and recent updates
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={generateQuestions}
            disabled={generating || areasWithData.length === 0}
            className="gap-2 border-white/15 text-white/70 hover:text-white hover:bg-white/5 shrink-0"
          >
            {generating
              ? <Loader2 size={13} className="animate-spin" />
              : <Sparkles size={13} />
            }
            {generating ? 'Generating…' : generated ? 'Regenerate' : 'Generate questions'}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            <span className="font-medium">Generation failed:</span> {error}
          </div>
        )}

        {areasWithData.length === 0 && (
          <p className="text-sm text-white/40 italic py-2">
            No OKRs found for this quarter. Import area OKRs first.
          </p>
        )}

        {!generated && areasWithData.length > 0 && (
          <div className="flex flex-wrap gap-2 py-1">
            {areasWithData.map(a => (
              <span
                key={a.areaName}
                className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-white/40"
              >
                {a.areaName}
              </span>
            ))}
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-2">
            {questions.map(aq => {
              const isOpen = expandedAreas.has(aq.area)
              return (
                <div key={aq.area} className="rounded-lg border border-white/8 bg-white/2 overflow-hidden">
                  <button
                    onClick={() => toggleArea(aq.area)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/3 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare size={14} className="text-[#FF5A70]/70 shrink-0" />
                      <span className="text-sm font-medium text-white">{aq.area}</span>
                      <span className="text-xs text-white/30 ml-1">{aq.questions.length} questions</span>
                    </div>
                    {isOpen
                      ? <ChevronUp size={14} className="text-white/30 shrink-0" />
                      : <ChevronDown size={14} className="text-white/30 shrink-0" />
                    }
                  </button>

                  {isOpen && (
                    <ul className="px-4 pb-3 space-y-2 border-t border-white/6 pt-3">
                      {aq.questions.map((q, i) => (
                        <li key={i} className="flex gap-3 items-start">
                          <span className={cn(
                            'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5',
                            'bg-[#FF5A70]/15 text-[#FF5A70]'
                          )}>
                            {i + 1}
                          </span>
                          <p className="text-sm text-white/80 leading-relaxed">{q}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
