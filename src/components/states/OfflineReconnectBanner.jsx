import { useEffect, useState } from 'react'
import { onlineManager } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'

function currentlyOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

// Connection-loss banner (spec §40). Tracks browser online/offline events and
// keeps React Query's onlineManager in step so queries pause and resume.
export function OfflineReconnectBanner({
  title = 'Connection interrupted.',
  message = 'Your latest saved work is safe. Reconnecting…',
}) {
  const [online, setOnline] = useState(currentlyOnline)
  useEffect(() => {
    const up = () => { setOnline(true); onlineManager.setOnline(true) }
    const down = () => { setOnline(false); onlineManager.setOnline(false) }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  if (online) return null
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-prism-partial-soft bg-prism-partial-soft px-4 py-2 text-sm text-prism-ink">
      <WifiOff size={16} aria-hidden="true" className="shrink-0 text-prism-partial" />
      <span><strong className="font-semibold">{title}</strong> {message}</span>
    </div>
  )
}

export default OfflineReconnectBanner
