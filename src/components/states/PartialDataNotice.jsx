import { Callout } from '../ui/Notice.jsx'

// Shown when some of a page's data is unavailable: what is shown is real, and
// what is missing is named — never filled in (spec §40 "Partial evidence").
export function PartialDataNotice({ title = 'Some information is not available yet', missing = [], children }) {
  return (
    <Callout tone="insufficient" title={title} className="mb-6">
      {children || 'What you see below is based only on the information we have.'}
      {missing.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {missing.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
    </Callout>
  )
}

export default PartialDataNotice
