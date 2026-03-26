'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Area } from '@/types'
import { ComputedInsight, AreaInsightData } from '@/components/admin/InsightsPanel'
import InsightsPanel from '@/components/admin/InsightsPanel'
import { Loader2, Send, CheckCircle2, Bot, User, Sparkles, BarChart2, History, ArrowLeft, Plus, Trash2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { marked } from 'marked'

interface KRDetail {
  description: string
  latestUpdate: string | null
  confidence: number | null
  updatedAt: string | null
  neverUpdated: boolean
}

interface AreaPayload extends AreaInsightData {
  companyObjectives: string[]
  krDetails?: KRDetail[]
}

interface ExecutiveClientProps {
  insights: ComputedInsight[]
  areaData: AreaInsightData[]
  areasPayload: AreaPayload[]
  areas: Area[]
  quarter: number
  year: number
  metricsContext: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface SavedSession {
  id: string
  savedAt: string   // ISO
  preview: string   // first user message, truncated
  messages: ChatMessage[]
}

const CHAT_CURRENT_KEY = 'okr_chat_current'
const CHAT_HISTORY_KEY = 'okr_chat_history'
const MAX_HISTORY      = 20

const STARTER_QUESTIONS = [
  "What's most at risk this quarter?",
  "Which areas need attention today?",
  "Where are the biggest execution gaps?",
  "Give me a full health check across all areas",
  "What questions should I ask the Revenue team?",
]

const MD_COMPONENTS: React.ComponentProps<typeof import('react-markdown').default>['components'] = {
  h1:     ({ children }) => <p className="font-bold text-white mb-1">{children}</p>,
  h2:     ({ children }) => <p className="font-semibold text-white/90 mb-1">{children}</p>,
  h3:     ({ children }) => <p className="font-semibold text-white/80 mb-0.5">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  ul:     ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
  li:     ({ children }) => <li className="text-white/80">{children}</li>,
  p:      ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
  code:   ({ children }) => <code className="bg-white/10 px-1 rounded text-xs">{children}</code>,
}

function buildSystemContext(
  insights: ComputedInsight[],
  areasPayload: AreaPayload[],
  quarter: number,
  year: number,
  metricsContext: string,
): string {
  const flagged = insights.length > 0
    ? insights.map(i => `- [${i.type.toUpperCase()}] ${i.area}: ${i.message}`).join('\n')
    : 'None — all areas appear healthy.'

  const areasDetail = areasPayload.length > 0
    ? areasPayload.map(a => {
        const cos = a.companyObjectives.length > 0
          ? a.companyObjectives.map(c => `  → ${c}`).join('\n')
          : '  (none aligned)'

        let krsSection: string
        if (a.krDetails && a.krDetails.length > 0) {
          krsSection = a.krDetails.map(kr => {
            const conf    = kr.confidence !== null ? `confidence ${kr.confidence}/5` : 'not rated'
            const date    = kr.updatedAt ? ` (${new Date(kr.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : ''
            const update  = kr.neverUpdated
              ? '    Update: never updated'
              : `    Update${date}: "${kr.latestUpdate ?? ''}"`
            return `  • ${kr.description}\n    Confidence: ${conf}\n${update}`
          }).join('\n')
        } else {
          krsSection = a.krs.length > 0 ? a.krs.map(k => `  • ${k}`).join('\n') : '  (no key results set)'
        }

        return `**${a.areaName}**\nAligned to: ${cos}\nKey Results:\n${krsSection}`
      }).join('\n\n')
    : '(No OKR data available for this quarter.)'

return `You are the AI Chief of Staff for Ontop, a global payroll and workforce platform. You advise the CEO (Julian) and COO (Cami) directly on Q${quarter} ${year} OKR execution and company performance. You have access to both OKR data and live business metrics — use both when relevant.

RESPONSE RULES:
- Match length to the question. Simple question = short answer. No padding.
- Never be generic. Always reference the actual data.
- No preamble, no sign-off, no "great question".
- NEVER use tables or "|" characters. Bullets for lists of 3+, prose otherwise.

IMMEDIATE ACTIONS SECTION:
Add "## Immediate actions for Julian / Cami" (max 3–5 bullets, concrete and specific) ONLY when:
- The question asks for a health check, priorities, or summary across areas
- The question is diagnostic ("why is X low?", "what's blocking Y?")
- The question asks what to do, who to talk to, or how to prepare for a meeting

Do NOT add it when:
- The question is a simple factual lookup — a metric value, a KR status, a date
- The answer fits in 1–3 lines
- The question is a trend or comparison with no decision needed

## ${metricsContext}

## Flagged Items (${insights.length} total)
${flagged}

## OKR Snapshot — Q${quarter} ${year}
${areasDetail}

When asked about a specific area, reference its KRs and updates directly.`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function archiveCurrent(messages: ChatMessage[]) {
  if (messages.length === 0) return
  const firstUser = messages.find(m => m.role === 'user')?.content ?? ''
  const history: SavedSession[] = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) ?? '[]')
  history.unshift({
    id:      Date.now().toString(),
    savedAt: new Date().toISOString(),
    preview: firstUser.slice(0, 90),
    messages,
  })
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
}

export default function ExecutiveClient({
  insights, areaData, areasPayload, areas, quarter, year, metricsContext,
}: ExecutiveClientProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'insights'>('chat')

  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [chatMessages, setChatMessages]   = useState<ChatMessage[]>([])
  const [chatInput, setChatInput]         = useState('')
  const [streaming, setStreaming]         = useState(false)
  const [streamingText, setStreamingText] = useState('')

  const [showHistory, setShowHistory]   = useState(false)
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([])
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)
  const isFirstRender   = useRef(true)

  // Restore current session from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_CURRENT_KEY)
      if (saved) setChatMessages(JSON.parse(saved))
    } catch {}
  }, [])

  // Auto-save current session whenever messages change (skip first render)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (chatMessages.length > 0) {
      localStorage.setItem(CHAT_CURRENT_KEY, JSON.stringify(chatMessages))
    }
  }, [chatMessages])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingText])

  function openHistory() {
    try {
      setSavedSessions(JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) ?? '[]'))
    } catch {
      setSavedSessions([])
    }
    setShowHistory(true)
  }

  function startNewConversation() {
    archiveCurrent(chatMessages)
    localStorage.removeItem(CHAT_CURRENT_KEY)
    setChatMessages([])
    setShowHistory(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function loadSession(session: SavedSession) {
    // Archive current before switching
    archiveCurrent(chatMessages)
    setChatMessages(session.messages)
    localStorage.setItem(CHAT_CURRENT_KEY, JSON.stringify(session.messages))
    setShowHistory(false)
  }

  function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = savedSessions.filter(s => s.id !== id)
    setSavedSessions(updated)
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(updated))
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function exportToPDF() {
    const sessions = savedSessions.filter(s => selectedIds.has(s.id))
    if (sessions.length === 0) return

    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const renderBody = (m: ChatMessage) => {
      if (m.role === 'assistant') {
        // Parse markdown → HTML so headers, bold, lists render properly
        return marked.parse(m.content) as string
      }
      // User messages: plain text, preserve newlines
      return `<p>${escapeHtml(m.content).replace(/\n/g, '<br>')}</p>`
    }

    const sessionHtml = sessions.map(session => {
      const date = new Date(session.savedAt).toLocaleString('en-US', {
        dateStyle: 'medium', timeStyle: 'short',
      })
      const messages = session.messages.map(m => `
        <div class="msg ${m.role}">
          <div class="label">${m.role === 'user' ? 'You' : 'AI Chief of Staff'}</div>
          <div class="body">${renderBody(m)}</div>
        </div>`).join('')
      return `
        <div class="session">
          <div class="session-header">
            <span class="session-title">${escapeHtml(session.preview || 'Conversation')}</span>
            <span class="session-date">${date} · ${session.messages.length} messages</span>
          </div>
          ${messages}
        </div>`
    }).join('<div class="divider"></div>')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>AI Chief of Staff — Chat Export</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               font-size: 14px; color: #111; background: #fff;
               max-width: 780px; margin: 0 auto; padding: 40px 32px; }
        h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #888; margin-bottom: 32px; }
        .session { margin-bottom: 40px; }
        .session-header { margin-bottom: 16px; }
        .session-title { display: block; font-size: 15px; font-weight: 600; color: #111; }
        .session-date { display: block; font-size: 11px; color: #999; margin-top: 2px; }
        .msg { margin-bottom: 14px; }
        .label { font-size: 11px; font-weight: 600; text-transform: uppercase;
                 letter-spacing: .05em; margin-bottom: 6px; color: #888; }
        .msg.user .label { color: #4A268C; }
        .msg.assistant .label { color: #c0392b; }
        .body { line-height: 1.7; color: #222; }
        .msg.user .body { background: #f5f3ff; border-radius: 8px; padding: 10px 14px; }
        .msg.assistant .body { background: #fff8f8; border-radius: 8px; padding: 12px 16px; }
        /* Markdown elements inside assistant messages */
        .body h1,.body h2,.body h3 { font-weight: 700; margin: 14px 0 6px; color: #111; }
        .body h1 { font-size: 17px; }
        .body h2 { font-size: 15px; }
        .body h3 { font-size: 14px; }
        .body p { margin: 0 0 8px; }
        .body p:last-child { margin-bottom: 0; }
        .body ul,.body ol { padding-left: 20px; margin: 6px 0 10px; }
        .body li { margin-bottom: 4px; }
        .body strong { font-weight: 600; color: #111; }
        .body em { font-style: italic; }
        .body hr { border: none; border-top: 1px solid #e0e0e0; margin: 12px 0; }
        .body code { background: #f0f0f0; border-radius: 3px;
                     padding: 1px 5px; font-size: 12px; font-family: monospace; }
        .divider { border-top: 2px dashed #e5e5e5; margin: 40px 0; }
        .print-btn { display: block; margin: 0 auto 32px;
                     padding: 10px 24px; background: #4A268C; color: #fff;
                     border: none; border-radius: 8px; font-size: 14px;
                     font-weight: 600; cursor: pointer; }
        @media print { .print-btn { display: none; } }
      </style>
    </head><body>
      <button class="print-btn" onclick="window.print()">⬇ Save as PDF</button>
      <h1>AI Chief of Staff — Chat Export</h1>
      <p class="meta">Exported ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · ${sessions.length} conversation${sessions.length !== 1 ? 's' : ''}</p>
      ${sessionHtml}
    </body></html>`)
    win.document.close()
  }

  async function sendToSlack() {
    setSending(true)
    setSendError(null)
    setSent(false)
    try {
      const res  = await fetch('/api/send-slack-insights', { method: 'POST', headers: { 'x-manual-send': '1' } })
      const data = await res.json()
      if (!res.ok || !data.ok) { setSendError(data.error ?? `Failed (${res.status})`); return }
      setSent(true)
      setTimeout(() => setSent(false), 4000)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSending(false)
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    const userMsg: ChatMessage  = { role: 'user', content: trimmed }
    const newMessages           = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setStreaming(true)
    setStreamingText('')

    try {
      const res = await fetch('/api/ai-chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages:      newMessages,
          systemContext: buildSystemContext(insights, areasPayload, quarter, year, metricsContext),
        }),
      })

      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamingText(full)
      }

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: full || '⚠️ No response received. Check that ANTHROPIC_API_KEY is set in your deployment environment.',
      }])
      setStreamingText('')
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Something went wrong. Please try again.' }])
    } finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput) }
  }

  const hasMessages = chatMessages.length > 0 || streaming

  return (
    <div className="space-y-6">

      {/* Slack send bar */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/3 px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <span>Daily briefing scheduled for</span>
          <span className="font-medium text-white/80">7:00 AM COL · #cos</span>
        </div>
        <div className="flex items-center gap-3">
          {sendError && <p className="text-xs text-red-400">{sendError}</p>}
          <Button size="sm" variant="outline" onClick={sendToSlack} disabled={sending}
            className="gap-2 border-white/15 text-white/70 hover:text-white hover:bg-white/5 shrink-0">
            {sending ? <Loader2 size={13} className="animate-spin" /> :
             sent    ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Send size={13} />}
            {sending ? 'Sending…' : sent ? 'Sent to #cos!' : 'Send now'}
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/4 border border-white/8 w-fit">
        <button onClick={() => setActiveTab('chat')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'chat'
              ? 'bg-gradient-to-br from-[#FF5A70]/80 to-[#4A268C]/80 text-white shadow'
              : 'text-white/40 hover:text-white/70')}>
          <Sparkles size={14} /> Ask AI Chief of Staff
        </button>
        <button onClick={() => setActiveTab('insights')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'insights'
              ? 'bg-gradient-to-br from-[#FF5A70]/80 to-[#4A268C]/80 text-white shadow'
              : 'text-white/40 hover:text-white/70')}>
          <BarChart2 size={14} /> Executive Insights
          {insights.length > 0 && (
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
              activeTab === 'insights' ? 'bg-white/20 text-white' : 'bg-white/8 text-white/50')}>
              {insights.length}
            </span>
          )}
        </button>
      </div>

      {/* Insights panel */}
      {activeTab === 'insights' && (
        <InsightsPanel insights={insights} areaData={areaData} areas={areas} quarter={quarter} year={year} />
      )}

      {/* AI Chat */}
      {activeTab === 'chat' && (
        <section className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] overflow-hidden">

          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-white/8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF5A70] to-[#4A268C] flex items-center justify-center shrink-0">
                <Sparkles size={13} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Ask your AI Chief of Staff</h2>
                <p className="text-xs text-white/40">Q{quarter} {year} OKRs + business metrics loaded · ask anything</p>
              </div>
            </div>
            {/* History + New conversation controls */}
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={openHistory}
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
                <History size={12} /> View chat history
              </button>
              {hasMessages && (
                <button onClick={startNewConversation}
                  className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
                  <Plus size={12} /> New
                </button>
              )}
            </div>
          </div>

          {/* History panel (replaces messages when open) */}
          {showHistory ? (
            <div className="px-5 py-4 min-h-[200px] max-h-[520px] overflow-y-auto space-y-3">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { setShowHistory(false); setSelectedIds(new Set()) }}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
                  <ArrowLeft size={13} /> Back to chat
                </button>
                {selectedIds.size > 0 && (
                  <button onClick={exportToPDF}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#FF5A70]/15 text-[#FF5A70] hover:bg-[#FF5A70]/25 transition-colors font-medium">
                    <Download size={12} /> Export {selectedIds.size} as PDF
                  </button>
                )}
              </div>

              {savedSessions.length === 0 ? (
                <p className="text-sm text-white/30 italic">No past conversations yet.</p>
              ) : (
                savedSessions.map(session => {
                  const isSelected = selectedIds.has(session.id)
                  return (
                    <div key={session.id}
                      className={cn(
                        'w-full text-left rounded-xl border bg-white/3 hover:bg-white/6 transition-all group relative',
                        isSelected ? 'border-[#FF5A70]/50 bg-[#FF5A70]/5' : 'border-white/8 hover:border-white/15',
                      )}>
                      {/* Checkbox */}
                      <button onClick={(e) => toggleSelect(session.id, e)}
                        className={cn(
                          'absolute top-3 left-3 w-4 h-4 rounded border flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-[#FF5A70] border-[#FF5A70]'
                            : 'border-white/20 bg-white/5 opacity-0 group-hover:opacity-100',
                        )}>
                        {isSelected && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                      </button>
                      <button onClick={() => loadSession(session)} className="w-full text-left pl-9 pr-10 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-white/75 group-hover:text-white transition-colors line-clamp-2 flex-1">
                            {session.preview || '(no preview)'}
                          </p>
                          <span className="text-xs text-white/25 whitespace-nowrap mt-0.5">
                            {formatDate(session.savedAt)}
                          </span>
                        </div>
                        <p className="text-xs text-white/25 mt-1">
                          {session.messages.length} message{session.messages.length !== 1 ? 's' : ''}
                        </p>
                      </button>
                      <button onClick={(e) => deleteSession(session.id, e)}
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            /* Messages area */
            <div className="px-5 py-4 space-y-4 min-h-[140px] max-h-[520px] overflow-y-auto">

              {/* Starter chips */}
              {!hasMessages && (
                <div className="space-y-3">
                  <p className="text-xs text-white/30">Suggested questions to get started:</p>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_QUESTIONS.map(q => (
                      <button key={q} onClick={() => sendMessage(q)}
                        className="px-3 py-1.5 rounded-full text-xs border border-white/12 bg-white/4 text-white/55 hover:bg-white/10 hover:text-white hover:border-white/25 transition-colors text-left">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {chatMessages.map((msg, i) => (
                <div key={i} className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FF5A70] to-[#4A268C] flex items-center justify-center shrink-0 mt-0.5">
                      <Bot size={11} className="text-white" />
                    </div>
                  )}
                  <div className={cn(
                    'max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-white/10 text-white rounded-tr-sm whitespace-pre-wrap'
                      : 'bg-white/5 text-white/85 rounded-tl-sm prose prose-invert prose-sm max-w-none',
                  )}>
                    {msg.role === 'user'
                      ? msg.content
                      : <ReactMarkdown components={MD_COMPONENTS}>{msg.content}</ReactMarkdown>}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <User size={11} className="text-white/60" />
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming bubble */}
              {streaming && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FF5A70] to-[#4A268C] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={11} className="text-white" />
                  </div>
                  <div className="max-w-[82%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed bg-white/5 text-white/85 prose prose-invert prose-sm max-w-none">
                    {streamingText
                      ? <><ReactMarkdown components={MD_COMPONENTS}>{streamingText}</ReactMarkdown>
                          <span className="inline-block w-0.5 h-3.5 bg-white/50 ml-0.5 animate-pulse align-middle" /></>
                      : <span className="flex items-center gap-1.5 text-white/30"><Loader2 size={12} className="animate-spin" />Thinking…</span>}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input bar — hidden when viewing history */}
          {!showHistory && (
            <div className="px-4 pb-4 pt-2 border-t border-white/8">
              <div className="flex gap-2 items-end">
                <textarea ref={inputRef} value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything — a metric, KR status, risk, or full health check…"
                  rows={1} disabled={streaming}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-white/25 disabled:opacity-50 max-h-32 overflow-y-auto"
                />
                <button onClick={() => sendMessage(chatInput)}
                  disabled={streaming || !chatInput.trim()}
                  className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF5A70] to-[#4A268C] flex items-center justify-center shrink-0 disabled:opacity-30 hover:opacity-90 transition-opacity mb-0.5">
                  {streaming ? <Loader2 size={14} className="text-white animate-spin" /> : <Send size={14} className="text-white" />}
                </button>
              </div>
              <p className="text-xs text-white/20 mt-1.5 ml-1">Enter to send · Shift+Enter for new line</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
