// src/components/artifacts/MeetingTranscript.jsx — Interactive Meeting Transcript Primitive
import { useState } from 'react'

export default function MeetingTranscript({ data = {} }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [bookmarked, setBookmarked] = useState({})

  const exchanges = data.exchanges || [
    { id: 1, speaker: 'Elena Vance (CEO)', time: '00:02', text: "Let's cut to the chase. Our 30-day burn on paid channels is unsustainable. We've brought in ₹13.8L in revenue on ₹10L spend. What happened to our 2.2x target?" },
    { id: 2, speaker: 'Marcus Chen (Performance)', time: '00:45', text: "The platform algorithms punished us when negative comments spiked on the video ads. The TikTok algorithm downranks ad creative if the negative sentiment ratio crosses 12% in the comments section." },
    { id: 3, speaker: 'Devika Pillai (Operations)', time: '01:30', text: "The negative sentiment was 100% justified. The dropper caps from the new supplier in Pune leaked in transit during high-temperature warehouse storage." },
    { id: 4, speaker: 'Elena Vance (CEO)', time: '02:15', text: "So our growth problem is fundamentally an operational defect that leaked into our advertising feedback loops. Candidate, what is your take on how we sequence the fix?" },
  ]

  const filtered = exchanges.filter((e) =>
    e.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.speaker.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleBookmark = (id) => {
    setBookmarked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-base text-white">{data.title || 'Executive Debrief Transcript'}</h3>
          <p className="text-xs text-slate-400">Verbatim transcript of the cross-functional leadership emergency call</p>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search transcript dialog..."
          className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`p-4 rounded-xl border transition-all ${
              bookmarked[item.id]
                ? 'bg-indigo-950/30 border-indigo-500/50'
                : 'bg-slate-950/70 border-slate-800/80'
            }`}
          >
            <div className="flex justify-between items-center text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-indigo-300">{item.speaker}</span>
                <span className="text-[10px] font-mono text-slate-500">{item.time}</span>
              </div>
              <button
                onClick={() => toggleBookmark(item.id)}
                className="text-xs text-slate-400 hover:text-amber-400"
              >
                {bookmarked[item.id] ? '★ Bookmarked' : '☆ Bookmark'}
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
