/** Marca de Flota Control: odómetro plano sobre un cuadrado azul. Es el mismo dibujo que public/favicon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="Flota Control">
      <rect width="64" height="64" rx="14" fill="#2563EB" />
      <path d="M14.5 42.5 A19 19 0 1 1 49.5 42.5" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M14.5 42.5 A19 19 0 0 1 41.5 18.65" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M32 35 L39 23.4" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="35" r="5" fill="#fff" />
    </svg>
  )
}

/** Logo + nombre. `sub` es la línea pequeña debajo. */
export function Brand({ sub, large }: { sub?: string; large?: boolean }) {
  return (
    <div className={`brand ${large ? 'brand-lg' : ''}`}>
      <Logo className="brand-mark" />
      <div className="brand-text">
        <strong className="wordmark">Flota<span>Control</span></strong>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  )
}
