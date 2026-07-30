// Legal & policy pages — required for payment-gateway (Razorpay) site
// verification and DPDP transparency. Content describes ACTUAL product
// behaviour (what is collected, what is stored, what is never stored) and is
// pending formal legal review; factual claims are kept consistent with the
// consent canon in the Briefing flow.
import PageLayout, { PageHeading } from '../../components/PageLayout.jsx'

const COMPANY = 'Studai Edutech Private Limited'
const CIN = 'U85500TN2024PTC168744'
const EFFECTIVE = '30 July 2026'

function LegalShell({ title, subtitle, children }) {
  return (
    <PageLayout>
      <section className="py-16 px-6 max-w-4xl mx-auto">
        <PageHeading title={title} subtitle={subtitle} />
      </section>
      <section className="pb-20 px-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12 space-y-8 text-[var(--color-ink-muted)] leading-relaxed">
          {children}
          <p className="text-sm pt-6 border-t border-[var(--color-line)]">
            {COMPANY} · CIN {CIN} · Chennai, Tamil Nadu, India · Effective {EFFECTIVE}
          </p>
        </div>
      </section>
    </PageLayout>
  )
}

function H({ children }) {
  return <h2 className="text-xl font-bold text-[var(--color-ink)] mt-2">{children}</h2>
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy" subtitle="What we collect, why, and the rights you keep">
      <p>
        Prism is an AI skills assessment operated by {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        This policy describes what personal data we process when you use prism.studai.one, and the
        choices and rights you have under Indian law, including the Digital Personal Data Protection
        Act, 2023 (DPDP).
      </p>
      <H>What we collect</H>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong>Account data</strong> — name, email address, and the profile details you choose to add (college, year).</li>
        <li><strong>Assessment conversation</strong> — the full text of your assessment conversation. Voice answers are converted to text; the audio itself is not retained after transcription.</li>
        <li><strong>Proctoring signals</strong> — during an assessment your camera and microphone are active for integrity monitoring. Face presence is checked in your browser; camera video is not stored on our servers.</li>
        <li><strong>Identity verification</strong> — when identity checks are enabled, document reading happens in your browser. We store your declared name, the last 4 digits of your ID number, and the match outcome — never document images and never a full ID number.</li>
        <li><strong>Interaction patterns</strong> — timing and interaction telemetry (for example, response latency) used to protect the integrity and calibration of the assessment, as described in the consent step before every assessment.</li>
        <li><strong>Payment records</strong> — order and payment identifiers from our payment provider. Card, UPI and banking details are handled entirely by Razorpay; we never see or store them.</li>
      </ul>
      <H>What we use it for</H>
      <ul className="list-disc pl-6 space-y-2">
        <li>Running your assessment and producing your score report and verifiable credential.</li>
        <li>Integrity protection (detecting impersonation or relay assistance).</li>
        <li>Scientific calibration of the assessment, only under the research consent you grant explicitly.</li>
        <li>Sending you your report by email when you request it.</li>
      </ul>
      <H>AI processing</H>
      <p>
        Assessment conversations are processed by large language models hosted on Amazon Web Services
        (AWS Bedrock) in the Asia Pacific (Mumbai) region. Your conversation is evaluated by a panel of
        AI judges; every score is tied to quoted evidence from your own words.
      </p>
      <H>Storage and retention</H>
      <p>
        Data is stored on AWS infrastructure in the Asia Pacific (Mumbai) region. Score credentials are
        valid for 12 months. You may request erasure at any time (below); erasure removes your sessions,
        reports, credentials and associated telemetry.
      </p>
      <H>Your rights</H>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong>Access</strong> — request a copy of the data we hold about you.</li>
        <li><strong>Correction</strong> — fix inaccurate profile data from your Profile page.</li>
        <li><strong>Erasure</strong> — request deletion of your assessment data and account. Erasure cascades through reports, credentials and telemetry.</li>
        <li><strong>Grievance</strong> — contact our grievance officer at <a className="underline" href="mailto:privacy@studaione.com">privacy@studaione.com</a>. We respond within 7 days.</li>
      </ul>
      <H>Cookies and local storage</H>
      <p>
        We use browser local storage for your sign-in token and preferences. We do not use advertising
        trackers or third-party analytics cookies.
      </p>
    </LegalShell>
  )
}

