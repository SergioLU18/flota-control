// Tour guiado opcional: recorre los módulos que ve el usuario, resaltando cada pantalla con su explicación.
// Se lanza desde el botón "Tour guiado" de la barra superior, en cualquier momento.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MODULES } from '../data/modules'
import { useStore } from '../data/store'

interface Step {
  path?: string
  /** Selectores en orden de preferencia; se usa el primero que esté visible. Sin ninguno, la tarjeta va al centro. */
  targets: string[]
  title: string
  body: ReactNode
}

const PAD = 6
const GAP = 12

const visible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth
}
const findTarget = (selectors: string[]) => {
  for (const s of selectors) {
    const el = document.querySelector(s)
    if (el && visible(el)) return el
  }
  return null
}

export function Tour({ onClose }: { onClose: () => void }) {
  const { user } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const steps = useMemo<Step[]>(() => {
    const mods = MODULES.filter((m) => user && m.roles.includes(user.role))
    return [
      {
        targets: ['.sidebar nav', '.tabbar'],
        title: 'Bienvenido a Flota Control',
        body: <>Vamos a recorrer los {mods.length} módulos que tienes disponibles. Puedes avanzar con las flechas del teclado y salir cuando quieras con Esc.</>,
      },
      ...mods.map((m) => ({
        path: m.path,
        targets: m.key === 'docs' ? ['.docs > h1', '.docs'] : [`.page-header[data-module="${m.key}"]`],
        title: m.label,
        body: m.key === 'docs'
          ? m.summary
          : <>{m.summary} <Link to={`/documentacion#${m.anchor}`} onClick={onClose}>Ver documentación →</Link></>,
      })),
      {
        targets: ['[data-tour="start"]'],
        title: 'Eso es todo',
        body: 'Puedes volver a lanzar el tour cuando quieras desde este botón.',
      },
    ]
  }, [user, onClose])

  const [i, setI] = useState(0)
  const step = steps[i]
  const last = i === steps.length - 1
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [ready, setReady] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Ir a la pantalla del paso.
  useEffect(() => {
    if (step.path && step.path !== pathname) navigate(step.path)
  }, [step, pathname, navigate])

  // Buscar el elemento a resaltar una vez que la pantalla correcta está montada.
  useEffect(() => {
    setReady(false)
    setRect(null)
    if (step.path && step.path !== pathname) return
    let frame = 0
    let tries = 0
    let el: Element | null = null
    const measure = () => { if (el) setRect(el.getBoundingClientRect()) }
    const look = () => {
      el = findTarget(step.targets)
      if (!el && tries++ < 60) { frame = requestAnimationFrame(look); return }
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.top < 60 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center' })
        measure()
      }
      setReady(true)
    }
    look()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, pathname])

  // Colocar la tarjeta debajo del elemento, o encima si no cabe; sin elemento, al centro.
  useLayoutEffect(() => {
    const pop = popRef.current
    if (!pop || !ready) return
    const { innerWidth: W, innerHeight: H } = window
    const { width: w, height: h } = pop.getBoundingClientRect()
    if (!rect) { setPos({ top: (H - h) / 2, left: (W - w) / 2 }); return }
    const left = Math.min(Math.max(rect.left, 16), W - w - 16)
    const below = rect.bottom + PAD + GAP
    const above = rect.top - PAD - GAP - h
    const top = below + h <= H - 16 ? below : above >= 16 ? above : H - h - 16
    setPos({ top, left })
  }, [rect, ready, i])

  useEffect(() => { if (ready) popRef.current?.focus({ preventScroll: true }) }, [ready, i])

  const next = () => (last ? onClose() : setI(i + 1))
  const prev = () => setI(Math.max(0, i - 1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="tour">
      <div className="tour-catcher" />
      {ready && (rect
        ? <div className="tour-spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
        : <div className="tour-dim" />)}
      <div
        ref={popRef}
        className="tour-pop"
        role="dialog"
        aria-labelledby="tour-title"
        tabIndex={-1}
        style={pos && ready ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
      >
        <div className="tour-count">{i + 1} de {steps.length}</div>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="link" onClick={onClose}>Salir del tour</button>
          <span className="actions">
            {i > 0 && <button className="btn btn-sm" onClick={prev}>Anterior</button>}
            <button className="btn btn-sm btn-primary" onClick={next}>{last ? 'Terminar' : i === 0 ? 'Comenzar' : 'Siguiente'}</button>
          </span>
        </div>
      </div>
    </div>
  )
}
