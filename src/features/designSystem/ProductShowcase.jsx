// /design-system, product components: capability, evidence, mission, states,
// charts and assessment surfaces, each in light, dark, narrow, Tamil,
// Devanagari and long-text settings. Everything here is sample content for
// reading the system; it is labelled as such and never reaches a product page.
import { CapabilityCard } from '../../components/capability/CapabilityCard.jsx'
import { CapabilityLevelBadge } from '../../components/capability/CapabilityLevelBadge.jsx'
import { EvidenceSufficiencyBadge } from '../../components/evidence/EvidenceSufficiencyBadge.jsx'
import { EvidenceCard } from '../../components/evidence/EvidenceCard.jsx'
import { ObservedBehaviorCard } from '../../components/evidence/ObservedBehaviorCard.jsx'
import { MissionCard } from '../../components/missions/MissionCard.jsx'
import { PracticeLabel } from '../../components/missions/PracticeLabel.jsx'
import { InsufficientEvidenceState } from '../../components/states/InsufficientEvidenceState.jsx'
import { PartialDataNotice } from '../../components/states/PartialDataNotice.jsx'
import { ExpiredEntitlementState } from '../../components/states/ExpiredEntitlementState.jsx'
import { ChartFrame } from '../../components/charts/ChartFrame.jsx'
import { ConsentScopePanel } from '../../components/campus/ConsentScopePanel.jsx'
import { PrivacyScopeBadge } from '../../components/campus/PrivacyScopeBadge.jsx'
import { SponsoredByCard } from '../../components/campus/SponsoredByCard.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Input } from '../../components/ui/FormControls.jsx'
import PrismLogo from '../../components/ui/PrismLogo.jsx'

const h3 = 'mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-prism-ink-subtle first:mt-0'

const CAP = {
  id: 'ds-1', name: 'Structured reasoning', definition: 'Breaks a problem into parts and says what each part depends on.', layer: 'PRIMARY',
  level: { band: 'DEVELOPING', label: 'Developing' }, status: 'PROVISIONAL', statusReasons: ['RULES_NOT_APPROVED'], developmentPriority: true,
  evidenceSummary: { text: 'Sample: based on three observed responses.', status: 'PROVISIONAL', evidenceIds: [] },
}
const CAP_NONE = {
  id: 'ds-2', name: 'Stakeholder communication', definition: 'Adjusts what is said to what the other person needs.', layer: 'PRIMARY', level: null,
  status: 'INSUFFICIENT_EVIDENCE', statusReasons: ['NO_EVIDENCE'], evidenceSummary: { text: 'Sample: no completed assessment has measured this yet.', status: 'INSUFFICIENT', evidenceIds: [] },
}
const CAP_LONG = {
  ...CAP, id: 'ds-3',
  name: 'Cross-functional stakeholder alignment under conflicting priorities and incomplete information',
  definition: 'A deliberately long definition that keeps going to show that a card wraps its text instead of overflowing or clipping: Supercalifragilisticexpialidocious_unbroken_token_that_must_wrap_somewhere.',
}
const CAP_TAMIL = { ...CAP, id: 'ds-4', name: 'ஒவ்வொரு மதிப்பெண்ணும் சான்றுடன்', definition: 'சான்று அடிப்படையிலான சிந்தனை: ஒவ்வொரு முடிவும் அதன் ஆதாரத்துடன் இணைக்கப்படுகிறது.' }
const CAP_HINDI = { ...CAP, id: 'ds-5', name: 'प्रमाण आधारित तर्क', definition: 'हर निष्कर्ष अपने प्रमाण से जुड़ा होता है और बताता है कि वह किस पर निर्भर है।' }

const EVIDENCE = {
  kind: 'FORMAL', evidenceStatus: 'PROVISIONAL', capability: { name: 'Structured reasoning' }, assessmentTitle: 'Sample workplace simulation',
  candidateAction: { quote: 'Sample: before I choose, I need to know which feature the client revenue depends on.', turn: 3 },
  observedBehavior: 'Asked for the missing number before committing to an option.',
  rubricAnchor: { criteria: 'Names what is unknown and asks for it before acting.' }, provenance: { source: 'CONVERSATION', turn: 3 },
}

function Frame({ label, className = '', style, children }) {
  return (
    <figure className={`min-w-0 rounded-[var(--prism-radius-lg)] border border-prism-border p-4 ${className}`} style={style}>
      <figcaption className="mb-3 font-mono text-xs uppercase tracking-widest text-prism-ink-subtle">{label}</figcaption>
      {children}
    </figure>
  )
}

