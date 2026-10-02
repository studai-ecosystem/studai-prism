import { Outlet } from 'react-router-dom'
import { SkipLink } from '../components/navigation/SkipLink.jsx'
import { OfflineReconnectBanner } from '../components/states/OfflineReconnectBanner.jsx'

// Dark, distraction-free simulation frame (spec §5.2, §12). No product nav.
export function AssessmentShell({ header, children, fill = false }) {
  return (
    <div className={fill ? 'prism-app theme-assessment flex h-[100dvh] min-h-0 flex-col overflow-hidden' : 'prism-app theme-assessment flex min-h-screen flex-col'}>
      <SkipLink />
      {header}
      <div className="shrink-0"><OfflineReconnectBanner /></div>
      <main id="main" tabIndex={-1} className={`flex min-h-0 flex-1 flex-col focus:outline-none${fill ? ' overflow-hidden' : ''}`}>
        {children || <Outlet />}
      </main>
    </div>
  )
}

export default AssessmentShell
