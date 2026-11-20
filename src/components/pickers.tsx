// Selectores propios en lugar de los del navegador: Select, MultiSelect, DatePicker y DateRangePicker.
// El menú o calendario se dibuja en document.body con posición fija (Popover): así no lo recorta una ventana
// con scroll ni una tabla, y se voltea hacia arriba si no cabe abajo. Escape cierra sin cerrar la ventana de atrás.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { norm } from './ui'
import { CURRENT_MONDAY, TODAY, addDays, fecha, fechaCorta, mondayOf } from '../lib/format'

// ============================================================
// Popover: capa flotante pegada a un botón
// ============================================================

function Popover({ anchor, onClose, children, className = '' }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode; className?: string
}) {
  const pop = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const p = pop.current
      if (!a || !p) return
      const m = 8
      p.style.minWidth = `${a.width}px`
      const w = p.offsetWidth, h = p.offsetHeight
      let top = a.bottom + 6
      if (top + h > innerHeight - m) top = a.top - 6 - h > m ? a.top - 6 - h : Math.max(m, innerHeight - m - h)
      const left = Math.max(m, Math.min(a.left, innerWidth - m - w))
      p.style.top = `${top}px`
      p.style.left = `${left}px`
    }
    place()
    // El foco entra al buscador, la lista o el calendario (lo que tenga data-autofocus).
    pop.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
    // Si cambia de tamaño (otra vista del calendario, búsqueda), se vuelve a acomodar.
    const ro = new ResizeObserver(place)
    if (pop.current) ro.observe(pop.current)
    addEventListener('resize', place)
    addEventListener('scroll', place, true)
    return () => { ro.disconnect(); removeEventListener('resize', place); removeEventListener('scroll', place, true) }
  }, [anchor])
  useEffect(() => {
    // En captura: una ventana (Modal) detiene el mousedown y sin captura no llegaría hasta aquí.
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !anchor.current?.contains(t)) onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [anchor, onClose])
  // Nace fuera de la pantalla (no oculta: un elemento oculto no recibe el foco) y place() la pone en su lugar antes de pintar.
  return createPortal(<div ref={pop} className={`popover ${className}`} style={{ top: 0, left: -10000 }}>{children}</div>, document.body)
}

/** Botón con el aspecto de un campo; abre y cierra su capa. */
function useTrigger() {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const close = (focus = true) => { setOpen(false); if (focus) button.current?.focus() }
  return { open, setOpen, button, close }
}

function TriggerButton({ t, disabled, title, icon = 'chevron', className = '', children }: {
  t: ReturnType<typeof useTrigger>; disabled?: boolean; title?: string; icon?: 'chevron' | 'calendar'; className?: string; children: ReactNode
}) {
  return (
    <button ref={t.button} type="button" className={`dropdown-button ${className}`} aria-haspopup="dialog" aria-expanded={t.open} disabled={disabled} title={title}
      onClick={() => t.setOpen(!t.open)}
      onKeyDown={(e) => { if (!t.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); t.setOpen(true) } }}>
      {icon === 'calendar' && <Icon name="calendar" className="icon dropdown-lead" />}
      <span className="dropdown-text">{children}</span>
      {icon === 'chevron' && <Icon name="chevron" className="icon dropdown-chevron" />}
    </button>
  )
}

/** Escape y Tab dentro de la capa: cierran sin que la ventana de atrás (Modal) se entere. */
const commonKeys = (e: ReactKeyboardEvent, close: (focus?: boolean) => void) => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return true }
  if (e.key === 'Tab') { close(false); return true }
  return false
}

// ============================================================
// Select y MultiSelect
// ============================================================

export interface Option<T extends string = string> {
  value: T
  label: string
  /** Texto chico a la derecha (p. ej. placas). También cuenta para la búsqueda. */
  hint?: string
  /** Encabezado de grupo: las opciones seguidas con el mismo grupo van juntas. */
  group?: string
  /** Algo antes del texto, como la muestra de un color. */
  lead?: ReactNode
}