function BarSample() {
  const rows = [['Early evidence', 3], ['Developing', 8], ['Demonstrated', 5]]
  return (
    <ul className="space-y-2" aria-hidden="true">
      {rows.map(([name, n]) => (
        <li key={name} className="flex items-center gap-3 text-xs text-prism-ink-muted">
          <span className="w-28 shrink-0">{name}</span>
          <span className="h-3 rounded-sm bg-prism-accent" style={{ width: `${n * 12}px` }} />
          <span className="tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  )
}

export default function ProductShowcase() {
  return (
    <div>
      <p className="mb-4 max-w-prose text-sm text-prism-ink-muted">
        Sample content for reading the system. Every level is a described level with its evidence status beside it; no
        number stands in for evidence, and a capability without enough evidence says so.
      </p>

      <h3 className={h3}>Capability level and evidence sufficiency</h3>
      <div className="flex flex-wrap gap-2">
        {['EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG'].map((band) => <CapabilityLevelBadge key={band} level={{ band }} />)}
        <CapabilityLevelBadge level={{ band: 'DEVELOPING', label: 'Developing' }} provisional />
        <CapabilityLevelBadge level={null} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <EvidenceSufficiencyBadge status="SUFFICIENT" />
        <EvidenceSufficiencyBadge status="PROVISIONAL" reasons={['RULES_NOT_APPROVED']} />
        <EvidenceSufficiencyBadge status="INSUFFICIENT_EVIDENCE" reasons={['NO_EVIDENCE']} />
      </div>

      <h3 className={h3}>Capability cards</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <CapabilityCard cap={CAP} to="/design-system" headingLevel={4} />
        <CapabilityCard cap={CAP_NONE} to="/design-system" headingLevel={4} />
      </div>

      <h3 className={h3}>Evidence</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <EvidenceCard item={EVIDENCE} headingLevel={4} dateLabel="Sample date" />
        <EvidenceCard item={{ ...EVIDENCE, kind: 'PRACTICE', candidateAction: { quote: 'Sample practice reply.', turn: 1 } }} headingLevel={4} dateLabel="Sample date" />
      </div>
      <div className="mt-4 max-w-xl">
        <ObservedBehaviorCard behavior="Sample: asked for the missing number before committing." quote="Sample: what did usage look like last term?" />
      </div>

      <h3 className={h3}>Practice is always labelled</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <MissionCard mission={{ title: 'Weigh two options out loud', targetCapabilityName: 'Structured reasoning', estimatedMinutes: 10 }} to="/design-system" headingLevel={4} />
        <div className="flex flex-wrap items-center gap-3"><PracticeLabel /><PracticeLabel variant="band" /></div>
      </div>

      <h3 className={h3}>States</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <InsufficientEvidenceState headingLevel={4} reasons={['NO_EVIDENCE']} />
        <ExpiredEntitlementState />
      </div>
      <div className="mt-4 max-w-xl"><PartialDataNotice missing={['Growth comparison', 'Reassessment date']} /></div>

      <h3 className={h3}>Charts: frame, honest states and a table equivalent</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <ChartFrame title="Students by level" description="Sample counts, not percentages." n={16} table={<table className="w-full text-left text-xs"><caption className="sr-only">Students by level</caption><thead><tr><th scope="col">Level</th><th scope="col">Students</th></tr></thead><tbody><tr><td>Early evidence</td><td>3</td></tr><tr><td>Developing</td><td>8</td></tr><tr><td>Demonstrated</td><td>5</td></tr></tbody></table>}><BarSample /></ChartFrame>
        <ChartFrame title="Nothing yet" status="empty" emptyText="Nothing to chart yet." />
        <ChartFrame title="Small group" status="insufficient" />
      </div>

      <h3 className={h3}>Campus and assessment surfaces</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <SponsoredByCard organizationName="Synthetic University" />
          <PrivacyScopeBadge workspace={{ type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationName: 'Synthetic University' }} />
        </div>
        <ConsentScopePanel organizationName="Synthetic University" headingLevel={4} />
      </div>

      <h3 className={h3}>The same components in other settings</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <Frame label="Dark (assessment theme)" className="theme-assessment prism-app bg-prism-canvas text-prism-ink">
          <div className="mb-3 flex items-center gap-3"><PrismLogo variant="lockup" tone="reverse" width={160} /></div>
          <CapabilityCard cap={CAP} to="/design-system" headingLevel={4} />
          <div className="mt-3 flex gap-2"><Button>Primary</Button><Button variant="secondary">Secondary</Button></div>
        </Frame>
        <Frame label="Narrow (390 px column)" style={{ maxWidth: 390 }}>
          <CapabilityCard cap={CAP_NONE} to="/design-system" headingLevel={4} />
          <div className="mt-3"><MissionCard mission={{ title: 'Weigh two options out loud', estimatedMinutes: 10 }} to="/design-system" headingLevel={4} /></div>
        </Frame>
        <Frame label="Tamil"><CapabilityCard cap={CAP_TAMIL} to="/design-system" headingLevel={4} /></Frame>
        <Frame label="Devanagari"><CapabilityCard cap={CAP_HINDI} to="/design-system" headingLevel={4} /></Frame>
        <Frame label="Long text and an unbroken token" className="lg:col-span-2"><CapabilityCard cap={CAP_LONG} to="/design-system" headingLevel={4} /></Frame>
        <Frame label="Keyboard focus: press Tab to see the ring on every control" className="lg:col-span-2">
          <div className="flex flex-wrap items-end gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Input label="A text field" placeholder="Focus me" className="w-56" />
            <a href="#top" className="text-sm font-medium text-prism-accent-strong underline">A link</a>
          </div>
        </Frame>
      </div>
    </div>
  )
}