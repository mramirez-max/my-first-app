'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Area } from '@/types'
import { ComputedInsight, AreaInsightData } from '@/components/admin/InsightsPanel'
import InsightsPanel from '@/components/admin/InsightsPanel'
import { Loader2, Send, CheckCircle2, Bot, User, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

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

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const STARTER_QUESTIONS = [
  "What's most at risk this quarter?",
  "Which areas need attention today?",
  "Where are the biggest execution gaps?",
  "Give me a full health check across all areas",
  "What questions should I ask the Revenue team?",
]

function buildSystemContext(
  insights: ComputedInsight[],
  areasPayload: AreaPayload[],
  quarter: number,
  year: number,
): string {
  const flagged = insights.length > 0
    ? insights.map(i => `- [${i.type.toUpperCase()}] ${i.area}: ${i.message}`).join('\n')
    : 'None — all areas appear healthy.'

  const areasDetail = areasPayload.length > 0
    ? areasPayload.map(a => {
        const krs = a.krs.length > 0
          ? a.krs.map(k => `  • ${k}`).join('\n')
          : '  (no key results set)'
        const updates = a.recentUpdates.length > 0
          ? a.recentUpdates.slice(0, 4).map(u => `  - ${u}`).join('\n')
          : '  (no recent updates)'
        const cos = a.companyObjectives.length > 0
          ? a.companyObjectives.map(c => `  → ${c}`).join('\n')
          : '  (none aligned)'
        return `**${a.areaName}**\nKey Results:\n${krs}\nRecent Updates:\n${updates}\nAligned Company Objectives:\n${cos}`
      }).join('\n\n')
    : '(No OKR data available for this quarter.)'

  return `You are the AI Chief of Staff for Ontop, a global payroll and workforce platform. You advise the CEO (Julian) and COO (Cami) directly on Q${quarter} ${year} OKR execution and company performance.

Your job: give sharp, specific, operator-level answers. Never be generic. Connect every answer to the actual data below. Be concise — executives don't want essays. Use bullet points for lists. Bold key metrics and critical facts when relevant. If data is missing or unclear, say so honestly.

## Flagged Items Requiring Attention (${insights.length} total)
${flagged}

## Full OKR Snapshot — Q${quarter} ${year}
${areasDetail}

When asked about a specific area, reference its KRs and updates directly. When asked for questions to ask a leader, make them sharp and decision-useful — not generic coaching language.`
}

export default function ExecutiveClient({
  insights, areaData, areasPayload, areas, quarter, year,
}: ExecutiveClientProps) {
  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [chatMessages, setChatMessages]     = useState<ChatMessage[]>([])
  const [chatInput, setChatInput]           = useState('')
  const [streaming, setStreaming]           = useState(false)
  const [streamingText, setStreamingText]   = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingText])

  async function sendToSlack() {
    setSending(true)
    setSendError(null)
    setSent(false)
    try {
      const res = await fetch('/api/send-slack-insights', {
        method: 'POST',
        headers: { 'x-manual-send': '1' },
      })
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

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setStreaming(true)
    setStreamingText('')

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          systemContext: buildSystemContext(insights, areasPayload, quarter, year),
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

      setChatMessages(prev => [...prev, { role: 'assistant', content: full }])
      setStreamingText('')
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      }])
    } finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(chatInput)
    }
  }

  const hasMessages = chatMessages.length > 0 || streaming

  return (
    <div className="space-y-8">

      {/* Slack send bar */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/3 px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <span>Daily briefing scheduled for</span>
          <span className="font-medium text-white/80">8:00 AM EST · #cos</span>
        </div>
        <div className="flex items-center gap-3">
          {sendError && <p className="text-xs text-red-400">{sendError}</p>}
          <Button
            size="sm"
            variant="outline"
            onClick={sendToSlack}
            disabled={sending}
            className="gap-2 border-white/15 text-white/70 hover:text-white hover:bg-white/5 shrink-0"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> :
             sent    ? <CheckCircle2 size={13} className="text-emerald-400" /> :
                       <Send size={13} />}
            {sending ? 'Sending…' : sent ? 'Sent to #cos!' : 'Send now'}
          </Button>
        </div>
      </div>

      {/* Insights panel */}
      <InsightsPanel
        insights={insights}
        areaData={areaData}
        areas={areas}
        quarter={quarter}
        year={year}
      />

      {/* AI Chat */}
      <section className="rounded-xl border border-white/8 bg-gradient-to-br from-[#1c1540] to-[#23174B] overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF5A70] to-[#4A268C] flex items-center justify-center shrink-0">
              <Sparkles size={13} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Ask your AI Chief of Staff</h2>
              <p className="text-xs text-white/40">Full Q{quarter} {year} OKR context loaded · ask anything about any area</p>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="px-5 py-4 space-y-4 min-h-[140px] max-h-[520px] overflow-y-auto">

          {/* Starter chips */}
          {!hasMessages && (
            <div className="space-y-3">
              <p className="text-xs text-white/30">Suggested questions to get started:</p>
              <div className="flex flex-wrap gap-2">
                {STARTER_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="px-3 py-1.5 rounded-full text-xs border border-white/12 bg-white/4 text-white/55 hover:bg-white/10 hover:text-white hover:border-white/25 transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message history */}
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
                {msg.role === 'user' ? msg.content : (
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <p className="font-bold text-white mb-1">{children}</p>,
                      h2: ({ children }) => <p className="font-semibold text-white/90 mb-1">{children}</p>,
                      h3: ({ children }) => <p className="font-semibold text-white/80 mb-0.5">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                      li: ({ children }) => <li className="text-white/80">{children}</li>,
                      p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                      code: ({ children }) => <code className="bg-white/10 px-1 rounded text-xs">{children}</code>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
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
                {streamingText ? (
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <p className="font-bold text-white mb-1">{children}</p>,
                      h2: ({ children }) => <p className="font-semibold text-white/90 mb-1">{children}</p>,
                      h3: ({ children }) => <p className="font-semibold text-white/80 mb-0.5">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                      li: ({ children }) => <li className="text-white/80">{children}</li>,
                      p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                      code: ({ children }) => <code className="bg-white/10 px-1 rounded text-xs">{children}</code>,
                    }}
                  >
                    {streamingText}
                  </ReactMarkdown>
                ) : (
                  <span className="flex items-center gap-1.5 text-white/30"><Loader2 size={12} className="animate-spin" />Thinking…</span>
                )}
                {streamingText && <span className="inline-block w-0.5 h-3.5 bg-white/50 ml-0.5 animate-pulse align-middle" />}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-4 pb-4 pt-2 border-t border-white/8">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about OKRs, areas, risks, or meeting prep…"
              rows={1}
              disabled={streaming}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-white/25 disabled:opacity-50 max-h-32 overflow-y-auto"
            />
            <button
              onClick={() => sendMessage(chatInput)}
              disabled={streaming || !chatInput.trim()}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF5A70] to-[#4A268C] flex items-center justify-center shrink-0 disabled:opacity-30 hover:opacity-90 transition-opacity mb-0.5"
            >
              {streaming
                ? <Loader2 size={14} className="text-white animate-spin" />
                : <Send size={14} className="text-white" />}
            </button>
          </div>
          <p className="text-xs text-white/20 mt-1.5 ml-1">Enter to send · Shift+Enter for new line</p>
        </div>
      </section>
    </div>
  )
}
