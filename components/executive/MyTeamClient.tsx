'use client'

import { useState, useMemo } from 'react'
import { calcProgress, Profile, AreaObjective } from '@/types'
import { Loader2, FileDown, TrendingUp, TrendingDown, Minus, AlertCircle, Clock, PlusCircle, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import OKRCard from '@/components/okr/OKRCard'
import ObjectiveDialog from '@/components/okr/ObjectiveDialog'
import AISetupModal from '@/components/okr/AISetupModal'
import TeamMetricsSection from '@/components/executive/TeamMetricsSection'
import { useRouter } from 'next/navigation'

interface KRUpdate {
  id: string
  confidence_score: number
  current_value: number
  update_text: string
  week_date: string
  created_at: string
  author?: { full_name: string | null } | null
}

interface KeyResult {
  id: string
  description: string
  target_value: number
  current_value: number
  unit: string | null
  updates?: KRUpdate[]
}

export interface AreaKROption {
  id: string
  description: string
  objectiveTitle: string
}

interface MyTeamClientProps {
  objectives: AreaObjective[]
  areaKRs: AreaKROption[]
  quarter: number
  year: number
  isAdmin: boolean
  profile: Profile
  areaId: string
  areaName: string
}

const CONFIDENCE_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-red-400',
  3: 'bg-yellow-400',
  4: 'bg-emerald-400',
  5: 'bg-emerald-500',
}

const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'Off track',
  2: 'At risk',
  3: 'Cautious',
  4: 'Good',
  5: 'On track',
}

function confidenceColor(score: number): string {
  return CONFIDENCE_COLORS[score] ?? 'bg-white/20'
}

function confidenceDotBg(score: number): string {
  if (score <= 2) return 'bg-red-500/80'
  if (score === 3) return 'bg-yellow-400/80'
  return 'bg-emerald-400/80'
}

// Get the Monday of the current week
function getCurrentWeekMonday(): string {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return monday.toISOString().split('T')[0]
}

