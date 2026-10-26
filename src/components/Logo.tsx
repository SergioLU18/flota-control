/** Marca de Flota Control: odómetro. Es el mismo dibujo que public/favicon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="Flota Control">
      <rect width="64" height="64" rx="15" fill="#2a2a2a" />
      <path d="M13.6 42 A19.5 19.5 0 1 1 50.4 42" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      <path d="M32 37 L43 22" stroke="#d9a441" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="32" cy="37" r="5" fill="#fff" />
    </svg>
  )
}
