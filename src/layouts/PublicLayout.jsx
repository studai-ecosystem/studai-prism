import { Outlet, Link } from 'react-router-dom'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { SkipLink } from '../components/navigation/SkipLink.jsx'

// Minimal frame for new public/transactional pages (e.g. campus invite).
// Existing marketing pages keep their own layouts.
export function PublicLayout({ children }) {
  return (
    <div className="prism-app flex min-h-screen flex-col">
      <SkipLink />
      <header className="flex h-14 items-center border-b border-prism-border bg-prism-surface px-4 md:px-8">
        <Link to="/" aria-label="Prism home"><PrismLogo size={24} /></Link>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 focus:outline-none md:px-8">
        {children || <Outlet />}
      </main>
      <footer className="border-t border-prism-border px-4 py-4 text-xs text-prism-ink-subtle md:px-8">
        <Link to="/privacy" className="hover:underline">Privacy</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/terms" className="hover:underline">Terms</Link>
      </footer>
    </div>
  )
}

export default PublicLayout
