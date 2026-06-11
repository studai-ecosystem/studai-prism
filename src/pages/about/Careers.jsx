import { useEffect, useState } from 'react'
import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'

function ApplyForm({ job, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', resumeUrl: '', message: '' })
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [error, setError] = useState('')

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('submitting')
    setError('')
    try {
      const res = await fetch(`/api/content/careers/${job.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to submit application.')
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-xl font-bold text-[#0A0D14]">Apply: {job.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8A8FA0] hover:text-[#0A0D14] text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-[#8A8FA0] text-sm mb-5">
          {job.location} · {job.type} · {job.stack}
        </p>

        {status === 'done' ? (
          <div className="text-center py-6">
            <p className="text-lg font-semibold text-[#0A0D14] mb-2">Application received</p>
            <p className="text-[#5A5F6E] mb-6">Thanks, {form.name.split(' ')[0]}. We’ll be in touch.</p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg font-bold text-sm text-[#0A0D14] bg-gold hover:brightness-105 transition"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#0A0D14] mb-1">Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={update('name')}
                className="w-full border border-[#E2E4EA] rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#0A0D14] mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={update('email')}
                className="w-full border border-[#E2E4EA] rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#0A0D14] mb-1">
                Resume / portfolio link <span className="font-normal text-[#8A8FA0]">(optional)</span>
              </label>
              <input
                type="url"
                value={form.resumeUrl}
                onChange={update('resumeUrl')}
                placeholder="https://"
                className="w-full border border-[#E2E4EA] rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#0A0D14] mb-1">
                Why this role? <span className="font-normal text-[#8A8FA0]">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={form.message}
                onChange={update('message')}
                className="w-full border border-[#E2E4EA] rounded-lg px-3 py-2 focus:outline-none focus:border-gold resize-none"
              />
            </div>

            {status === 'error' && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full px-5 py-2.5 rounded-lg font-bold text-sm text-[#0A0D14] bg-gold hover:brightness-105 transition disabled:opacity-60"
            >
              {status === 'submitting' ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function Careers() {
  const [roles, setRoles] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [activeJob, setActiveJob] = useState(null)

  useEffect(() => {
    let active = true
    fetch('/api/content/careers')
      .then((res) => {
        if (!res.ok) throw new Error('Failed')
        return res.json()
      })
      .then((data) => {
        if (!active) return
        setRoles(Array.isArray(data.jobs) ? data.jobs : [])
        setStatus('ready')
      })
      .catch(() => active && setStatus('error'))
    return () => {
      active = false
    }
  }, [])

  return (
    <PageLayout>
      <section className="py-20 px-6 max-w-6xl mx-auto">
        <PageHeading
          title="Careers at StudAI One"
          subtitle="Join the team building India's skills infrastructure"
        />
      </section>

      {/* Open roles */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        {status === 'loading' && (
          <p className="text-center text-[#8A8FA0]">Loading open roles…</p>
        )}
        {status === 'error' && (
          <p className="text-center text-[#8A8FA0]">
            Couldn’t load roles right now. Please try again later.
          </p>
        )}
        {status === 'ready' && roles.length === 0 && (
          <p className="text-center text-[#8A8FA0]">No open roles right now — check back soon.</p>
        )}
        {status === 'ready' && roles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {roles.map((role) => (
              <div
                key={role.id}
                className="bg-white rounded-2xl shadow-sm p-6 border-l-4 border-gold flex flex-col"
              >
                <h3 className="text-xl font-bold text-[#0A0D14] mb-2">{role.title}</h3>
                <p className="text-[#8A8FA0] mb-3">
                  {role.location} · {role.type} · {role.stack}
                </p>
                {role.description && (
                  <p className="text-[#5A5F6E] leading-relaxed mb-6">{role.description}</p>
                )}
                <button
                  type="button"
                  onClick={() => setActiveJob(role)}
                  className="mt-auto inline-block self-start px-5 py-2 rounded-lg font-bold text-sm text-[#0A0D14] bg-gold hover:brightness-105 transition"
                >
                  Apply →
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Open application */}
      <section className="py-12 pb-20 px-6 max-w-6xl mx-auto">
        <p className="text-center text-[#5A5F6E] text-lg">
          Don't see your role? Write to us at{' '}
          <a
            href="mailto:careers@studai.one"
            className="text-gold font-semibold hover:underline"
          >
            careers@studai.one
          </a>
        </p>
      </section>

      {activeJob && <ApplyForm job={activeJob} onClose={() => setActiveJob(null)} />}
    </PageLayout>
  )
}