// Get last N distinct Monday dates (week_date format: YYYY-MM-DD)
function getLastNWeeks(n: number): string[] {
  const weeks: string[] = []
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

  for (let i = 0; i < n; i++) {
    weeks.push(monday.toISOString().split('T')[0])
    monday.setDate(monday.getDate() - 7)
  }
  return weeks.reverse() // oldest first
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const MD_COMPONENTS: React.ComponentProps<typeof import('react-markdown').default>['components'] = {
  h2: ({ children }) => <h2 className="text-base font-semibold text-white print:text-gray-900 mt-5 mb-2 first:mt-0 pb-1 border-b border-white/10 print:border-gray-200">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-white/90 print:text-gray-800 mt-3 mb-1">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-white print:text-gray-900">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-1.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-1.5">{children}</ol>,
  li: ({ children }) => <li className="text-white/80 print:text-gray-700 text-sm">{children}</li>,
  p: ({ children }) => <p className="text-white/75 print:text-gray-700 text-sm mb-2 last:mb-0">{children}</p>,
}

function KRWeekTrend({ updates, weeks }: { updates: KRUpdate[]; weeks: string[] }) {
  const updatesByWeek = useMemo(() => {
    const map: Record<string, KRUpdate> = {}
    for (const u of updates) {
      // Keep most recent update per week
      if (!map[u.week_date] || new Date(u.created_at) > new Date(map[u.week_date].created_at)) {
        map[u.week_date] = u
      }
    }
    return map
  }, [updates])

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {weeks.map((week, idx) => {
        const update = updatesByWeek[week]
        const isCurrentWeek = idx === weeks.length - 1
        return (
          <div key={week} className="flex flex-col items-center gap-0.5" title={update ? `W/o ${formatWeekLabel(week)}: ${update.confidence_score}/5 — ${CONFIDENCE_LABELS[update.confidence_score]}` : `W/o ${formatWeekLabel(week)}: no update`}>
            <div
              className={`w-4 h-4 rounded-full border transition-all ${
                update
                  ? `${confidenceDotBg(update.confidence_score)} border-transparent`
                  : isCurrentWeek
                    ? 'bg-transparent border-red-400/60 border-dashed'
                    : 'bg-white/8 border-white/10'
              }`}
            />
            {idx === 0 && (
              <span className="text-[9px] text-white/20 whitespace-nowrap">{formatWeekLabel(week)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function KRCard({ kr, weeks, currentWeek }: { kr: KeyResult; weeks: string[]; currentWeek: string }) {
  const updates = useMemo(
    () => [...(kr.updates ?? [])].sort((a, b) => new Date(b.week_date).getTime() - new Date(a.week_date).getTime()),
    [kr.updates]
  )

  const latest = updates[0] ?? null
  const prev = updates.find(u => u.week_date < (latest?.week_date ?? '')) ?? null
  const progress = calcProgress(kr.current_value, kr.target_value)
  const hasUpdateThisWeek = updates.some(u => u.week_date === currentWeek)

  const delta = latest && prev ? latest.confidence_score - prev.confidence_score : null

  return (
    <div className="rounded-lg border border-white/8 bg-white/3 p-3 space-y-2.5">
      {/* KR header */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-white/80 flex-1">{kr.description}</p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Delta badge */}
          {delta !== null && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${
              delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-white/40'
            }`}>
              {delta > 0 ? <TrendingUp size={11} /> : delta < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
              {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : ''}
            </span>
          )}
          {/* Latest confidence badge */}
          {latest ? (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold text-white ${confidenceColor(latest.confidence_score)}`}>
              {latest.confidence_score}/5
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/8 text-white/30">
              —
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[11px] text-white/40">
          <span>{kr.current_value}{kr.unit ? ` ${kr.unit}` : ''} / {kr.target_value}{kr.unit ? ` ${kr.unit}` : ''}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              progress >= 80 ? 'bg-emerald-400' : progress >= 50 ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Week-over-week trend */}
      <div className="space-y-1">
        <p className="text-[10px] text-white/25 uppercase tracking-wide">Confidence — last {weeks.length} weeks</p>
        <KRWeekTrend updates={kr.updates ?? []} weeks={weeks} />
      </div>

      {/* Latest update text */}
      {latest && (
        <p className="text-xs text-white/45 italic border-t border-white/6 pt-2">
          &ldquo;{latest.update_text}&rdquo;
          <span className="not-italic text-white/25 ml-1">— {formatWeekLabel(latest.week_date)}</span>
        </p>
      )}

      {/* Missing update warning */}
      {!hasUpdateThisWeek && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-400/70">
          <AlertCircle size={11} />
          <span>No update this week</span>
        </div>
      )}
    </div>
  )
}

export default function MyTeamClient({ objectives, areaKRs, quarter, year, isAdmin, profile, areaId, areaName }: MyTeamClientProps) {
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showObjectiveDialog, setShowObjectiveDialog] = useState(false)
  const [showAISetup, setShowAISetup] = useState(false)
  const router = useRouter()

  const weeks = useMemo(() => getLastNWeeks(6), [])
  const currentWeek = useMemo(() => getCurrentWeekMonday(), [])

  const canEdit = isAdmin || profile.role === 'area_lead'

  function handleRefresh() {
    router.refresh()
  }

  // Quick stats
  const allKRs = objectives.flatMap(o => o.key_results ?? [])
  const allUpdates = allKRs.flatMap(kr => kr.updates ?? [])
  const latestByKR = allKRs.map(kr => {
    const sorted = [...(kr.updates ?? [])].sort((a, b) => new Date(b.week_date).getTime() - new Date(a.week_date).getTime())
    return sorted[0] ?? null
  })
  const onTrack = latestByKR.filter(u => u && u.confidence_score >= 4).length
  const cautious = latestByKR.filter(u => u && u.confidence_score === 3).length
  const atRisk = latestByKR.filter(u => u && u.confidence_score <= 2).length
  const noUpdate = latestByKR.filter(u => !u).length
  const missingThisWeek = allKRs.filter(kr => !(kr.updates ?? []).some(u => u.week_date === currentWeek)).length

  async function generateReport() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/okrs/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter, year, areaId, areaName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate report')
      setReport(data.report)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(false)
    }
  }

  // --- Team member view (non-admin) ---
  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/50">
            {objectives.length === 0
              ? `No OKRs set for Q${quarter} ${year} yet.`
              : `${objectives.length} objective${objectives.length !== 1 ? 's' : ''} · Q${quarter} ${year}`}
          </p>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAISetup(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FF5A70] to-[#4A268C] text-white hover:opacity-90 transition-opacity"
              >
                <Sparkles size={14} />
                Generate with AI
              </button>
              <button
                onClick={() => setShowObjectiveDialog(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-white/15 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                <PlusCircle size={14} />
                Add Objective
              </button>
            </div>
          )}
        </div>

        {objectives.length === 0 && canEdit && (
          <div className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-8 text-center space-y-3">
            <Clock size={32} className="text-white/20 mx-auto" />
            <p className="text-white/50 text-sm">No team OKRs yet. Add your first objective to get started.</p>
            <button
              onClick={() => setShowObjectiveDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FF5A70] to-[#4A268C] text-white hover:opacity-90 transition-opacity"
            >
              <PlusCircle size={14} />
              Add Objective
            </button>
          </div>
        )}

        {objectives.map(obj => (
          <OKRCard
            key={obj.id}
            objective={obj as AreaObjective}
            type="team"
            profile={profile}
            areaKRs={areaKRs}
            onRefresh={handleRefresh}
            isCurrentQuarter={true}
          />

        ))}

        <ObjectiveDialog
          open={showObjectiveDialog}
          onClose={() => setShowObjectiveDialog(false)}
          type="team"
          areaId={areaId}
          areaKRs={areaKRs}
          onSuccess={handleRefresh}
        />

        <AISetupModal
          open={showAISetup}
          onClose={() => setShowAISetup(false)}
          type="team"
          areaId={areaId}
          areaName={areaName}
          companyObjectives={[]}
          areaKRs={areaKRs}
          quarter={quarter}
          year={year}
          onSuccess={handleRefresh}
        />
      </div>
    )
  }

  // --- Admin/manager view ---
  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        {[
          { label: 'On track', value: onTrack, color: 'text-emerald-400' },
          { label: 'Cautious', value: cautious, color: 'text-yellow-400' },
          { label: 'At risk', value: atRisk, color: 'text-red-400' },
          { label: 'Missing this week', value: missingThisWeek, color: 'text-amber-400' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-white/8 bg-white/3 p-4 text-center">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* OKR management + week-over-week tracking */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wide">Team OKRs</h3>
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => setShowAISetup(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-br from-[#FF5A70] to-[#4A268C] text-white hover:opacity-90 transition-opacity"
            >
              <Sparkles size={12} />
              Generate with AI
            </button>
            <button
              onClick={() => setShowObjectiveDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              <PlusCircle size={12} />
              Add Objective
            </button>
          </div>
        </div>

        {objectives.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] p-8 text-center space-y-3">
            <Clock size={32} className="text-white/20 mx-auto" />
            <p className="text-white/50 text-sm">No OKRs set for {areaName} in Q{quarter} {year}.</p>
            <button
              onClick={() => setShowObjectiveDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FF5A70] to-[#4A268C] text-white hover:opacity-90 transition-opacity"
            >
              <PlusCircle size={14} />
              Add Objective
            </button>
          </div>
        ) : (
          objectives.map(obj => (
            <OKRCard
              key={obj.id}
              objective={obj as AreaObjective}
              type="team"
              profile={profile}
              areaKRs={areaKRs}
              onRefresh={handleRefresh}
              isCurrentQuarter={true}
            />
          ))
        )}

        <ObjectiveDialog
          open={showObjectiveDialog}
          onClose={() => setShowObjectiveDialog(false)}
          type="team"
          areaId={areaId}
          areaKRs={areaKRs}
          onSuccess={handleRefresh}
        />

        <AISetupModal
          open={showAISetup}
          onClose={() => setShowAISetup(false)}
          type="team"
          areaId={areaId}
          areaName={areaName}
          companyObjectives={[]}
          areaKRs={areaKRs}
          quarter={quarter}
          year={year}
          onSuccess={handleRefresh}
        />
      </div>

      {/* Team Metrics — week-over-week input/output tracking */}
      <div className="print:hidden">
        <TeamMetricsSection areaId={areaId} canEdit={canEdit} />
      </div>

      {/* Report section — screen */}
      <div className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] overflow-hidden print:hidden">
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">Weekly Report</h3>
            <p className="text-xs text-white/40 mt-0.5">AI-generated summary of this week's {areaName} progress</p>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                <FileDown size={13} />
                Save as PDF
              </button>
            )}
            <button
              onClick={generateReport}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FF5A70] to-[#4A268C] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : null}
              {generating ? 'Generating…' : report ? 'Regenerate' : 'Generate Report'}
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!report && !error && !generating && (
            <p className="text-sm text-white/35 italic">Click &ldquo;Generate Report&rdquo; to create your weekly status summary.</p>
          )}
          {generating && (
            <div className="flex items-center gap-2 text-sm text-white/40">
              <Loader2 size={14} className="animate-spin" /> Analyzing Operations OKRs…
            </div>
          )}
          {report && (
            <div className="prose-sm">
              <ReactMarkdown components={MD_COMPONENTS}>{report}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* ── PRINT-ONLY PDF LAYOUT ── */}
      {report && <PrintReport objectives={objectives} report={report} quarter={quarter} year={year} currentWeek={currentWeek} areaName={areaName} />}
    </div>
  )
}

/* ── Print-only branded PDF component ── */
function PrintReport({
  objectives,
  report,
  quarter,
  year,
  currentWeek,
  areaName,
}: {
  objectives: AreaObjective[]
  report: string
  quarter: number
  year: number
  currentWeek: string
  areaName: string
}) {
  const weekLabel = (() => {
    const d = new Date(currentWeek + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  })()

  const CONF_LABEL: Record<number, string> = { 1: 'Off track', 2: 'At risk', 3: 'Cautious', 4: 'Good', 5: 'On track' }

  return (
    <div className="hidden print:block okr-print-report" style={{ fontFamily: 'system-ui, sans-serif', color: '#111', background: 'white' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #FF5A70, #4A268C)', padding: '20px 32px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'white', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.3px' }}>
              {areaName} — Weekly OKR Report
            </div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', marginTop: '4px' }}>
              Q{quarter} {year} · Week of {weekLabel}
            </div>
          </div>
          <img src="/logo-ontop.png" alt="Ontop" style={{ height: '28px', filter: 'brightness(0) invert(1)' }} />
        </div>
      </div>

      <div style={{ padding: '0 32px 32px' }}>

        {/* OKR Progress Table — one per objective */}
        {objectives.map(obj => {
          const krs = (obj.key_results ?? []) as KeyResult[]
          const alignedTitle = (obj.aligned_objective as { description?: string } | null)?.description

          return (
            <div key={obj.id} style={{ marginBottom: '28px' }}>
              {/* Objective heading */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#291960', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Objective
                </div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginTop: '2px' }}>{obj.title}</div>
                {alignedTitle && (
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                    Contributes to: {alignedTitle}
                  </div>
                )}
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#291960' }}>
                    {['Key Result', 'Target', 'Current', 'Progress', 'Confidence', 'Latest Update'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', color: 'white', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {krs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '10px', color: '#888', fontStyle: 'italic', borderBottom: '1px solid #eee' }}>
                        No key results defined.
                      </td>
                    </tr>
                  ) : krs.map((kr, i) => {
                    const sorted = [...(kr.updates ?? [])].sort(
                      (a, b) => new Date(b.week_date).getTime() - new Date(a.week_date).getTime()
                    )
                    const latest = sorted[0] ?? null
                    const progress = calcProgress(kr.current_value, kr.target_value)
                    const unit = kr.unit ? ` ${kr.unit}` : ''
                    const hasUpdateThisWeek = sorted.some(u => u.week_date === currentWeek)
                    const confScore = latest?.confidence_score ?? null
                    const confColor = confScore == null ? '#888' : confScore >= 4 ? '#16a34a' : confScore === 3 ? '#ca8a04' : '#dc2626'
                    const updateText = latest?.update_text
                      ? latest.update_text.length > 80 ? latest.update_text.slice(0, 80) + '…' : latest.update_text
                      : hasUpdateThisWeek ? '—' : 'No update this week'

                    return (
                      <tr key={kr.id} style={{ background: i % 2 === 0 ? '#fafafa' : 'white', borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 10px', color: '#111', maxWidth: '180px' }}>{kr.description}</td>
                        <td style={{ padding: '8px 10px', color: '#444', whiteSpace: 'nowrap' }}>{kr.target_value}{unit}</td>
                        <td style={{ padding: '8px 10px', color: '#444', whiteSpace: 'nowrap' }}>{kr.current_value}{unit}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 600, color: progress >= 80 ? '#16a34a' : progress >= 50 ? '#ca8a04' : '#dc2626' }}>
                            {progress}%
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          {confScore !== null ? (
                            <span style={{ color: confColor, fontWeight: 600 }}>
                              {confScore}/5 · {CONF_LABEL[confScore]}
                            </span>
                          ) : (
                            <span style={{ color: '#888' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#555', fontStyle: latest?.update_text ? 'normal' : 'italic' }}>
                          {updateText}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}

        {/* Divider */}
        <div style={{ borderTop: '2px solid #FF5A70', margin: '24px 0 20px' }} />

        {/* AI Summary */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#291960', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            AI Summary
          </div>
          <div style={{ fontSize: '12px', lineHeight: '1.7', color: '#333', whiteSpace: 'pre-wrap' }}>
            {report.replace(/##\s*/g, '\n').replace(/\*\*/g, '')}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '32px', paddingTop: '12px', borderTop: '1px solid #eee', fontSize: '11px', color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
          <span>Generated by Ontop AI Chief of Staff</span>
          <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}
