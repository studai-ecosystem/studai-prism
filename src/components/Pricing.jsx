import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { SCORE_VALIDITY_MONTHS } from '../../server/lib/sharedConstants.js'
import PricingCard from './ui/PricingCard.jsx'
import { fetchOffers } from '../api/offers.js'

// The offer explained before anyone pays (P8.1/P8.6). The only amount shown
// is the one already in the product (Payment.jsx and the server config);
// it is a test price pending approval, not a published tariff. The
// professional pack has no defined allowance yet, so it is listed as not
// available rather than given an invented quota or price. Campus pricing is
// agreed per institution and shown as "Custom".
const personalFeatures = [
  'One 30-minute formal assessment in realistic workplace situations',
  'Capability evidence tied to the moments that earned it',
  'Four development missions of your choice, two attempts each, plus one fresh practice challenge',
  'A shareable report that you control',
  `Report valid for ${SCORE_VALIDITY_MONTHS} months; activity window 30 days`,
]

const campusFeatures = [
  'Cohort capability intelligence',
  'Assessment programs for your cohorts',
  'Development interventions linked to capability needs',
  'Growth tracking across comparable reassessments',
  'Completion and sponsored development outcomes',
]

// Row content is descriptive; amounts come from the product config on the
// server and are repeated here only for the one existing price.
const OFFERS = [
  {
    id: 'free',
    name: 'Free first experience',
    get: 'One short practice scene (a few minutes, typed; practice mode), one source-backed observation about your own words',
    allowance: 'One answer and one retry',
    window: 'Kept for one hour unless you save it to an account',
    limits: 'Not a formal assessment; no capability map, report or credential',
    results: 'A practice observation, clearly labelled',
    policy: 'No payment, nothing to recover',
    amount: 'Free',
    status: null,
  },
  {
    id: 'sprint',
    name: 'Personal development sprint',
    get: 'One formal assessment (about 30 minutes, typed; formal mode) with its evidence-backed report, four selected missions (practice mode), one fresh practice challenge',
    allowance: 'Formal assessment ×1 · missions ×4, two attempts each · fresh challenge ×1',
    window: '30 days of activity; your report stays readable afterwards',
    limits: 'Four missions from the reviewed library, not the whole library; reassessment is not included until comparable forms are approved',
    results: 'Results on draft content are provisional and say so',
    policy: 'Recovery and review policy: proposed, pending approval',
    amount: '\u20B9499',
    status: 'Test price, pending approval',
  },
  {
    id: 'professional',
    name: 'Professional preparation pack',
    get: 'A bounded preparation and practice allowance',
    allowance: 'To be defined before sale',
    window: 'To be defined before sale',
    limits: 'Opens only after the allowance is approved',
    results: 'Not applicable yet',
    policy: 'Not applicable yet',
    amount: 'Not yet available',
    status: null,
  },
]

const COLUMNS = [
  ['get', 'What you get'],
  ['allowance', 'Allowance'],
  ['window', 'Window'],
  ['limits', 'Limits'],
  ['results', 'Provisional results'],
  ['policy', 'Recovery / review'],
]

const SERVER_CODES = { free: 'FREE_FIRST_EXPERIENCE', sprint: 'PERSONAL_DEVELOPMENT_SPRINT', professional: 'PROFESSIONAL_PREPARATION_PACK' }
const BLOCKER_COPY = {
  PRICE_NOT_APPROVED: 'price pending finance approval',
  CONTENT_NOT_REVIEWED: 'included missions still under review',
  FORM_NOT_REVIEWED: 'assessment form pending approval',
}

// The server decides whether the sprint can be bought right now (P8.6). The
// descriptive rows stay static; the amount label and purchasability come from
// /api/payment/config when it answers, otherwise the static "pending" copy.
function availabilityLine(serverOffer) {
  if (!serverOffer || serverOffer.purchasable) return null
  const blockers = serverOffer.availability?.blockers || []
  if (!blockers.length) return 'Not yet purchasable'
  return `Not yet purchasable: ${blockers.map((b) => BLOCKER_COPY[b.code] || b.message).join('; ')}`
}

export default function Pricing({ onGetAssessed, onContactSales }) {
  const offers = useQuery({ queryKey: ['public', 'offers'], queryFn: fetchOffers, retry: false, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false })
  const serverOffer = (id) => offers.data?.offers?.find((o) => o.code === SERVER_CODES[id]) || null
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-prism-surface py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">Pricing</p>
          <h2 id="pricing-title" className="text-3xl font-bold leading-tight tracking-tight text-prism-ink md:text-4xl">
            Know exactly what you get before you pay.
          </h2>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm text-prism-ink-muted">
            Start free with a short situation. Pay only if the full package is useful to you: one package, one payment, nothing recurring.
          </p>
        </div>

        <div
          role="region"
          aria-label="Offer comparison table"
          tabIndex={0}
          className="overflow-x-auto rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-prism-accent"
        >
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">Offer comparison: what you get, allowance, window, limits, provisional results and recovery or review policy</caption>
            <thead>
              <tr className="border-b border-prism-border">
                <th scope="col" className="px-4 py-3 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">Offer</th>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} scope="col" className="px-4 py-3 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OFFERS.map((o) => {
                const live = serverOffer(o.id)
                const unavailable = availabilityLine(live)
                return (
                  <tr key={o.id} className="border-b border-prism-border last:border-b-0 align-top" data-testid={`offer-${o.id}`}>
                    <th scope="row" className="px-4 py-4 font-semibold text-prism-ink">
                      <span className="block">{o.name}</span>
                      <span className="mt-1 block text-base tabular-nums text-prism-ink">{o.amount}</span>
                      {o.status && <span className="mt-1 block text-xs font-normal text-prism-ink-muted">{o.status}</span>}
                      {unavailable && <span className="mt-1 block text-xs font-normal text-prism-ink-muted" data-testid={`offer-${o.id}-availability`}>{unavailable}</span>}
                    </th>
                    {COLUMNS.map(([key]) => (
                      <td key={key} className="px-4 py-4 text-prism-ink-muted">{o[key]}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-prism-ink-muted">
          Tax treatment is confirmed at checkout from the server configuration. Prices and policies marked proposed are hypotheses under review, not published terms.{' '}
          <Link to="/try" className="font-medium text-brand-green-ink underline underline-offset-4">Try a short situation</Link> first.
        </p>
        <p className="mt-2 text-xs text-prism-ink-muted" data-testid="offer-privacy">
          Privacy: your answers are processed to produce your own observations and report. Personal practice and preparation stay private to you; an institution sees only what it sponsors and what you choose to share. Unsaved previews are kept for one hour.
        </p>

        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
          <PricingCard
            plan="Personal"
            price="Sprint"
            period="one package, 30 days"
            subtitle="For students and professionals booking directly"
            features={personalFeatures}
            ctaLabel="Take the assessment"
            ctaAction={onGetAssessed}
          />
          <PricingCard
            plan="Campus"
            price="Custom"
            period="per year"
            subtitle="For colleges and universities"
            features={campusFeatures}
            ctaLabel="Talk to us"
            ctaAction={onContactSales}
            featured
          />
        </div>

        <p className="mt-6 text-center text-xs text-prism-ink-muted">
          Campus pricing is agreed with your institution. Students keep control of what they share beyond the assessments their institution sponsors.
        </p>
      </div>
    </section>
  )
}
