// Tour guiado: recorre cada módulo sobre la pantalla real y señala el botón o la sección de la que habla.
// Algunos pasos esperan a que el usuario haga la acción (pulsar una pestaña, abrir un formulario o un expediente).
// Los formularios se abren solo para conocerlos: el tour nunca guarda nada.
// Lo que se resalta se marca con `data-tour="…"` en cada pantalla. Si un paso no encuentra su elemento
// (no hay datos, o el rol no ve ese botón), se salta solo.
// Se lanza desde el botón "Tour guiado" de la barra superior o desde Ajustes.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { modulesFor } from '../data/modules'
import { can } from '../data/permissions'
import { useStore } from '../data/store'
import type { User } from '../data/types'
import { Icon, type IconName } from './Icon'

// ── Definición de pasos ────────────────────────────────────────────────

type Ctx = { pathname: string; modal: string | null }

interface Paso {
  /** Pantalla a la que se lleva al usuario al entrar al paso. */
  ruta?: string
  /** Pantallas donde vale el paso cuando no tiene `ruta` (p. ej. el expediente de un coche). */
  en?: RegExp
  /** Elemento a resaltar: nombre de `data-tour` (o selector CSS). Se usa el primero visible. Sin él, la tarjeta va al centro. */
  t?: string | string[]
  titulo: string
  texto: ReactNode
  /** Sin valor: avanza con "Siguiente". "click": al pulsar el elemento. Función: cuando se cumple. */
  avance?: 'click' | ((c: Ctx) => boolean)
  /** Atajo para quien prefiere que el tour haga la acción. */
  accion?: { label: string; run: () => void; si?: (c: Ctx) => boolean }
  /** Solo para quien cumple (permisos). */
  si?: (u: User) => boolean
}

interface Capitulo { key: string; titulo: string; icon: IconName; pasos: Paso[] }

const selector = (t: string) => (/^[.#[]/.test(t) ? t : `[data-tour="${t}"]`)
const visible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth
}
function buscar(t?: string | string[]): HTMLElement | null {
  for (const x of t ? [t].flat() : []) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(selector(x))).find(visible)
    if (el) return el
  }
  return null
}
const pulsar = (t: string) => () => buscar(t)?.click()
const tituloModal = () => document.querySelector('.modal-head h2')?.textContent ?? null
const cerrarModal = () => document.querySelector<HTMLElement>('.modal .close-btn')?.click()

/** Paso "pulsa el botón que abre este formulario". */
const abrir = (t: string, modal: string, titulo: string, texto: ReactNode, ruta: string): Paso => ({
  ruta, t, titulo, texto, avance: (c) => c.modal === modal, accion: { label: 'Abrir formulario', run: pulsar(t) },
})
/** Paso que explica el formulario abierto y sigue en cuanto se cierra. */
const formulario = (titulo: string, texto: ReactNode): Paso => ({
  titulo, texto: <>{texto} <b>Ciérralo sin guardar</b> para seguir.</>, avance: (c) => !c.modal,
  accion: { label: 'Cerrar formulario', run: cerrarModal, si: (c) => !!c.modal },
})
/** Paso "abre un renglón de la lista". */
const abrirFila = (ruta: string, titulo: string, texto: ReactNode): Paso => ({
  ruta, t: 'fila-0', titulo, texto, avance: (c) => c.pathname.startsWith(`${ruta}/`), accion: { label: 'Abrir el primero', run: pulsar('fila-0') },
})

const COCHE = /^\/flota\/[^/]+$/
const CONDUCTOR = /^\/conductores\/[^/]+$/

const INICIO: Capitulo = {
  key: 'inicio', titulo: 'Cómo moverte', icon: 'compass', pasos: [
    { t: ['menu', 'menu-movil'], titulo: 'El menú',
      texto: <>Aquí están los módulos que tu rol tiene habilitados. En el teléfono, los principales van en la barra de abajo y el resto en <b>Más</b>.</> },
    { t: 'perfil', titulo: 'Tu cuenta', texto: 'Tu nombre abre Ajustes: apariencia, preferencias y cerrar sesión.' },
    { t: 'start', titulo: 'Este tour', texto: 'Ábrelo cuando quieras desde aquí. Puedes recorrer todo o elegir un solo módulo.' },
  ],
}

