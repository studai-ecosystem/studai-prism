import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Traps Tab focus inside `ref` while `active`, closes on Escape and returns
// focus to the previously focused element when deactivated.
export function useFocusTrap(active, { onEscape, initialFocusRef } = {}) {
  const ref = useRef(null)
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape

  useEffect(() => {
    if (!active) return undefined
    const previous = document.activeElement
    const node = ref.current
    const focusables = () => (node ? Array.from(node.querySelectorAll(FOCUSABLE)) : [])
    const first = initialFocusRef?.current || focusables()[0] || node
    first?.focus?.()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        escapeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    node?.addEventListener('keydown', onKeyDown)
    return () => {
      node?.removeEventListener('keydown', onKeyDown)
      if (previous && typeof previous.focus === 'function') previous.focus()
    }
  }, [active, initialFocusRef])

  return ref
}

// Calls `handler` on pointerdown outside every ref and on Escape.
export function useDismiss(active, refs, handler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    if (!active) return undefined
    function onPointer(e) {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return
      handlerRef.current?.()
    }
    function onKey(e) {
      if (e.key === 'Escape') handlerRef.current?.()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [active, refs])
}
