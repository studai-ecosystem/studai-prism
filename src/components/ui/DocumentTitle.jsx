import { useEffect } from 'react'

// Sets the document title for screens that have no PageHeader (errors,
// loading, access states) so every state is announced distinctly (WCAG 2.4.2).
export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = `${title} · Prism`
  }, [title])
}

export function DocumentTitle({ title }) {
  useDocumentTitle(title)
  return null
}

export default DocumentTitle
