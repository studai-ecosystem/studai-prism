import { motion } from 'framer-motion'

export default function OutlineButton({ label, href, onClick, className = '' }) {
  const baseClass = `inline-flex items-center justify-center gap-2 px-6 py-3 font-sans font-semibold text-sm rounded-md border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-all duration-200 cursor-pointer ${className}`

  if (href) {
    const isExternal = href.startsWith('http')
    return (
      <motion.a
        href={href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className={baseClass}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
      >
        {label}
      </motion.a>
    )
  }

  return (
    <motion.button
      onClick={onClick}
      className={baseClass}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
    >
      {label}
    </motion.button>
  )
}
