import { Link } from 'react-router-dom'
import { Linkedin, Twitter } from 'lucide-react'
import PrismLogo from './ui/PrismLogo.jsx'
import { PILOT_NOTICE, NOT_SOLE_BASIS_POLICY } from '../../server/lib/sharedConstants.js'

const productLinks = [
  { label: 'How it works', to: '/#how-it-works' },
  { label: 'Dimensions', to: '/#dimensions' },
  { label: 'For universities', to: '/#who-its-for' },
  { label: 'Pricing', to: '/#pricing' },
  { label: 'Hire Marketplace', href: 'https://hire.studaione.com' },
  { label: 'All Products', href: 'https://studaione.com' },
]

const companyLinks = [
  { label: 'About StudAI One', href: 'https://studaione.com/about' },
  { label: 'Careers', href: 'https://studaione.com/careers' },
  { label: 'Press', href: 'https://studaione.com/press' },
  { label: 'Contact', to: '/contact' },
]

const legalLinks = [
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms of Service', to: '/terms' },
  { label: 'Refund Policy', to: '/refund-policy' },
  { label: 'Security', to: '/security' },
]

const LINK = 'text-sm text-prism-ink-muted transition-colors hover:text-prism-ink'

function FooterLink({ link }) {
  if (link.to) return <Link to={link.to} className={LINK}>{link.label}</Link>
  return <a href={link.href} target="_blank" rel="noopener noreferrer" className={LINK}>{link.label}</a>
}

function Column({ title, links }) {
  return (
    <nav aria-label={title}>
      <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-brand-green-ink">{title}</p>
      <ul className="flex flex-col gap-3">
        {links.map((l) => <li key={l.label}><FooterLink link={l} /></li>)}
      </ul>
    </nav>
  )
}

export default function Footer() {
  return (
    <footer className="border-t border-prism-border bg-prism-canvas">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            {/* The full wordmark carries the brand line; it is not repeated as text. */}
            <PrismLogo variant="full" width={240} />
            <p className="max-w-[240px] text-sm leading-relaxed text-prism-ink-muted">
              Work-readiness and capability intelligence.
            </p>
            <div className="flex gap-3">
              <a
                href="https://linkedin.com/company/studaione"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="StudAI One on LinkedIn"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-prism-ink-muted transition-colors hover:text-prism-ink"
              >
                <Linkedin size={14} aria-hidden="true" />
              </a>
              <a
                href="https://twitter.com/studaione"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="StudAI One on X (Twitter)"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-prism-ink-muted transition-colors hover:text-prism-ink"
              >
                <Twitter size={14} aria-hidden="true" />
              </a>
            </div>
          </div>

          <Column title="Product" links={productLinks} />
          <Column title="Company" links={companyLinks} />
          <Column title="Legal" links={legalLinks} />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-prism-border pt-6">
          {/* Charter: pilot positioning is visible on every marketing page. */}
          <p className="max-w-3xl text-xs text-prism-ink-muted">{PILOT_NOTICE} {NOT_SOLE_BASIS_POLICY}</p>
          <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
            <p className="text-xs text-prism-ink-muted">
              &copy; 2026 Studai Edutech Private Limited &middot; CIN U85500TN2024PTC168744 &middot; Chennai, India
            </p>
            <p className="text-xs text-prism-ink-muted">Built in Chennai. In production across India and APAC.</p>
          </div>
        </div>
      </div>
    </footer>
  )
}