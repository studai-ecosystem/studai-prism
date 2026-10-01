import { SCORE_VALIDITY_MONTHS } from '../../server/lib/sharedConstants.js'
import PricingCard from './ui/PricingCard.jsx'

// Two ways in. The only price shown is the one already in the product
// (Payment.jsx and the admin margin model); campus pricing is agreed per
// institution and shown as "Custom".
const personalFeatures = [
  'One 30-minute assessment in realistic workplace situations',
  'Capability evidence tied to the moments that earned it',
  'Development insight: where to focus next',
  'A shareable report that you control',
  `Valid for ${SCORE_VALIDITY_MONTHS} months`,
]

const campusFeatures = [
  'Cohort capability intelligence',
  'Assessment programs for your cohorts',
  'Development interventions linked to capability needs',
  'Growth tracking across comparable reassessments',
  'Placement-readiness insights',
]

export default function Pricing({ onGetAssessed, onContactSales }) {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-prism-surface py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">Pricing</p>
          <h2 id="pricing-title" className="text-3xl font-bold leading-tight tracking-tight text-prism-ink md:text-4xl">
            Simple, transparent pricing.
          </h2>
        </div>

        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
          <PricingCard
            plan="Personal"
            price={'\u20B9499'}
            period="per assessment"
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