import { useState, useEffect } from 'react'

export function useScrollDirection() {
  const [scrollDir, setScrollDir] = useState('up')
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    let lastScrollY = window.scrollY

    const handler = () => {
      const currentScrollY = window.scrollY
      setScrollY(currentScrollY)
      if (Math.abs(currentScrollY - lastScrollY) < 8) return
      setScrollDir(currentScrollY > lastScrollY ? 'down' : 'up')
      lastScrollY = currentScrollY
    }

    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return { scrollDir, scrollY }
}
