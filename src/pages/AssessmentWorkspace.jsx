// src/pages/AssessmentWorkspace.jsx — Interactive Dual-Pane Work Simulation Workspace (PRISM Next)
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useArtifactStore } from '../lib/artifactStore.js'
import ArtifactRenderer from '../components/artifacts/ArtifactRenderer.jsx'

export default function AssessmentWorkspace() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const {
    artifacts,
    activeArtifactId,
    setActiveArtifact,
    setSession,
    activeArtifact
  } = useArtifactStore()

  const [loading, setLoading] = useState(true)
  const [sessionData, setSessionData] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputVal, setInputVal] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [isFinishing, setIsFinishing] = useState(false)
  const [showBriefing, setShowBriefing] = useState(false)
  const chatScrollRef = useRef(null)

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const token = localStorage.getItem('token')
        const headers = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        // 1. Fetch live artifacts
        const artRes = await fetch(`/api/assessment/artifacts/${sessionId}`, { headers })
        const artData = await artRes.json()

        if (artData.artifacts && artData.artifacts.length > 0) {
          setSession(sessionId, artData.artifacts, artData.scenarioTitle || 'Work Simulation')
        }

        // 2. Fetch session data / start session if new
        const sessRes = await fetch('/api/assessment/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            sessionId,
            scenarioId: 'prism-sim-mkt-l1',
            jobFamilyId: 'STUDAI-JF-MKT-L1'
          })
        })
        const sessJson = await sessRes.json()
        setSessionData(sessJson)

        if (sessJson.messages && sessJson.messages.length > 0) {
          setMessages(sessJson.messages)
        } else if (sessJson.scenario) {
          setMessages([
            {
              speaker: 'Elena Vance (CEO)',
              content: "Thanks for jumping on this call so quickly. You've seen the board dashboard—our CAC is up 48% and we're burning cash. Marcus wants to double our TikTok budget, but I'm nervous. Take a look at the data in your workspace. What do you see as the real root cause, and what is your initial diagnosis?"
            }
          ])
        }

        setLoading(false)
      } catch (err) {
        console.error('Workspace load failed', err)
        setLoading(false)
      }
    }

    if (sessionId) {
      loadWorkspace()
    }
  }, [sessionId, setSession])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = async (e) => {
    e?.preventDefault()
    if (!inputVal.trim() || isSubmitting) return

    const candidateText = inputVal.trim()
    setInputVal('')
    setIsSubmitting(true)

    const updated = [...messages, { speaker: 'Candidate', content: candidateText, isUser: true }]
    setMessages(updated)
    setExchangeCount((prev) => prev + 1)

    try {
      const token = localStorage.getItem('token')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch('/api/assessment/message', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId,
          text: candidateText
        })
      })
      const data = await res.json()

      if (data.messages && data.messages.length > 0) {
        setMessages((curr) => [...curr, ...data.messages])
      } else {
        // Fallback turn
        const nextTurn = exchangeCount === 0
          ? {
              speaker: 'Marcus Chen (Performance Lead)',
              content: "Customer support tickets are just vocal complainers—less than 3% of our volume. Meta's algorithm is saturated because our ad creative has been running for 6 weeks. Why shouldn't we just test 20 new video hooks on TikTok?"
            }
          : exchangeCount === 1
          ? {
              speaker: 'Elena Vance (CEO)',
              content: "Alright, open the 30-Day Budget tab on your right. Allocate our ₹5,00,000 ceiling across channels and explain your commercial trade-off rationale."
            }
          : {
              speaker: 'Elena Vance (CEO)',
              content: "I'm heading into an emergency board meeting in 15 minutes. Give me your 3-bullet summary of our 30-day turnaround plan and why the board should believe it will work."
            }
        setMessages((curr) => [...curr, nextTurn])
      }
      setIsSubmitting(false)
    } catch (err) {
      console.error('Message failed', err)
      setIsSubmitting(false)
    }
  }

  const handleFinishAssessment = async () => {
    setIsFinishing(true)
    try {
      const token = localStorage.getItem('token')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      await fetch('/api/assessment/evaluate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId })
      }).catch(() => null)

      navigate(`/report/${sessionId}/v2`)
    } catch {
      navigate(`/report/${sessionId}/v2`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide text-slate-400">
          Initializing Lumina Botanicals Simulation Environment...
        </p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden text-slate-200">
      {/* Top Bar */}
      <header className="h-14 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white text-xs">
            P
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              PRISM NEXT · INTERACTIVE ASSESSMENT WORKSPACE
            </span>
            <h1 className="text-sm font-bold text-white truncate max-w-[320px] sm:max-w-md">
              Lumina Botanicals — D2C Growth & Retention Turnaround
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBriefing(!showBriefing)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {showBriefing ? 'Hide Briefing' : 'Scenario Briefing'}
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Turns: {exchangeCount}/5</span>
          </div>

          <button
            onClick={handleFinishAssessment}
            disabled={isFinishing}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all"
          >
            {isFinishing ? 'Generating V2 Report...' : 'Finish & View V2 Report'}
          </button>
        </div>
      </header>

      {/* Briefing Collapsible Banner */}
      {showBriefing && (
        <div className="bg-slate-900 border-b border-indigo-500/30 p-4 text-xs text-slate-300 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
          <div>
            <span className="font-bold text-indigo-400">🏢 Context:</span>
            <p className="mt-1 leading-relaxed">
              Lumina Botanicals is an organic D2C skincare brand in Bangalore. Blended CAC surged by 48% (to ₹1,640) and ROAS fell to 1.15x (break-even is 1.70x).
            </p>
          </div>
          <div>
            <span className="font-bold text-emerald-400">🎯 Your Role & Objective:</span>
            <p className="mt-1 leading-relaxed">
              Associate Growth Marketing Specialist. Audit the paid channels and customer ticket log, diagnose root causes, and reallocate the ₹5,00,000 30-day budget.
            </p>
          </div>
          <div>
            <span className="font-bold text-amber-400">👥 Stakeholders:</span>
            <p className="mt-1 leading-relaxed">
              Elena Vance (Founder & CEO, cautious on burn rate) and Marcus Chen (Performance Lead, eager to scale TikTok).
            </p>
          </div>
        </div>
      )}

      {/* Main Dual-Pane Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Pane (45%): Conversational Simulation Room */}
        <div className="w-full lg:w-[45%] h-1/2 lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/60">
          {/* Room Header */}
          <div className="p-3 bg-slate-900/50 border-b border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Live Strategy Room</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                Elena Vance (CEO) & Marcus Chen (Performance)
              </span>
            </div>
            <span className="text-[11px] text-slate-500">Autonomous Director V2</span>
          </div>

          {/* Transcript Message Feed */}
          <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((msg, index) => {
              const isUser = msg.isUser || msg.speaker === 'Candidate'
              const isElena = String(msg.speaker).includes('Elena')
              return (
                <div
                  key={index}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] font-bold text-slate-400 mb-1 px-1">
                    {msg.speaker || 'Stakeholder'}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-md ${
                      isUser
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : isElena
                        ? 'bg-slate-900 border border-slate-700 text-slate-200 rounded-bl-sm'
                        : 'bg-slate-900/90 border border-indigo-900/40 text-slate-200 rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              )
            })}
            {isSubmitting && (
              <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium p-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                <span>Stakeholders reviewing your response...</span>
              </div>
            )}
          </div>

          {/* Response Composer */}
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-900/70 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <textarea
                rows={2}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="Type your strategic analysis or trade-off recommendation..."
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isSubmitting}
                className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all self-stretch flex items-center justify-center"
              >
                Send
              </button>
            </div>
          </form>
        </div>

        {/* Right Pane (55%): Interactive Work Artifacts */}
        <div className="w-full lg:w-[55%] h-1/2 lg:h-full flex flex-col bg-slate-950">
          {/* Artifact Tab Bar */}
          <div className="p-2 bg-slate-900/70 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
            {(artifacts && artifacts.length > 0 ? artifacts : [
              { artifactId: 'ART-DASH-01', title: 'Paid Media Dashboard', icon: '📊' },
              { artifactId: 'ART-FEEDBACK-02', title: 'Customer Tickets', icon: '💬' },
              { artifactId: 'ART-BUDGET-03', title: '30-Day Budget Modeler', icon: '⚖️' }
            ]).map((art) => {
              const displayLabel = art.artifactId === 'ART-FEEDBACK-02'
                ? 'Customer Tickets'
                : art.artifactId === 'ART-BUDGET-03'
                ? '30-Day Budget Modeler'
                : art.artifactId === 'ART-DASH-01'
                ? 'Paid Media Dashboard'
                : (art.title || art.artifactId)
              return (
                <button
                  key={art.artifactId}
                  onClick={() => setActiveArtifact(art.artifactId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
                    activeArtifactId === art.artifactId
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>{art.icon || '📄'}</span>
                  <span>{displayLabel}</span>
                </button>
              )
            })}
          </div>

          {/* Active Artifact Workspace View */}
          <div className="flex-1 p-6 overflow-y-auto">
            <ArtifactRenderer
              artifact={artifacts.find((a) => a.artifactId === activeArtifactId) || {
                artifactId: activeArtifactId || 'ART-DASH-01',
                type: activeArtifactId || 'ART-DASH-01',
                data: {}
              }}
              sessionId={sessionId}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
