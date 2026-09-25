import { Component, lazy } from 'react'
import { ErrorState } from '../components/states/ErrorState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { DocumentTitle } from '../components/ui/DocumentTitle.jsx'

const RELOAD_KEY = 'prismChunkReloadAt'

export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '')
  return err?.name === 'ChunkLoadError' || /dynamically imported module|Importing a module script failed|Loading chunk .* failed|error loading dynamically imported/i.test(msg)
}

// React.lazy with one automatic reload when a route chunk fails to load (the
// usual cause is a deploy while the tab was open). A second failure within a
// minute surfaces the error boundary instead of reload-looping.
export function lazyWithRetry(loader) {
  return lazy(async () => {
    try {
      const mod = await loader()
      sessionStorage.removeItem(RELOAD_KEY)
      return mod
    } catch (err) {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
      if (isChunkLoadError(err) && Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
        window.location.reload()
        return new Promise(() => {})
      }
      throw err
    }
  })
}

// Route-level boundary: a failed page never white-screens the app.
export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined') console.error('route_error', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const chunk = isChunkLoadError(error)
    return (
      <div className="prism-app px-4 py-10">
        <DocumentTitle title={chunk ? 'Reload needed' : 'Page error'} />
        <ErrorState
          title={chunk ? 'This page needs to reload' : 'Something went wrong on this page'}
          description={chunk ? 'A newer version of Prism is available. Reload to continue — your saved work is kept on the server.' : 'Reload the page to try again. If this keeps happening, contact support.'}
          action={<Button onClick={() => window.location.reload()}>Reload page</Button>}
        />
      </div>
    )
  }
}

export default RouteErrorBoundary