export function TermsOfService() {
  return (
    <LegalShell title="Terms of Service" subtitle="The agreement that governs your use of Prism">
      <H>The service</H>
      <p>
        Prism provides a 30-minute conversational skills assessment scored by a panel of AI evaluators,
        a written score report, and a cryptographically verifiable credential valid for 12 months.
        Prism is operated by {COMPANY}.
      </p>
      <H>Accounts and eligibility</H>
      <p>
        You must provide accurate account information and keep your credentials confidential. One
        account per person. You must be at least 18 years old, or have the consent of a guardian.
      </p>
      <H>Purchases and licences</H>
      <p>
        Each assessment requires a licence purchased through our payment provider (Razorpay), priced as
        shown on the pricing section at the time of purchase. A licence entitles you to one scored
        assessment. Institutional group licences are issued through authorised invite links and are
        subject to the same integrity rules.
      </p>
      <H>Assessment integrity</H>
      <p>
        The assessment must be completed by you alone, without assistance from other people or AI
        tools. Camera, microphone and interaction signals are monitored for integrity. We may withhold,
        flag for human review, or annul results obtained in violation of these rules.
      </p>
      <H>Your content and our IP</H>
      <p>
        You retain rights over your conversation content. You grant us the licence to process it to
        produce and verify your results, and — only with your explicit research consent — to use it
        pseudonymously for calibration. The assessment format, scenarios, scoring systems and reports
        are our intellectual property; scenarios may not be recorded, copied or republished.
      </p>
      <H>Credentials and verification</H>
      <p>
        Credentials carry a signed evidence chain and can be verified at their public link. Credentials
        may be revoked for integrity violations discovered after issuance; revocation is visible at the
        verification link.
      </p>
      <H>Liability</H>
      <p>
        The service is provided &ldquo;as is&rdquo;. To the maximum extent permitted by law, our
        aggregate liability for any claim is limited to the amount you paid for the licence concerned.
        We are not liable for hiring decisions made by third parties using your credential.
      </p>
      <H>Governing law</H>
      <p>
        These terms are governed by the laws of India. Courts at Chennai, Tamil Nadu have exclusive
        jurisdiction.
      </p>
    </LegalShell>
  )
}

export function RefundPolicy() {
  return (
    <LegalShell title="Refund & Cancellation Policy" subtitle="Fair rules for a digital service">
      <H>Before your assessment starts</H>
      <p>
        A licence you have purchased but not yet used can be cancelled for a full refund within 7 days
        of purchase. Write to <a className="underline" href="mailto:support@studaione.com">support@studaione.com</a> from
        your account email with your order ID.
      </p>
      <H>Technical failures</H>
      <p>
        If a technical failure on our side prevents your assessment from completing or being scored,
        our first remedy is to restore your session or issue a fresh assessment licence at no cost. If
        we cannot do either within 72 hours, you receive a full refund.
      </p>
      <H>After a report is issued</H>
      <p>
        Once your score report has been generated, the service is complete and the licence is
        non-refundable. If you believe your score is wrong, you can raise a dispute from your report
        page — disputes are reviewed by a human and can lead to re-scoring.
      </p>
      <H>How refunds are paid</H>
      <p>
        Approved refunds are issued to the original payment method through Razorpay, typically within
        5–7 business days of approval.
      </p>
    </LegalShell>
  )
}

export function SecurityPage() {
  return (
    <LegalShell title="Security" subtitle="How Prism protects your data and its own results">
      <H>Transport and storage</H>
      <p>
        All traffic is encrypted in transit (TLS 1.2+). Data is stored encrypted at rest on AWS
        infrastructure in the Asia Pacific (Mumbai) region, with access restricted by least-privilege
        IAM roles.
      </p>
      <H>Result integrity</H>
      <p>
        Every issued credential carries a signed evidence bundle (Ed25519). Changing one character of a
        report breaks its signature, and every credential can be checked at its public verification
        link.
      </p>
      <H>Payments</H>
      <p>
        Payments are processed by Razorpay (PCI DSS Level 1). Card and banking details never touch our
        servers.
      </p>
      <H>Responsible disclosure</H>
      <p>
        Found a vulnerability? Report it to <a className="underline" href="mailto:security@studai.one">security@studai.one</a>.
        We acknowledge reports within 48 hours and do not pursue good-faith researchers.
      </p>
    </LegalShell>
  )
}

export function ContactPage() {
  return (
    <LegalShell title="Contact Us" subtitle="We answer. Usually the same day.">
      <H>Support</H>
      <p>
        Assessment, payment or account help: <a className="underline" href="mailto:support@studaione.com">support@studaione.com</a>.
        We respond within one business day.
      </p>
      <H>Privacy and data rights</H>
      <p>
        Grievance officer: <a className="underline" href="mailto:privacy@studaione.com">privacy@studaione.com</a>.
      </p>
      <H>Institutions and partnerships</H>
      <p>
        Cohort assessments and pilots: <a className="underline" href="mailto:institutions@studaione.com">institutions@studaione.com</a>.
      </p>
      <H>Security</H>
      <p>
        Vulnerability reports: <a className="underline" href="mailto:security@studai.one">security@studai.one</a>.
      </p>
      <H>Registered office</H>
      <p>
        {COMPANY}<br />
        CIN {CIN}<br />
        Chennai, Tamil Nadu, India
      </p>
    </LegalShell>
  )
}
