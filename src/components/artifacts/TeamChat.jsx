// src/components/artifacts/TeamChat.jsx — Interactive Team Slack / Chat Stream Primitive
import { useState } from 'react'

export default function TeamChat({ data = {} }) {
  const [activeChannel, setActiveChannel] = useState(data.channels?.[0]?.name || '#growth-war-room')
  const [chatMessage, setChatMessage] = useState('')

  const channels = data.channels || [
    {
      name: '#growth-war-room',
      topic: 'Q3 CAC mitigation & live attribution updates',
      messages: [
        { sender: 'Marcus Chen', time: '10:14 AM', text: "Just saw the Meta CPM spike. We're up to ₹420 CPM in Tier-1 metros.", tag: 'Performance' },
        { sender: 'Elena Vance', time: '10:16 AM', text: "What's driving the bounce rate on the Vitamin C landing page?", tag: 'Executive' },
        { sender: 'Priya Nair', time: '10:19 AM', text: "Drop-off is right at the customer review widget. Lots of mentions of broken pipettes.", tag: 'CX' },
        { sender: 'Marcus Chen', time: '10:22 AM', text: "Can we temporarily suppress the review widget on ad landing pages?", tag: 'Performance' },
        { sender: 'Elena Vance', time: '10:24 AM', text: "Absolutely not. That destroys customer trust. We fix the product issue.", tag: 'Executive' }
      ]
    },
    {
      name: '#customer-escalations',
      topic: 'High priority customer satisfaction & refund logs',
      messages: [
        { sender: 'CS Agent 4', time: '09:30 AM', text: "Ticket volume up 3x for Lumina C Serum order replacements.", tag: 'Support' },
        { sender: 'Devika Pillai', time: '09:45 AM', text: "Replacement gaskets are on priority air shipment.", tag: 'Ops' }
      ]
    }
  ]

  const currentChannel = channels.find((c) => c.name === activeChannel) || channels[0]

  return (
    <div className="h-full flex flex-col md:flex-row gap-3 text-slate-200">
      {/* Channels Sidebar */}
      <div className="w-full md:w-56 bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
        <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider px-2">Channels</span>
        {channels.map((ch) => (
          <button
            key={ch.name}
            onClick={() => setActiveChannel(ch.name)}
            className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeChannel === ch.name
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {ch.name}
          </button>
        ))}
      </div>

      {/* Chat Stream */}
      <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between overflow-hidden">
        <div>
          <div className="border-b border-slate-800 pb-2 mb-3">
            <h4 className="font-bold text-white text-sm">{currentChannel.name}</h4>
            <p className="text-[11px] text-slate-400">{currentChannel.topic}</p>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[360px] pr-2">
            {currentChannel.messages.map((m, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{m.sender}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-indigo-300 font-mono">
                      {m.tag}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">{m.time}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="pt-3 border-t border-slate-800 flex gap-2 mt-3">
          <input
            type="text"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            placeholder={`Message ${currentChannel.name}...`}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => setChatMessage('')}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
