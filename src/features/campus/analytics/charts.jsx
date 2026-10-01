// Recharts visuals for campus analytics, loaded lazily (C10.05) so the chart
// library is only fetched on the analytics pages. Charts are decorative
// duplicates of the table next to them (aria-hidden); axes start at zero and
// every bar is a count of students, never a percentage or score.
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'

const BUCKET_COLOURS = {
  INSUFFICIENT: 'var(--prism-border-strong)',
  EARLY: 'var(--prism-chart-early)',
  DEVELOPING: 'var(--prism-accent)',
  DEMONSTRATED: 'var(--prism-accent-strong)',
  STRONG: 'var(--prism-ink)',
}

const legendText = (value) => <span style={{ color: 'var(--prism-ink)' }}>{value}</span>
const AXIS_TICK = { fontSize: 12, fill: 'var(--prism-ink)' }

export function DistributionBars({ rows, bucketLabels, buckets }) {
  const data = rows.map((r) => ({ name: r.name, ...r.buckets }))
  return (
    <div aria-hidden="true" className="h-72 w-full overflow-hidden" data-testid="distribution-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} domain={[0, 'dataMax']} tick={AXIS_TICK} />
          <YAxis type="category" dataKey="name" width={110} tick={AXIS_TICK} />
          <Tooltip />
          <Legend formatter={legendText} />
          {buckets.map((b) => <Bar key={b} dataKey={b} name={bucketLabels[b]} stackId="a" fill={BUCKET_COLOURS[b]} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function OutcomeBars({ rows }) {
  const data = rows.map((r) => ({ name: r.name, Higher: r.higher, Same: r.same, Lower: r.lower }))
  return (
    <div aria-hidden="true" className="h-64 w-full overflow-hidden" data-testid="outcome-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} />
          <YAxis allowDecimals={false} domain={[0, 'dataMax']} tick={AXIS_TICK} />
          <Tooltip />
          <Legend formatter={legendText} />
          <Bar dataKey="Higher" fill="var(--prism-accent-strong)" isAnimationActive={false} />
          <Bar dataKey="Same" fill="var(--prism-chart-early)" isAnimationActive={false} />
          <Bar dataKey="Lower" fill="var(--prism-border-strong)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default { DistributionBars, OutcomeBars }
