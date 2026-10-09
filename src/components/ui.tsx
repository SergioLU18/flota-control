import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { moduleByKey } from '../data/modules'
import type { PhotoRef } from '../data/types'

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'gray' | 'violet'

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

const STATUS: Record<string, [Tone, string]> = {
  disponible: ['green', 'Disponible'], rentado: ['blue', 'Rentado'], taller: ['amber', 'En taller'],
  activa: ['blue', 'Activa'], finalizada: ['gray', 'Finalizada'],
  ok: ['green', 'Al día'], proximo: ['amber', 'Próximo'], vencido: ['red', 'Vencido'],
  abierto: ['amber', 'Abierto'], cerrado: ['gray', 'Cerrado'],
  entrega: ['blue', 'Entrega'], recepcion: ['violet', 'Recepción'],
  manual: ['gray', 'Manual'], orion: ['violet', 'Orión'],
  retenido: ['blue', 'Retenido'], devuelto: ['green', 'Devuelto'], aplicado: ['amber', 'Aplicado a adeudo'],
  admin: ['violet', 'Admin'], operador: ['gray', 'Operador'],
}
export function StatusBadge({ value }: { value: string }) {
  const [tone, label] = STATUS[value] ?? ['gray', value]
  return <Badge tone={tone}>{label}</Badge>
}

export function PageHeader({ module, title, subtitle, actions }: { module?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const m = module ? moduleByKey(module) : undefined
  const [open, setOpen] = useState(false)
  return (
    <header className="page-header">
      <div className="page-title-row">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {m && (
        <div className={`module-info ${open ? 'open' : ''}`}>
          <button className="link" onClick={() => setOpen(!open)}>ⓘ ¿Qué hace este módulo?</button>
          {open && (
            <p>
              {m.summary} <Link to={`/documentacion#${m.anchor}`}>Ver documentación →</Link>
            </p>
          )}
        </div>
      )}
    </header>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  )
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint, full }: { label: string; children: ReactNode; hint?: ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? 'field-full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Progress({ value, tone }: { value: number; tone: Tone }) {
  return (
    <div className="progress"><div className={`progress-bar bg-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></div>
  )
}

/** Foto real o placeholder ilustrado (la demo no trae fotos reales). */
export function Photo({ photo, onClick }: { photo: PhotoRef; onClick?: () => void }) {
  return (
    <figure className="photo" onClick={onClick}>
      {photo.url ? <img src={photo.url} alt={photo.label} /> : <PhotoPlaceholder photo={photo} />}
      <figcaption>{photo.label}{photo.damage && <span className="dot-red" title="Daño marcado" />}</figcaption>
    </figure>
  )
}

function PhotoPlaceholder({ photo }: { photo: PhotoRef }) {
  const c = photo.color ?? '#adb5bd'
  const inside = photo.label === 'Interior' || photo.label === 'Tablero'
  return (
    <svg viewBox="0 0 160 110" role="img" aria-label={photo.label}>
      <rect width="160" height="110" fill="var(--photo-bg)" />
      {inside ? (
        <g fill="none" stroke="var(--muted)" strokeWidth="3">
          <circle cx="80" cy="58" r="24" />
          <circle cx="80" cy="58" r="6" />
          <path d="M20 95 Q80 70 140 95" />
        </g>
      ) : (
        <g>
          <path d="M18 72 L30 50 Q38 40 55 40 L102 40 Q116 40 126 52 L142 62 Q148 66 148 74 L148 80 L18 80 Z" fill={c} stroke="#0004" strokeWidth="1.5" />
          <path d="M42 52 L54 44 L76 44 L76 56 L40 56 Z M82 44 L100 44 Q110 44 118 56 L82 56 Z" fill="#cfe3f0" opacity=".85" />
          <circle cx="45" cy="82" r="11" fill="#222" /><circle cx="45" cy="82" r="5" fill="#999" />
          <circle cx="120" cy="82" r="11" fill="#222" /><circle cx="120" cy="82" r="5" fill="#999" />
        </g>
      )}
      {photo.damage && <circle cx="96" cy="62" r="17" fill="none" stroke="#e03131" strokeWidth="3" strokeDasharray="5 4" />}
    </svg>
  )
}

export function Lightbox({ photo, onClose }: { photo: PhotoRef | null; onClose: () => void }) {
  return (
    <Modal open={!!photo} title={photo?.label ?? ''} onClose={onClose} wide>
      {photo && <div className="lightbox"><Photo photo={photo} /></div>}
    </Modal>
  )
}
