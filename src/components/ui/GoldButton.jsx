import { motion } from 'framer-motion'

export default function GoldButton({ label, href, onClick, className = '', type = 'button', disabled = false }) {
  const baseClass = `inline-flex items-center justify-center gap-2 px-6 py-3 font-sans font-semibold text-sm rounded-md cursor-pointer transition-all duration-200 shimmer-btn glow-pulse text-[#0A0D14] disabled:opacity-50 disabled:cursor-not-allowed ${className}`

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
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={baseClass}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.97 }}
    >
      {label}
    </motion.button>
  )
}
