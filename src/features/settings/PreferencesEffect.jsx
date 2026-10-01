// Applies the account's accessibility preferences (C4.11) to the document.
// Preferences live server-side so they follow the account across devices;
// when they cannot be loaded nothing is changed (system settings still apply).
import { useEffect } from 'react'
import { usePreferences } from '../student/hooks.js'

export function applyPreferences(prefs, root = document.documentElement) {
  root.classList.toggle('prism-reduced-motion', Boolean(prefs?.reducedMotion))
  root.classList.toggle('prism-large-text', Boolean(prefs?.largerText))
}

export function PreferencesEffect() {
  const { data } = usePreferences()
  useEffect(() => {
    if (data) applyPreferences(data)
  }, [data])
  return null
}

export default PreferencesEffect
