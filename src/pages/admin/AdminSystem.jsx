import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Toolbar, Pill, when, mono } from './ui.jsx'

// ── /admin/system — integration health, models, job monitor (Phase 5) ────────
// Read-only panels. Booleans and latencies only — secrets never leave the env.

function HealthRow({ label, ok, detail }) {
  return (
    <div className="py-2 border-b border-[var(--color-line)] last:border-0 flex items-center justify-between gap-3">
      <span className="font-sans text-sm text-[var(--color-ink)]">{label}</span>
      <span className="flex items-center gap-2">
        {detail && <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{detail}</span>}
        <Pill tone={ok ? 'ok' : 'warn'}>{ok ? 'configured' : 'not configured'}</Pill>
      </span>
    </div>
  )
}

export default function AdminSystem() {
  const [health, setHealth] = useState(null)
  const [models, setModels] = useState(null)
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [h, m, j] = await Promise.all([
        adminFetch('/api/admin/system/health'),
        adminFetch('/api/admin/system/models'),
        adminFetch('/api/admin/system/jobs'),
      ])
      setHealth(h)
      setModels(m)
      setJobs(j)
    } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 max-w-5xl">
      <PageHeader title="System & integrations" subtitle="Configuration presence and health only — no secret ever renders here." />
      <ErrorNotice error={error} />
      <Toolbar onRefresh={load} />

      {health && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Integrations</h2>
            <HealthRow label="PostgreSQL" ok={health.postgres.ok} detail={health.postgres.latencyMs != null ? `${health.postgres.latencyMs}ms` : null} />
            <HealthRow label="Amazon Bedrock" ok={health.bedrock.configured} detail={`${health.bedrock.region} · ${health.bedrock.model}`} />
            <HealthRow label="Speech-to-text (Bedrock)" ok={health.speechToText.configured} detail={health.speechToText.model} />
            <HealthRow label="Text-to-speech (Polly)" ok={health.textToSpeech.configured} />
            <HealthRow label="Email (SMTP)" ok={health.email.configured} />
            <HealthRow label="Razorpay" ok={health.razorpay.configured} detail={health.razorpay.dummyMode ? 'dummy mode ON' : null} />
            <HealthRow label="Credential signing" ok={health.credentialSigning.configured} detail={health.credentialSigning.keyId} />
          </section>

          <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Application</h2>
            <dl className="font-sans text-sm text-[var(--color-ink)] space-y-1">
              <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Environment</dt><dd className="font-mono text-[12px]">{health.application.environment}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Node</dt><dd className="font-mono text-[12px]">{health.application.node}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Uptime</dt><dd className="font-mono text-[12px] tabular-nums">{Math.floor(health.application.uptimeSeconds / 60)}m</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Judge drift</dt><dd className={`font-mono text-[12px] ${health.bedrock.driftStatus === 'anchored' ? '' : 'text-[var(--color-danger)]'}`}>{health.bedrock.driftStatus}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Data dir</dt><dd className="font-mono text-[12px]">{health.dataDir.path}</dd></div>
              <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Calibration jobs</dt><dd className="font-mono text-[11px]">{health.calibrationJobs.lastRun ? `${health.calibrationJobs.lastRun.run_type} · ${when(health.calibrationJobs.lastRun.created_at)}` : 'none yet'}</dd></div>
            </dl>
          </section>
        </div>
      )}

      {models && (
        <section className="mt-4 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">AI models</h2>
          <p className="font-sans text-sm text-[var(--color-ink)]">
            Judge model <span className="font-mono text-[12px]">{models.live.judgeModel || '—'}</span> ·
            anchored <span className="font-mono text-[12px]">{models.live.anchoredModel || '—'}</span> ·
            {' '}<Pill tone={models.live.driftStatus === 'anchored' ? 'ok' : 'danger'}>{models.live.driftStatus}</Pill> ·
            {' '}{models.live.judgeSamples} judge samples
          </p>
          {models.registry.length > 0 && (
            <div className="mt-2">
              {models.registry.map((m) => (
                <p key={m.model_id} className="font-mono text-[11px] text-[var(--color-ink-muted)] py-0.5">
                  {m.provider}/{m.deployment} · {m.purpose || '—'} ·
                  in ${m.cost_per_mtok_in ?? '?'}/1M · out ${m.cost_per_mtok_out ?? '?'}/1M
                  {m.fallback ? ` · fallback ${m.fallback}` : ''}
                </p>
              ))}
            </div>
          )}
          <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">{models.note}</p>
        </section>
      )}

      {jobs && (
        <section className="mt-4 mb-10 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Background work</h2>
          <p className="font-mono text-[10px] text-[var(--color-ink-muted)] mb-2">{jobs.runtime}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-mono text-[10px] uppercase text-[var(--color-ink-muted)] mb-1">Calibration runs</h3>
              {jobs.calibrationRuns.length === 0 ? (
                <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">None recorded.</p>
              ) : (
                jobs.calibrationRuns.slice(0, 10).map((r) => (
                  <p key={r.run_id} className="font-mono text-[11px] text-[var(--color-ink)] py-0.5">
                    {r.run_type} · {mono(r.run_id, 8)} ·{' '}
                    <Pill tone={r.applied ? 'ok' : r.rejected ? 'danger' : r.frozen ? 'info' : 'muted'}>
                      {r.applied ? 'applied' : r.rejected ? 'rejected' : r.frozen ? 'frozen' : (r.job_status || 'draft')}
                    </Pill>{' '}
                    {when(r.created_at)}
                  </p>
                ))
              )}
            </div>
            <div>
              <h3 className="font-mono text-[10px] uppercase text-[var(--color-ink-muted)] mb-1">Recent exports</h3>
              {jobs.recentExports.length === 0 ? (
                <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">None.</p>
              ) : (
                jobs.recentExports.slice(0, 10).map((e) => (
                  <p key={e.export_id} className="font-mono text-[11px] text-[var(--color-ink)] py-0.5">
                    {e.entity_type} · {e.row_count} rows · {e.by} · {when(e.created_at)}
                  </p>
                ))
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