const GUIAS: Record<string, Paso[]> = {
  dashboard: [
    { ruta: '/', t: 'indicadores', titulo: 'Tus números de un vistazo',
      texto: 'Lo cobrado en la semana y en el mes, el adeudo total de los conductores y cuántos avisos hay pendientes.' },
    { ruta: '/', t: 'dash-flota', titulo: 'Coches por estado',
      texto: <>Cuántos están rentados, disponibles o en taller. Pulsa una etiqueta y <b>Flota</b> se abre filtrada por ese estado.</> },
    { ruta: '/', t: 'avisos', titulo: 'Avisos internos',
      texto: 'Servicios vencidos, licencias por vencer, adeudos de más de una semana e incidentes abiertos. Cada aviso te lleva a la pantalla donde se resuelve.' },
    { ruta: '/', t: 'adeudos', titulo: 'Quién debe', texto: 'Los conductores con más saldo pendiente. Pulsa un nombre para abrir su expediente y registrar su pago.' },
    { ruta: '/', t: 'proximos-mant', titulo: 'Próximos servicios', texto: 'Los coches más cerca de los 10,000 km desde su último servicio.' },
  ],
  flota: [
    abrir('btn-nuevo-coche', 'Nuevo coche', 'Dar de alta un coche', <>Pulsa <b>Nuevo coche</b> para ver el formulario.</>, '/flota'),
    formulario('Datos del coche', <>Unidad, marca, modelo, placas, VIN, color, kilometraje y estado. El <b>ID de equipo Orión</b> lo liga al GPS.</>),
    { ruta: '/flota', t: 'pestanas', titulo: 'Filtra por estado', texto: 'Todos, rentados, disponibles o en taller; el número dice cuántos hay de cada uno.' },
    { ruta: '/flota', t: 'filtros', titulo: 'Busca y combina filtros',
      texto: <>Busca por unidad, placas o VIN y filtra por <b>servicio vencido</b> o <b>con adeudo</b>. A la derecha cambias entre <b>Tabla</b> y <b>Tarjetas</b>.</> },
    abrirFila('/flota', 'Abre un coche', 'Pulsa cualquier coche de la lista para abrir su expediente.'),
    { en: COCHE, t: 'acciones', titulo: 'Qué puedes hacer con él',
      texto: <><b>Rentar</b> si está disponible o <b>Finalizar renta</b> si está rentado, <b>Enviar a taller</b> / <b>Marcar disponible</b>, <b>Editar</b> sus datos o <b>Dar de baja</b>. Solo aparecen los botones que aplican a su estado.</> },
    { en: COCHE, t: 'pestanas', titulo: 'Su expediente completo',
      texto: 'Historial con todo lo que le ha pasado, kilometraje, servicios y llantas, incidentes e inspecciones con fotos. Cada pestaña tiene su botón para registrar algo nuevo.' },
  ],
  conductores: [
    { ruta: '/conductores', t: 'btn-nuevo-conductor', titulo: 'Registrar un conductor',
      texto: 'Nombre, teléfono, CURP, domicilio, licencia con su vigencia, referencias y documentos. Si la CURP ya existe, te avisa.' },
    { ruta: '/conductores', t: 'filtros', titulo: 'Encuentra a quien buscas',
      texto: 'Busca por nombre, CURP o teléfono. En la tabla se marcan las licencias vencidas o por vencer y los documentos que faltan.' },
    { ruta: '/conductores', t: 'tab-adeudo', titulo: '¿Quién debe?', texto: <>Pulsa <b>Con adeudo</b> para ver solo a quien tiene saldo pendiente.</>, avance: 'click' },
    abrirFila('/conductores', 'Abre un expediente', 'Pulsa un conductor.'),
    { en: CONDUCTOR, t: 'indicadores', titulo: 'Su situación', texto: 'Saldo, total pagado, coche que trae y vigencia de su licencia.' },
    { en: CONDUCTOR, t: 'acciones', titulo: 'Acciones del conductor',
      texto: <><b>Registrar pago</b> si tiene renta activa (o <b>Asignar coche</b> si no), <b>Agregar cargo</b> por daños, multas u otros, y <b>Editar</b> su expediente.</> },
    { en: CONDUCTOR, t: 'tab-estado', titulo: 'Estado de cuenta',
      texto: <>Pulsa <b>Estado de cuenta mensual</b>: se imprime o se guarda como PDF para entregárselo.</>, avance: 'click' },
  ],
  rentas: [
    abrir('btn-nueva-renta', 'Nueva renta', 'Rentar un coche', <>Pulsa <b>Nueva renta</b>.</>, '/rentas'),
    formulario('Así se asigna',
      <>Elige un coche <b>disponible</b> y un conductor sin renta activa, la fecha, la tarifa semanal y el depósito; el km de entrega se toma del coche. Al guardar, el coche pasa a <b>Rentado</b> y puedes seguir directo a la inspección de entrega con fotos.</>),
    { ruta: '/rentas', t: 'acciones-fila', titulo: 'Cada renta activa',
      texto: <><b>Pago</b> registra lo que entregó el conductor, <b>Editar</b> cambia tarifa o depósito y <b>Finalizar</b> pide el km de devolución y qué pasa con el depósito: se devuelve, se aplica al adeudo o queda retenido.</> },
    { ruta: '/rentas', t: 'tab-finalizada', titulo: 'Rentas pasadas', texto: <>Pulsa <b>Finalizadas</b>: el historial, con el saldo que haya quedado pendiente.</>, avance: 'click' },
  ],
  cobranza: [
    { ruta: '/cobranza', t: 'btn-generar-cargos', titulo: 'Cargos de la semana',
      texto: 'Crea el cargo semanal de cada renta activa hasta hoy. Si ya estaban, no duplica nada.' },
    abrir('btn-registrar-pago', 'Registrar pago', 'Registrar un pago', <>Pulsa <b>Registrar pago</b>.</>, '/cobranza'),
    formulario('Lo que ya se cobró',
      <>Elige la renta, la fecha, el monto y el método: <b>efectivo</b> o <b>transferencia</b>. Anota el folio o quién recibió el efectivo. No hay cobro en línea: solo se registra lo que ya se pagó.</>),
    { ruta: '/cobranza', t: 'indicadores', titulo: 'Cómo va la cobranza',
      texto: 'Cobrado en la semana y en el mes, adeudo total (con los saldos a favor y los depósitos en garantía aparte) y el histórico.' },
    { ruta: '/cobranza', t: 'tab-pagos', titulo: 'Historial de pagos', texto: <>Pulsa <b>Pagos</b>.</>, avance: 'click' },
    { ruta: '/cobranza', t: 'pagos', titulo: 'Pagos registrados',
      texto: <>Exporta el histórico a Excel con el botón de arriba. Un pago mal capturado se <b>Cancela</b> con un motivo: queda tachado y en la auditoría, no se borra.</> },
    { ruta: '/cobranza', t: 'tab-cargos', titulo: 'Cargos recientes',
      texto: <>Pulsa <b>Cargos recientes</b>: los de esta semana y la anterior. Un cargo equivocado se <b>Corrige</b> desde aquí.</>, avance: 'click' },
  ],
  mantenimiento: [
    { ruta: '/mantenimiento', t: 'alertas-km', titulo: 'Alerta de 10,000 km',
      texto: <>Cada barra son los km recorridos desde el último servicio que reinicia el contador. A los 9,000 pasa a <b>Próximo</b> y a los 10,000 a <b>Vencido</b>.</> },
    { ruta: '/mantenimiento', t: 'btn-registrar-km', titulo: 'Captura el odómetro',
      texto: 'Registra una lectura de km de cualquier coche. Las entregas y recepciones de renta ya guardan la suya.' },
    abrir('btn-registrar-servicio', 'Registrar servicio', 'Registra un servicio', <>Pulsa <b>Registrar servicio</b>.</>, '/mantenimiento'),
    formulario('Servicio y llantas',
      <>Coche, tipo de servicio, km, costo y taller. Si el tipo reinicia el contador, la alerta vuelve a cero; un cambio de llantas pide posiciones, marca y año DOT.</>),
    { ruta: '/mantenimiento', t: 'pestanas', titulo: 'Historial y catálogo',
      texto: <><b>Servicios</b> y <b>Registros de km</b> muestran lo capturado; en <b>Catálogo</b> se definen los tipos de servicio y cuáles reinician el contador.</> },
  ],
  incidentes: [
    { ruta: '/incidentes', t: 'btn-registrar-incidente', titulo: 'Registrar un incidente',
      texto: 'Choque, daño u otro: coche, conductor, fecha, responsable, costo estimado, descripción y fotos.' },
    { ruta: '/incidentes', t: 'incidente-0', titulo: 'Cada incidente',
      texto: <>Si el responsable es el conductor, <b>Cobrar al conductor</b> le agrega el cargo a su cuenta. <b>Editar</b> permite sumar fotos y <b>Cerrar</b> lo archiva cuando ya se resolvió.</> },
    { ruta: '/incidentes', t: 'pestanas', titulo: 'Abiertos y cerrados', texto: 'Empiezas viendo los abiertos; un incidente cerrado se puede reabrir.' },
  ],
  inspecciones: [
    { ruta: '/inspecciones', t: 'btn-nueva-inspeccion', titulo: 'Nueva inspección', texto: <>Pulsa <b>Nueva inspección</b>.</>,
      avance: (c) => c.pathname === '/inspecciones/nueva', accion: { label: 'Abrir', run: pulsar('btn-nueva-inspeccion') } },
    { ruta: '/inspecciones/nueva', t: 'form-inspeccion', titulo: 'Junto al coche',
      texto: <>Elige el coche, si es <b>Entrega</b> o <b>Recepción</b>, el km y el combustible, y toca cada recuadro para tomar las fotos de cada ángulo. Pensada para el teléfono o el iPad.</> },
    { ruta: '/inspecciones', t: 'recientes', titulo: 'Las más recientes', texto: 'Pulsa un renglón para ver abajo la galería de ese coche.' },
    { ruta: '/inspecciones', t: 'galeria', titulo: 'Salida contra regreso',
      texto: 'Elige un coche: cada renta aparece con cómo se entregó y cómo regresó, lado a lado.' },
  ],
  finanzas: [
    { ruta: '/finanzas', t: 'periodo', titulo: 'Elige el periodo', texto: 'Últimos 12 meses, el año, el histórico o un mes en particular: toda la pantalla se recalcula.' },
    { ruta: '/finanzas', t: 'indicadores', titulo: 'Resultado del periodo',
      texto: 'Ingresos cobrados contra gastos operativos, y la utilidad con su margen. La compra de coches va aparte: es inversión, no gasto.' },
    { ruta: '/finanzas', t: 'tab-coches', titulo: '¿Qué coche deja más?', texto: <>Pulsa <b>Rentabilidad por coche</b>.</>, avance: 'click' },
    { ruta: '/finanzas', t: 'rentabilidad', titulo: 'Rentabilidad por coche',
      texto: 'Utilidad, utilidad por mes, ocupación y cuánto de su costo ya recuperó. Pulsa un encabezado para ordenar, y exporta a Excel.' },
    { ruta: '/finanzas', t: 'btn-registrar-gasto', titulo: 'Registra los gastos',
      texto: 'Seguros, reparaciones, sueldos… Asígnalo a un coche o déjalo como gasto general del negocio.' },
  ],
  orion: [
    { ruta: '/orion', t: 'indicadores', titulo: 'La flota en este momento',
      texto: 'Cuántos coches van en movimiento, detenidos con el motor encendido, detenidos o sin señal. Se actualiza cada minuto.' },
    { ruta: '/orion', t: 'mapa', titulo: 'Mapa y tabla',
      texto: <>Pulsa <b>Ver</b> en un renglón para centrar ese coche en el mapa. El <b>km Orión</b> va junto al <b>km capturado</b> para detectar diferencias.</> },
    { ruta: '/orion', t: 'filtro-gps', titulo: 'Filtra por estado', texto: 'Por ejemplo, solo los que están sin señal.' },
  ],
  usuarios: [
    { ruta: '/usuarios', t: 'btn-nuevo-usuario', titulo: 'Dar acceso a alguien', si: (u) => can(u, 'usuarios'),
      texto: 'Crea la cuenta con su correo y su rol. El rol es un punto de partida: cada permiso se prende o se apaga por persona.' },
    { ruta: '/usuarios', t: 'tabla-usuarios', titulo: 'El equipo', si: (u) => can(u, 'usuarios'),
      texto: 'Pulsa un usuario para cambiar su rol, sus permisos o su contraseña, o para activar o desactivar su cuenta.' },
    { ruta: '/usuarios', t: 'tab-auditoria', titulo: 'Bitácora de cambios', si: (u) => can(u, 'usuarios') && can(u, 'auditoria'),
      texto: <>Pulsa <b>Bitácora de cambios</b>: quién hizo cada alta, pago, cancelación o corrección, y cuándo.</>, avance: 'click' },
  ],
  docs: [
    { ruta: '/documentacion', t: 'documentacion', titulo: 'Documentación',
      texto: 'Las reglas completas de cada módulo: cómo se calculan saldos y alertas y qué permite cada permiso. Consúltala cuando tengas una duda puntual.' },
  ],
}

