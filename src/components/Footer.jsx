import { Linkedin, Twitter } from 'lucide-react'
import PrismLogo from './ui/PrismLogo.jsx'

const productLinks = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Dimensions', href: '#dimensions' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Hire Marketplace', href: 'https://hire.studaione.com', external: true },
  { label: 'All Products', href: 'https://studaione.com', external: true },
]

const companyLinks = [
  { label: 'About StudAI One', href: 'https://studaione.com/about', external: true },
  { label: 'Careers', href: 'https://studaione.com/careers', external: true },
  { label: 'Press', href: 'https://studaione.com/press', external: true },
  { label: 'Contact', href: 'mailto:hello@studaione.com' },
]

const legalLinks = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Security', href: '/security' },
]

export default function Footer() {
  return (
    <footer className="bg-[var(--color-paper)] border-t border-[var(--color-line)]">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <PrismLogo size={34} />
            <p className="font-sans text-sm text-[var(--color-ink-muted)] leading-relaxed max-w-[220px]">
              Building the skills layer for India's workforce.
            </p>
            <div className="flex gap-3">
              <a
                href="https://linkedin.com/company/studaione"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="StudAI One on LinkedIn"
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-paper)] text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] transition-colors"
              >
                <Linkedin size={14} />
              </a>
              <a
                href="https://twitter.com/studaione"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="StudAI One on X (Twitter)"
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-paper)] text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] transition-colors"
              >
                <Twitter size={14} />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <p className="font-sans text-xs font-semibold tracking-[0.15em] text-[var(--color-accent)] uppercase mb-4">
              Product
            </p>
            <ul className="flex flex-col gap-3">
              {productLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target={l.external ? '_blank' : undefined}
                    rel={l.external ? 'noopener noreferrer' : undefined}
                    className="font-sans text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="font-sans text-xs font-semibold tracking-[0.15em] text-[var(--color-accent)] uppercase mb-4">
              Company
            </p>
            <ul className="flex flex-col gap-3">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target={l.external ? '_blank' : undefined}
                    rel={l.external ? 'noopener noreferrer' : undefined}
                    className="font-sans text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="font-sans text-xs font-semibold tracking-[0.15em] text-[var(--color-accent)] uppercase mb-4">
              Legal
            </p>
            <ul className="flex flex-col gap-3">
              {legalLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="font-sans text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-[var(--color-line)] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <p className="font-sans text-xs text-[var(--color-ink-muted)]">
            © 2026 Studai Edutech Private Limited · CIN U85500TN2024PTC168744 · Chennai, India
          </p>
          <p className="font-sans text-xs text-[var(--color-ink-muted)]">
            Built in Chennai. In production across India and APAC.
          </p>
        </div>
      </div>
    </footer>
  )
}
