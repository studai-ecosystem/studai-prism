// src/components/artifacts/EmailThread.jsx — Interactive Corporate Email Thread Primitive
import { useState } from 'react'

export default function EmailThread({ data = {} }) {
  const [activeThreadId, setActiveThreadId] = useState(data.threads?.[0]?.id || 'TH-01')
  const [replyText, setReplyText] = useState('')
  const [draftSent, setDraftSent] = useState(false)

  const threads = data.threads || [
    {
      id: 'TH-01',
      subject: 'URGENT: Q3 ROAS Alert & Channel Spend Realignment',
      sender: 'Elena Vance (CEO)',
      senderEmail: 'elena@luminabotanicals.com',
      date: 'Today, 08:42 AM',
      unread: true,
      messages: [
        {
          id: 'M-01',
          sender: 'Elena Vance (CEO)',
          senderEmail: 'elena@luminabotanicals.com',
          avatar: 'EV',
          time: '08:42 AM',
          content: "Team, I just reviewed yesterday's blended attribution. We cannot continue burning cash at ₹1,640 CAC while unit margins are compressed. Marcus wants to keep pouring budget into TikTok Spark ads, but customer complaints regarding the new dropper bottle are accelerating. Let's make sure our decisions are grounded in actual data before the board meeting tomorrow.",
          attachments: [{ name: 'Q3_Attribution_Summary.pdf', size: '2.4 MB' }]
        },
        {
          id: 'M-02',
          sender: 'Marcus Chen (Performance Lead)',
          senderEmail: 'marcus.c@luminabotanicals.com',
          avatar: 'MC',
          time: '09:05 AM',
          content: "Elena, the top-of-funnel CPMs on TikTok are 40% lower than Meta right now. The creative fatigue on Instagram is real. If we turn off TikTok, our volume falls off a cliff. What we need is a fresh influencer batch, not a budget freeze.",
          attachments: []
        }
      ]
    },
    {
      id: 'TH-02',
      subject: 'Warehouse & Batch B-409 QA Inspection Report',
      sender: 'Devika Pillai (Operations)',
      senderEmail: 'devika@luminabotanicals.com',
      date: 'Yesterday, 04:15 PM',
      unread: false,
      messages: [
        {
          id: 'M-03',
          sender: 'Devika Pillai (Operations)',
          senderEmail: 'devika@luminabotanicals.com',
          avatar: 'DP',
          time: 'Yesterday, 04:15 PM',
          content: "Heads up: Batch B-409 dropper pipettes had an uncalibrated seal gasket from the vendor. We estimate approximately 1,200 bottles shipped before the line was halted. Replacement caps are arriving on Friday.",
          attachments: [{ name: 'Vendor_Defect_Notice.pdf', size: '890 KB' }]
        }
      ]
    }
  ]

  const currentThread = threads.find((t) => t.id === activeThreadId) || threads[0]

  const handleSendReply = (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    setDraftSent(true)
    setTimeout(() => {
      setDraftSent(false)
      setReplyText('')
    }, 2500)
  }

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 text-slate-200">
      {/* Sidebar: Thread List */}
      <div className="w-full md:w-1/3 flex flex-col gap-2 rounded-xl bg-slate-900/90 border border-slate-800 p-3 overflow-y-auto">
        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 px-2 py-1">
          Inbox ({threads.length})
        </span>
        {threads.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveThreadId(t.id)}
            className={`text-left p-3 rounded-xl transition-all border ${
              activeThreadId === t.id
                ? 'bg-indigo-600/20 border-indigo-500/50 shadow-sm'
                : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white truncate">{t.sender}</span>
              <span className="text-[10px] text-slate-400">{t.date}</span>
            </div>
            <p className="text-xs font-semibold text-slate-200 truncate mt-1">{t.subject}</p>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {t.messages[t.messages.length - 1]?.content}
            </p>
          </button>
        ))}
      </div>

      {/* Main Thread Content */}
      <div className="flex-1 flex flex-col rounded-xl bg-slate-900/90 border border-slate-800 p-4 overflow-y-auto space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="font-bold text-base text-white">{currentThread.subject}</h3>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
            <span>Thread Participants: {currentThread.sender}, Candidate</span>
            <span className="font-mono text-[10px] text-slate-500">{currentThread.id}</span>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-4 flex-1">
          {currentThread.messages.map((m) => (
            <div key={m.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-700 font-bold text-xs flex items-center justify-center text-white">
                    {m.avatar || 'U'}
                  </div>
                  <div>
                    <span className="font-bold text-xs text-white block">{m.sender}</span>
                    <span className="text-[10px] text-slate-400">{m.senderEmail}</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500">{m.time}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{m.content}</p>

              {m.attachments?.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-2">
                  {m.attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300 flex items-center gap-1.5"
                    >
                      <span>📎</span>
                      <span className="font-medium">{att.name}</span>
                      <span className="text-[9px] text-slate-500">({att.size})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Reply Composer */}
        <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-800 space-y-2">
          <span className="text-xs font-semibold text-slate-400 block">Draft Quick Executive Response:</span>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your strategic response or proposed trade-offs..."
            rows={3}
            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex justify-between items-center">
            {draftSent ? (
              <span className="text-xs font-bold text-emerald-400 animate-pulse">
                ✓ Response drafted & recorded into session evidence
              </span>
            ) : <span />}
            <button
              type="submit"
              disabled={!replyText.trim()}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition-colors"
            >
              Draft Email Reply
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