// ── Overlay ────────────────────────────────────────────────────────────

type Rect = { top: number; left: number; width: number; height: number }
const PAD = 6

export function Tour({ onClose }: { onClose: () => void }) {
  const { user, status } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const caps = useMemo<Capitulo[]>(() =>
    [INICIO, ...modulesFor(user).map((m) => ({ key: m.key, titulo: m.label, icon: m.icon, pasos: GUIAS[m.key] ?? [] }))]
      .map((c) => ({ ...c, pasos: c.pasos.filter((p) => !p.si || (user && p.si(user))) }))
      .filter((c) => c.pasos.length), [user])
  const pasos = useMemo(() => caps.flatMap((c, cap) => c.pasos.map((p) => ({ ...p, cap }))), [caps])
  const inicioDe = (cap: number) => pasos.findIndex((p) => p.cap === cap)
  const actual = caps.findIndex((c) => {
    const m = modulesFor(user).find((x) => x.key === c.key)
    return m && (m.path === '/' ? pathname === '/' : pathname.startsWith(m.path))
  })

  const [fase, setFase] = useState<'inicio' | 'paso' | 'fin'>('inicio')
  const [i, setI] = useState(0)
  const [solo, setSolo] = useState<number | null>(null) // un solo capítulo, o null = recorrido completo
  const dir = useRef<1 | -1>(1)
  const desde = solo == null ? 0 : inicioDe(solo)
  const hasta = solo == null ? pasos.length - 1 : desde + caps[solo].pasos.length - 1

  const paso = fase === 'paso' ? pasos[i] : null
  const enRuta = !paso?.ruta || paso.ruta === pathname
  const enPantalla = enRuta && (!paso?.en || paso.en.test(pathname))

  const [rect, setRect] = useState<Rect | null>(null)
  const [modal, setModal] = useState<string | null>(null)
  const ctx: Ctx = { pathname, modal }

  const ir = (j: number, d: 1 | -1) => {
    dir.current = d
    if (j > hasta) setFase('fin')
    else setI(Math.max(j, desde))
  }
  const siguiente = () => ir(i + 1, 1)
  const anterior = () => {
    // Saltar hacia atrás los pasos que ya están cumplidos (si no, avanzarían solos de nuevo).
    let j = i - 1
    while (j > desde && typeof pasos[j].avance === 'function' && (pasos[j].avance as (c: Ctx) => boolean)(ctx)) j--
    ir(j, -1)
  }
  const empezar = (cap: number | null) => {
    setSolo(cap)
    dir.current = 1
    setI(cap == null ? 0 : inicioDe(cap))
    setFase('paso')
  }

  // Llevar a la pantalla del paso (solo al entrar; después el usuario puede navegar como pida el paso).
  useEffect(() => {
    if (paso?.ruta && paso.ruta !== pathname) navigate(paso.ruta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso])

  // Medir el elemento resaltado y ver si hay un formulario abierto, continuamente.
  // Antes de pintar: si no, el primer cuadro del paso nuevo sale sobre el elemento del anterior.
  useLayoutEffect(() => {
    if (!paso) return
    const medir = () => {
      const m = tituloModal()
      setModal((x) => (x === m ? x : m))
      const r = enPantalla ? buscar(paso.t)?.getBoundingClientRect() : undefined
      setRect((prev) => !r ? null
        : prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height })
    }
    medir()
    const t = setInterval(medir, 150)
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    return () => { clearInterval(t); window.removeEventListener('scroll', medir, true); window.removeEventListener('resize', medir) }
  }, [paso, enPantalla])

  // Llevar el elemento a la vista cuando aparece.
  const encontrado = !!rect
  useEffect(() => {
    if (!encontrado || !paso) return
    const el = buscar(paso.t)
    const r = el?.getBoundingClientRect()
    // Lo que va en el menú o en las barras no se mueve con el scroll.
    if (!el || !r || el.closest('.sidebar, .topbar, .tabbar') || (r.top >= 70 && r.bottom <= window.innerHeight - 80)) return
    // Si no cabe completo, que se vea su parte de arriba (ahí suelen ir sus botones).
    if (r.height > window.innerHeight - 220) window.scrollBy({ top: r.top - 80, behavior: 'smooth' })
    else el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [encontrado, paso])

  // Sin elemento que resaltar (no hay datos o el rol no ve ese botón): saltar el paso en la dirección en que se iba.
  // Mientras se busca, la tarjeta no se muestra (ver `buscando`), así el salto no parece un clic que avanzó dos pasos.
  useEffect(() => {
    if (!paso?.t || encontrado || status !== 'listo' || !enRuta) return
    const t = setTimeout(() => (i + dir.current < desde ? ir(i + 1, 1) : ir(i + dir.current, dir.current)), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, encontrado, status, enRuta, i])

  // Avance al pulsar el elemento resaltado.
  useEffect(() => {
    if (paso?.avance !== 'click') return
    const onClick = (e: MouseEvent) => {
      if (buscar(paso.t)?.contains(e.target as Node)) setTimeout(siguiente, 250)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  })

  // Avance cuando se cumple la condición del paso.
  const cumple = !!paso && status === 'listo' && typeof paso.avance === 'function' && paso.avance(ctx)
  useEffect(() => {
    if (!cumple) return
    const t = setTimeout(siguiente, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cumple, i])

  // Teclado: Esc sale (si no hay un formulario abierto, que se cierra primero), flechas avanzan en pasos de lectura.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal') || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) return
      if (e.key === 'Escape') onClose()
      else if (paso && e.key === 'ArrowRight' && !paso.avance) siguiente()
      else if (paso && e.key === 'ArrowLeft' && i > desde) anterior()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Tamaño real de la tarjeta y de la ventana, para colocarla sin que se salga.
  const tarjeta = useRef<HTMLDivElement>(null)
  const [tam, setTam] = useState({ w: 380, h: 200 })
  const [vista, setVista] = useState({ w: window.innerWidth, h: window.innerHeight })
  useLayoutEffect(() => {
    const el = tarjeta.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setTam((t) => (Math.abs(r.width - t.w) > 1 || Math.abs(r.height - t.h) > 1 ? { w: r.width, h: r.height } : t))
    })
    ro.observe(el)
    const onResize = () => setVista({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize) }
  }, [fase])
  useEffect(() => { tarjeta.current?.focus({ preventScroll: true }) }, [fase, i])

  // ── Bienvenida y final ──
  if (fase !== 'paso') {
    const sig = solo != null && solo + 1 < caps.length ? solo + 1 : null
    return (
      <div className="tour-backdrop">
        <div ref={tarjeta} className="tour-panel" role="dialog" aria-labelledby="tour-title" tabIndex={-1}>
          <span className="tour-badge"><Icon name="compass" /></span>
          {fase === 'inicio' ? <>
            <h2 id="tour-title">Tour guiado</h2>
            <p>Te llevamos por cada pantalla y te señalamos qué hace cada botón. Algunos pasos te piden pulsar algo; los formularios se abren solo para conocerlos y <b>nada se guarda</b>.</p>
            <div className="tour-caps">
              {caps.map((c, n) => (
                <button key={c.key} className={n === actual ? 'here' : ''} onClick={() => empezar(n)}>
                  <Icon name={c.icon} /><span>{c.titulo}</span>
                  <small>{n === actual ? 'Estás aquí' : `${c.pasos.length} ${c.pasos.length === 1 ? 'paso' : 'pasos'}`}</small>
                </button>
              ))}
            </div>
            <p className="tour-note">Elige un módulo para ver solo ese, o haz el recorrido completo.</p>
            <div className="tour-panel-actions">
              <button className="btn btn-ghost" onClick={onClose}>Ahora no</button>
              {actual > 0 && <button className="btn" onClick={() => empezar(actual)}>Solo {caps[actual].titulo}</button>}
              <button className="btn btn-primary" onClick={() => empezar(null)}>Recorrido completo<Icon name="forward" /></button>
            </div>
          </> : <>
            <h2 id="tour-title">{solo != null ? `Listo: ${caps[solo].titulo}` : 'Eso es todo'}</h2>
            <p>{solo != null ? 'Ya sabes qué hace cada botón de esta pantalla.' : 'Ya conoces todos tus módulos.'} Vuelve a abrir el tour cuando quieras con el botón <b>Tour guiado</b> o desde Ajustes.</p>
            <div className="tour-panel-actions">
              <button className="btn btn-ghost" onClick={() => setFase('inicio')}>Elegir otro módulo</button>
              {sig != null && <button className="btn" onClick={() => empezar(sig)}>Seguir con {caps[sig].titulo}</button>}
              <button className="btn btn-primary" onClick={onClose}>Terminar</button>
            </div>
          </>}
        </div>
      </div>
    )
  }

  if (!paso) return null
  const cap = caps[paso.cap]
  const accion = paso.accion && (!paso.accion.si || paso.accion.si(ctx)) ? paso.accion : null
  const conObjetivo = !!rect && !modal
  const espera = !!paso.avance // el paso avanza cuando el usuario hace algo
  const movil = vista.w < 640
  // Progreso dentro del módulo; en el recorrido completo, además, qué módulo va.
  const n = i - inicioDe(paso.cap) + 1
  const total = cap.pasos.length

  // Posición de la tarjeta: debajo del elemento, si no cabe arriba. Con un formulario abierto, a un lado.
  let pos: CSSProperties
  if (modal) pos = movil ? { left: 8, right: 8, top: 8 } : { left: 24, bottom: 24, width: 360 }
  else if (movil) pos = rect && rect.top > vista.h * 0.45 ? { left: 12, right: 12, top: 12 } : { left: 12, right: 12, bottom: 12 }
  else if (!rect) pos = { left: (vista.w - tam.w) / 2, top: (vista.h - tam.h) / 2 }
  else {
    const left = Math.min(Math.max(rect.left, 16), vista.w - tam.w - 16)
    const abajo = rect.top + rect.height + PAD + 12
    const arriba = rect.top - PAD - 12 - tam.h
    const derecha = rect.left + rect.width + PAD + 12
    const enMedio = Math.min(Math.max(rect.top, 16), vista.h - tam.h - 16)
    pos = abajo + tam.h < vista.h - 12 ? { left, top: abajo }
      : arriba > 12 ? { left, top: arriba }
        // Elemento alto (p. ej. el menú lateral): a su derecha si cabe, para no taparlo.
        : derecha + tam.w < vista.w - 16 ? { left: derecha, top: enMedio }
          : { left, top: Math.max(12, vista.h - tam.h - 16) }
  }
  const hueco = rect && { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
  // Buscando el elemento del paso (o navegando a su pantalla): la tarjeta espera oculta; si no aparece, el paso se salta sin verse.
  const buscando = !!paso.t && !rect && !modal && status === 'listo'
  if (buscando) pos = { ...pos, visibility: 'hidden' }

  return (
    <div className="tour">
      {/* Velo: cuatro paneles alrededor del elemento (o pantalla completa). Con un formulario abierto, lo oscurece el propio formulario. */}
      {!modal && (conObjetivo ? <Velo r={hueco!} /> : <div className="tour-veil" style={{ inset: 0 }} />)}
      {/* En pasos de lectura el elemento se ve pero no se puede pulsar, para no salir del recorrido. */}
      {conObjetivo && !espera && <div className="tour-block" style={hueco!} />}
      {conObjetivo && (
        <div className="tour-ring" style={hueco!}>
          {espera && !accion && <span className="tour-dot" />}
        </div>
      )}

      <div ref={tarjeta} className={`tour-pop ${movil ? "full" : ""} ${modal && movil ? "compact" : ""}`} style={pos} role="dialog" aria-labelledby="tour-title" tabIndex={-1}>
        <div className="tour-head">
          <span className="tour-chapter"><Icon name={cap.icon} />{cap.titulo}{solo == null && <span className="tour-of">{paso.cap + 1} de {caps.length}</span>}</span>
          {solo == null && paso.cap < caps.length - 1 && (
            <button className="link tour-skip" onClick={() => ir(inicioDe(paso.cap + 1), 1)}>Saltar módulo</button>
          )}
          <button className="tour-x" onClick={onClose} aria-label="Salir del tour"><Icon name="close" /></button>
        </div>
        <h2 id="tour-title">{paso.titulo}</h2>
        <p>{paso.texto}</p>
        <div className="tour-actions">
          <span className="tour-progress" aria-label={`Paso ${n} de ${total}`}>
            <span className="tour-bar"><span style={{ width: `${(n / total) * 100}%` }} /></span>
            {n}/{total}
          </span>
          <span className="actions">
            {i > desde && !modal && <button className="btn btn-sm btn-ghost" onClick={anterior} aria-label="Paso anterior"><Icon name="back" /></button>}
            {accion ? <button className="btn btn-sm btn-primary" onClick={accion.run}>{accion.label}</button>
              : !espera ? <button className="btn btn-sm btn-primary" onClick={siguiente}>{i === hasta ? 'Terminar' : n === total ? 'Siguiente módulo' : 'Siguiente'}</button>
                : <><span className="tour-hint">Hazlo en la pantalla</span>{paso.avance === 'click'
                  // Pulsarlo por el usuario: el paso siguiente suele depender de lo que abre (una pestaña).
                  ? <button className="btn btn-sm btn-ghost" onClick={() => buscar(paso.t)?.click()}>Hazlo por mí</button>
                  : <button className="btn btn-sm btn-ghost" onClick={siguiente}>Saltar</button>}</>}
          </span>
        </div>
      </div>
    </div>
  )
}

function Velo({ r }: { r: Rect }) {
  const t = Math.max(0, r.top), l = Math.max(0, r.left), b = r.top + r.height, d = r.left + r.width
  return <>
    <div className="tour-veil" style={{ top: 0, left: 0, right: 0, height: t }} />
    <div className="tour-veil" style={{ top: b, left: 0, right: 0, bottom: 0 }} />
    <div className="tour-veil" style={{ top: t, left: 0, width: l, height: b - t }} />
    <div className="tour-veil" style={{ top: t, left: d, right: 0, height: b - t }} />
  </>
}
