import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { login, register, isAuthenticated } from '../lib/session.js'
import PrismLogo from '../components/ui/PrismLogo.jsx'

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduated', 'Working Professional']

function Field({ label, type = 'text', value, onChange, placeholder, required = true, autoComplete }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-sans text-xs font-semibold text-[var(--color-ink)] tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="w-full px-4 py-3 rounded-xl bg-[var(--color-paper)] border border-[var(--color-line)] font-sans text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all"
      />
    </label>
  )
}

export default function Auth() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isRegister = pathname !== '/login'

  const [form, setForm] = useState({ name: '', email: '', college: '', year: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Reset error when switching tabs
  useEffect(() => setError(null), [pathname])

  // Already signed in? There is nothing to do here — continue into the
  // funnel instead of asking the user to log in again (every "Get Assessed"
  // entry point funnels through this guard).
  useEffect(() => {
    if (isAuthenticated()) navigate('/payment', { replace: true })
  }, [navigate])

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)

    if (!form.email.trim() || !form.password.trim()) {
      setError('Email and password are required.')
      return
    }
    if (isRegister && (!form.name.trim() || !form.college.trim() || !form.year)) {
      setError('Please fill in all fields to register.')
      return
    }

    setSubmitting(true)
    const action = isRegister
      ? register({
          name: form.name || form.email.split('@')[0],
          email: form.email,
          college: form.college,
          year: form.year,
          password: form.password,
        })
      : login({ email: form.email, password: form.password })

    action
      .then(() => {
        // Paid flow: send the user to checkout. Payment mints the sessionId
        // (via Razorpay verify or the dev-session endpoint) and then continues
        // into identity verification + proctoring.
        navigate('/payment')
      })
      .catch((err) => setError(err.message || 'Something went wrong. Please try again.'))
      .finally(() => setSubmitting(false))
  }

  return (
    <div className="min-h-screen bg-white text-[var(--color-ink)] flex flex-col">
      {/* Minimal header */}
      <header className="shrink-0 flex items-center px-6 h-16 border-b border-[var(--color-line)]">
        <Link to="/" aria-label="Prism home">
          <PrismLogo size={32} />
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent)]/10 mb-4">
              <ShieldCheck size={22} className="text-[var(--color-accent)]" />
            </div>
            <h1 className="font-serif text-3xl text-[var(--color-ink)] mb-1">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="font-sans text-sm text-[var(--color-ink-muted)]">
              {isRegister ? 'Start your Prism assessment' : 'Sign in to continue'}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex p-1 rounded-xl bg-[var(--color-paper)] border border-[var(--color-line)] mb-6">
            <Link
              to="/login"
              className={`flex-1 text-center py-2 rounded-lg font-sans text-sm font-semibold transition-colors ${
                !isRegister ? 'bg-white text-[var(--color-ink)] shadow-sm' : 'text-[var(--color-ink-muted)]'
              }`}
            >
              Login
            </Link>
            <Link
              to="/register"
              className={`flex-1 text-center py-2 rounded-lg font-sans text-sm font-semibold transition-colors ${
                isRegister ? 'bg-white text-[var(--color-ink)] shadow-sm' : 'text-[var(--color-ink-muted)]'
              }`}
            >
              Register
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <AnimatePresence mode="popLayout">
              {isRegister && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Field label="Full Name" value={form.name} onChange={update('name')} placeholder="Aditi Sharma" autoComplete="name" />
                </motion.div>
              )}
            </AnimatePresence>

            <Field label="Email" type="email" value={form.email} onChange={update('email')} placeholder="you@college.edu" autoComplete="email" />

            <AnimatePresence mode="popLayout">
              {isRegister && (
                <motion.div
                  key="reg-extra"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-4"
                >
                  <Field label="College" value={form.college} onChange={update('college')} placeholder="IIT Madras" autoComplete="organization" />
                  <label className="flex flex-col gap-1.5">
                    <span className="font-sans text-xs font-semibold text-[var(--color-ink)] tracking-wide">Year of Study</span>
                    <select
                      value={form.year}
                      onChange={update('year')}
                      className="w-full px-4 py-3 rounded-xl bg-[var(--color-paper)] border border-[var(--color-line)] font-sans text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all"
                    >
                      <option value="" disabled>Select year</option>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            <Field label="Password" type="password" value={form.password} onChange={update('password')} placeholder="••••••••" autoComplete={isRegister ? 'new-password' : 'current-password'} />

            {error && (
              <p className="font-sans text-sm text-[var(--color-danger)] text-center">{error}</p>
            )}

            <motion.button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full py-3.5 rounded-xl bg-[var(--color-ink)] font-sans font-semibold text-sm text-[var(--color-paper)] tracking-wide hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              whileHover={submitting ? {} : { scale: 1.01 }}
              whileTap={submitting ? {} : { scale: 0.98 }}
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {isRegister ? 'Create account → ' : 'Sign in → '}
            </motion.button>
          </form>

          <p className="text-center font-sans text-xs text-[var(--color-ink-muted)] mt-6">
            {isRegister ? 'Already have an account? ' : "Don't have an account? "}
            <Link to={isRegister ? '/login' : '/register'} className="text-[var(--color-accent)] font-semibold hover:underline">
              {isRegister ? 'Login' : 'Register'}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
