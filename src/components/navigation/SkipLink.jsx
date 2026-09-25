// First focusable element on every shell page (WCAG 2.4.1).
export function SkipLink({ target = '#main' }) {
  return (
    <a
      href={target}
      className="sr-only-focusable fixed left-3 top-3 z-[70] rounded-[var(--prism-radius-md)] bg-prism-accent px-4 py-2 text-sm font-semibold text-prism-accent-ink"
    >
      Skip to main content
    </a>
  )
}

export default SkipLink