/** Lista con la opción activa (teclado o mouse); con muchas opciones, buscador arriba. */
function OptionList<T extends string>({ options, isSelected, onPick, searchable, label, multi, onKeyClose, footer }: {
  options: Option<T>[]; isSelected: (v: T) => boolean; onPick: (v: T) => void; searchable: boolean; label: string; multi?: boolean
  onKeyClose: (e: ReactKeyboardEvent) => boolean; footer?: ReactNode
}) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? options.filter((o) => norm(`${o.label} ${o.hint ?? ''}`).includes(norm(q.trim()))) : options
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => isSelected(o.value))))
  const box = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const typed = useRef({ text: '', at: 0 })
  useEffect(() => { box.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }) }, [active, q])
  const move = (i: number) => setActive(shown.length ? (i + shown.length) % shown.length : 0)
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (onKeyClose(e)) return
    if (e.key === 'ArrowDown') { e.preventDefault(); move(active + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(active - 1) }
    else if (e.key === 'Home' && !searchable) { e.preventDefault(); move(0) }
    else if (e.key === 'End' && !searchable) { e.preventDefault(); move(shown.length - 1) }
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) { e.preventDefault(); if (shown[active]) onPick(shown[active].value) }
    else if (!searchable && e.key.length === 1) {
      // Escribir sin buscador salta a la primera opción que empiece así.
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key, at: now }
      const i = shown.findIndex((o) => norm(o.label).startsWith(norm(typed.current.text)))
      if (i >= 0) setActive(i)
    }
  }
  let lastGroup: string | undefined
  return (
    <div className="option-list" onKeyDown={onKeyDown}>
      {searchable && (
        <div className="option-search">
          <Icon name="search" className="icon" />
          <input ref={search} data-autofocus value={q} placeholder="Buscar…" aria-label={`Buscar en ${label}`} onChange={(e) => { setQ(e.target.value); setActive(0) }} />
        </div>
      )}
      <div ref={box} className="option-scroll" role="listbox" aria-label={label} aria-multiselectable={multi || undefined} tabIndex={-1}
        data-autofocus={searchable ? undefined : true}>
        {shown.map((o, i) => {
          const header = o.group && o.group !== lastGroup ? <div className="option-group" role="presentation">{o.group}</div> : null
          lastGroup = o.group
          const sel = isSelected(o.value)
          return (
            <div key={o.value} role="presentation">
              {header}
              <div role="option" aria-selected={sel} className={`option ${sel ? 'selected' : ''} ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(o.value)}>
                {multi && <span className={`option-box ${sel ? 'on' : ''}`} aria-hidden>{sel && <Icon name="check" className="icon" />}</span>}
                {o.lead}
                <span className="option-label">{o.label}</span>
                {o.hint && <span className="option-hint">{o.hint}</span>}
                {!multi && sel && <Icon name="check" className="icon option-check" />}
              </div>
            </div>
          )
        })}
        {!shown.length && <div className="option-empty">Nada coincide con “{q}”.</div>}
      </div>
      {footer}
    </div>
  )
}

/**
 * Selector de una opción. `prefix` va antes del valor ("Módulo: Cobranza", para filtros); `placeholder` se ve
 * si `value` no está entre las opciones. Con más de 10 opciones lleva buscador.
 */
export function Select<T extends string>({ value, options, onChange, label, prefix, placeholder = 'Selecciona…', disabled, title, tour, searchable }: {
  value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; prefix?: string; placeholder?: string
  disabled?: boolean; title?: string; tour?: string; searchable?: boolean
}) {
  const t = useTrigger()
  const current = options.find((o) => o.value === value)
  return (
    <div className={`dropdown ${t.open ? 'open' : ''}`} data-tour={tour}>
      <TriggerButton t={t} disabled={disabled} title={title}>
        {prefix && <span className="dropdown-prefix">{prefix}:</span>}
        {current ? <>{current.lead}{current.label}</> : <span className="dropdown-placeholder">{placeholder}</span>}
      </TriggerButton>
      {t.open && (
        <Popover anchor={t.button} onClose={() => t.close(false)}>
          <OptionList options={options} isSelected={(v) => v === value} label={label} searchable={searchable ?? options.length > 10}
            onKeyClose={(e) => commonKeys(e, t.close)} onPick={(v) => { onChange(v); t.close() }} />
        </Popover>
      )}
    </div>
  )
}

/** Varias opciones con casillas; el menú queda abierto al marcar. Sin nada marcado dice `allLabel`. */
export function MultiSelect({ label, allLabel, options, value, onChange, disabled }: {
  label: string; allLabel: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean
}) {
  const t = useTrigger()
  const picked = options.filter((o) => value.includes(o.value))
  const text = !picked.length ? allLabel : picked.length === 1 ? picked[0].label : `${picked.length} ${label.toLowerCase()}`
  return (
    <div className={`dropdown ${t.open ? 'open' : ''}`}>
      <TriggerButton t={t} disabled={disabled} title={picked.length > 1 ? picked.map((o) => o.label).join(', ') : undefined}>
        <span className="dropdown-prefix">{label}:</span>{text}
      </TriggerButton>
      {t.open && (
        <Popover anchor={t.button} onClose={() => t.close(false)}>
          <OptionList multi options={options} isSelected={(v) => value.includes(v)} label={label} searchable={options.length > 10}
            onKeyClose={(e) => commonKeys(e, t.close)}
            onPick={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
            footer={value.length > 0 && <div className="popover-foot"><button type="button" className="link" onClick={() => onChange([])}>Quitar selección</button></div>} />
        </Popover>
      )}
    </div>
  )
}

// ============================================================
// Calendario
// ============================================================

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** 'YYYY-MM' más n meses. */
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}
/** Ese día del mes 'YYYY-MM' (si no existe, el último del mes). */
const dayIn = (ym: string, day: string) => {
  const last = addDays(addMonths(ym, 1) + '-01', -1)
  return `${ym}-${day}` > last ? last : `${ym}-${day}`
}
/** Mismo día en otro mes. */
const shiftMonth = (iso: string, n: number) => dayIn(addMonths(iso.slice(0, 7), n), iso.slice(8, 10))
const within = (d: string, min?: string, max?: string) => (!min || d >= min) && (!max || d <= max)

/**
 * Mes en cuadrícula (6 semanas, de lunes a domingo). El encabezado cambia a la vista de meses del año para
 * saltar lejos. `cursor` es el día activo para el teclado; `dayClass` agrega clases (elegido, en rango…).
 */
function Calendar({ cursor, setCursor, onPick, onHover, dayClass, min, max }: {
  cursor: string; setCursor: (d: string) => void; onPick: (d: string) => void; onHover?: (d: string | undefined) => void
  dayClass: (d: string) => string; min?: string; max?: string
}) {
  const [view, setView] = useState<'dias' | 'meses'>('dias')
  const month = cursor.slice(0, 7)
  const [y, m] = month.split('-').map(Number)
  const start = mondayOf(month + '-01')
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const grid = useRef<HTMLDivElement>(null)
  // Al cambiar entre días y meses, el foco pasa a la vista nueva (al abrir lo pone el Popover).
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } grid.current?.focus({ preventScroll: true }) }, [view])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1), ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7), ArrowDown: () => addDays(cursor, 7),
      PageUp: () => shiftMonth(cursor, e.shiftKey ? -12 : -1), PageDown: () => shiftMonth(cursor, e.shiftKey ? 12 : 1),
      Home: () => mondayOf(cursor), End: () => addDays(mondayOf(cursor), 6),
    }
    if (view === 'dias' && step[e.key]) { e.preventDefault(); setCursor(step[e.key]()) }
    else if (view === 'dias' && e.key === 'Enter') { e.preventDefault(); if (within(cursor, min, max)) onPick(cursor) }
  }

  return (
    <div className="calendar" onKeyDown={onKeyDown}>
      <div className="calendar-head">
        <button type="button" className="calendar-title" onClick={() => setView(view === 'dias' ? 'meses' : 'dias')} aria-label="Cambiar de mes o año">
          {view === 'dias' ? <>{MONTHS_LONG[m - 1]} <span className="muted">{y}</span></> : y}
          <Icon name="chevron" className={`icon ${view === 'meses' ? 'up' : ''}`} />
        </button>
        <span className="calendar-nav">
          <button type="button" className="icon-btn" aria-label={view === 'dias' ? 'Mes anterior' : 'Año anterior'}
            onClick={() => setCursor(shiftMonth(cursor, view === 'dias' ? -1 : -12))}><Icon name="back" /></button>
          <button type="button" className="icon-btn" aria-label={view === 'dias' ? 'Mes siguiente' : 'Año siguiente'}
            onClick={() => setCursor(shiftMonth(cursor, view === 'dias' ? 1 : 12))}><Icon name="forward" /></button>
        </span>
      </div>
      {view === 'dias' ? (
        <div ref={grid} className="calendar-grid" role="grid" aria-label={`${MONTHS_LONG[m - 1]} ${y}`} tabIndex={0} data-autofocus onMouseLeave={() => onHover?.(undefined)}>
          {WEEKDAYS.map((d, i) => <span key={i} className="calendar-wd" aria-hidden>{d}</span>)}
          {days.map((d) => {
            const ok = within(d, min, max)
            return (
              <button key={d} type="button" tabIndex={-1} disabled={!ok} aria-label={fecha(d)}
                className={`calendar-day ${d.slice(0, 7) !== month ? 'other' : ''} ${d === TODAY ? 'today' : ''} ${d === cursor ? 'cursor' : ''} ${dayClass(d)}`}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => onHover?.(d)} onClick={() => { setCursor(d); onPick(d) }}>
                {Number(d.slice(8, 10))}
              </button>
            )
          })}
        </div>
      ) : (
        <div ref={grid} className="calendar-months" tabIndex={-1}>
          {MONTHS.map((name, i) => {
            const ym = `${y}-${String(i + 1).padStart(2, '0')}`
            const ok = (!min || ym >= min.slice(0, 7)) && (!max || ym <= max.slice(0, 7))
            return (
              <button key={name} type="button" disabled={!ok} className={`calendar-month ${ym === month ? 'cursor' : ''} ${ym === TODAY.slice(0, 7) ? 'today' : ''}`}
                onClick={() => { setCursor(dayIn(ym, cursor.slice(8, 10))); setView('dias') }}>
                {name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// DatePicker
// ============================================================

/** Una fecha 'YYYY-MM-DD' (o '' si se permite borrar). */
export function DatePicker({ value, onChange, min, max, placeholder = 'Elegir fecha', clearable, disabled, label = 'Fecha' }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string; clearable?: boolean; disabled?: boolean; label?: string
}) {
  const t = useTrigger()
  const [cursor, setCursor] = useState(value || TODAY)
  // Al abrir: el mes de la fecha elegida o, sin ella, el de hoy (o el límite más cercano).
  useEffect(() => { if (t.open) setCursor(value || (within(TODAY, min, max) ? TODAY : min ?? max ?? TODAY)) }, [t.open]) // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (d: string) => { onChange(d); t.close() }
  return (
    <div className={`dropdown date-picker ${t.open ? 'open' : ''}`}>
      <TriggerButton t={t} disabled={disabled} icon="calendar">
        {value ? fecha(value) : <span className="dropdown-placeholder">{placeholder}</span>}
      </TriggerButton>
      {t.open && (
        <Popover anchor={t.button} onClose={() => t.close(false)} className="popover-calendar">
          <div role="dialog" aria-label={label} onKeyDown={(e) => commonKeys(e, t.close)}>
            <Calendar cursor={cursor} setCursor={setCursor} onPick={pick} min={min} max={max} dayClass={(d) => (d === value ? 'selected' : '')} />
            <div className="popover-foot">
              {within(TODAY, min, max) && <button type="button" className="link" onClick={() => pick(TODAY)}>Hoy</button>}
              {clearable && value && <button type="button" className="link link-muted" onClick={() => pick('')}>Borrar</button>}
            </div>
          </div>
        </Popover>
      )}
    </div>
  )
}

// ============================================================
// DateRangePicker
// ============================================================

export interface DateRange { from: string; to: string }

/** Atajos de periodo, todos terminan a más tardar hoy. */
function presets(): { label: string; from: string; to: string }[] {
  const ym = TODAY.slice(0, 7)
  const prev = addMonths(ym, -1)
  return [
    { label: 'Hoy', from: TODAY, to: TODAY },
    { label: 'Esta semana', from: CURRENT_MONDAY, to: TODAY },
    { label: 'Semana pasada', from: addDays(CURRENT_MONDAY, -7), to: addDays(CURRENT_MONDAY, -1) },
    { label: 'Últimos 7 días', from: addDays(TODAY, -6), to: TODAY },
    { label: 'Este mes', from: `${ym}-01`, to: TODAY },
    { label: 'Mes pasado', from: `${prev}-01`, to: addDays(`${ym}-01`, -1) },
    { label: 'Últimos 30 días', from: addDays(TODAY, -29), to: TODAY },
    { label: 'Este año', from: `${TODAY.slice(0, 4)}-01-01`, to: TODAY },
  ]
}

/** Texto corto de un rango: "3 – 20 nov 2026", "Desde 3 nov 2026"… */
export function rangeText({ from, to }: DateRange, empty = 'Cualquier fecha') {
  if (from && to) {
    if (from === to) return fecha(from)
    if (from.slice(0, 4) !== to.slice(0, 4)) return `${fecha(from)} – ${fecha(to)}`
    return `${from.slice(0, 7) === to.slice(0, 7) ? Number(from.slice(8, 10)) : fechaCorta(from)} – ${fecha(to)}`
  }
  if (from) return `Desde ${fecha(from)}`
  if (to) return `Hasta ${fecha(to)}`
  return empty
}

/**
 * Rango de fechas en un solo botón: atajos a un lado y el calendario (primer clic el inicio, segundo el fin).
 * Cualquiera de los dos extremos puede quedar vacío (sin límite).
 */
export function DateRangePicker({ value, onChange, max = TODAY, placeholder = 'Cualquier fecha', label = 'Fechas' }: {
  value: DateRange; onChange: (v: DateRange) => void; max?: string; placeholder?: string; label?: string
}) {
  const t = useTrigger()
  const [draft, setDraft] = useState<DateRange>(value)
  const [cursor, setCursor] = useState(value.to || value.from || TODAY)
  const [hover, setHover] = useState<string>()
  // Eligiendo el fin: el inicio ya está y el fin todavía no.
  const choosingEnd = !!draft.from && !draft.to
  // Cada vez que se abre empieza una selección nueva (el rango actual se ve en el botón y marcado en el calendario).
  const open = () => { setDraft(value.from && value.to ? value : { from: '', to: '' }); setCursor(value.to || value.from || TODAY); t.setOpen(true) }
  const apply = (r: DateRange) => { onChange(r); t.close() }
  const pick = (d: string) => {
    if (choosingEnd) {
      const r = d < draft.from ? { from: d, to: draft.from } : { from: draft.from, to: d }
      setDraft(r)
      apply(r)
    } else setDraft({ from: d, to: '' })
  }
  // Se marca lo que se va eligiendo o, antes del primer clic, el rango actual.
  const shown = draft.from ? draft : value
  const end = choosingEnd && hover ? hover : shown.to
  const [lo, hi] = shown.from && end ? (end < shown.from ? [end, shown.from] : [shown.from, end]) : [shown.from, shown.from]
  const dayClass = (d: string) => [
    lo && hi && d > lo && d < hi ? 'in-range' : '',
    d === lo && lo ? 'range-start selected' : '',
    d === hi && hi ? 'range-end selected' : '',
  ].join(' ')
  const active = presets().find((p) => p.from === value.from && p.to === value.to)

  return (
    <div className={`dropdown date-range ${t.open ? 'open' : ''}`}>
      <button ref={t.button} type="button" className="dropdown-button" aria-haspopup="dialog" aria-expanded={t.open}
        onClick={() => (t.open ? t.close(false) : open())}
        onKeyDown={(e) => { if (!t.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open() } }}>
        <Icon name="calendar" className="icon dropdown-lead" />
        <span className="dropdown-text">{value.from || value.to ? (active?.label ?? rangeText(value)) : <span className="dropdown-placeholder">{placeholder}</span>}</span>
        {active && <span className="dropdown-sub">{rangeText(value)}</span>}
      </button>
      {t.open && (
        <Popover anchor={t.button} onClose={() => t.close(false)} className="popover-calendar popover-range">
          <div role="dialog" aria-label={label} className="range-body" onKeyDown={(e) => commonKeys(e, t.close)}>
            <div className="range-presets">
              {presets().filter((p) => p.from <= max).map((p) => (
                <button key={p.label} type="button" className={`range-preset ${active?.label === p.label ? 'selected' : ''}`} onClick={() => apply(p)}>{p.label}</button>
              ))}
            </div>
            <div>
              <Calendar cursor={cursor} setCursor={setCursor} onPick={pick} onHover={setHover} dayClass={dayClass} max={max} />
              <div className="popover-foot">
                <span className="muted small">{choosingEnd ? 'Ahora elige el último día' : draft.from ? rangeText(draft) : 'Elige el primer día'}</span>
                {choosingEnd && <button type="button" className="link" onClick={() => apply({ from: draft.from, to: '' })}>Solo desde esta fecha</button>}
                {(value.from || value.to) && <button type="button" className="link link-muted" onClick={() => apply({ from: '', to: '' })}>Borrar</button>}
              </div>
            </div>
          </div>
        </Popover>
      )}
    </div>
  )
}
