import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MODULES } from '../data/modules'
import { useStore } from '../data/store'
import { Icon } from './Icon'
import { Brand } from './Logo'
import { Tour } from './Tour'
import { START_TOUR } from '../pages/Settings'
import { TODAY, fecha } from '../lib/format'

// Accesos de la barra inferior en móvil (los demás módulos quedan en "Más", que abre el menú completo).
const TABS: [key: string, label: string][] = [['dashboard', 'Inicio'], ['flota', 'Flota'], ['rentas', 'Rentas'], ['cobranza', 'Cobranza']]

const moduleOf = (pathname: string) => MODULES.find((m) => (m.path === '/' ? pathname === '/' : pathname.startsWith(m.path)))

export default function Layout() {
  const { user } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [touring, setTouring] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const endTour = useCallback(() => setTouring(false), [])
  const loc = useLocation()
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  // Como en iOS: al pasar el título grande, la barra superior muestra el título chico.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // Ajustes también puede lanzar el tour.
  useEffect(() => {
    const start = () => setTouring(true)
    window.addEventListener(START_TOUR, start)
    return () => window.removeEventListener(START_TOUR, start)
  }, [])

  const items = MODULES.filter((m) => user && m.roles.includes(user.role))
  const current = moduleOf(loc.pathname)
  const tabs = TABS.map(([key, label]) => ({ m: MODULES.find((m) => m.key === key)!, label })).filter(({ m }) => items.includes(m))
  const inTabs = tabs.some(({ m }) => m === current)
  const inSettings = loc.pathname.startsWith('/ajustes')

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <Brand sub="Flota y rentas" />
        <nav aria-busy={!user}>
          {user
            ? items.map((m) => (
              <NavLink key={m.key} to={m.path} end={m.path === '/'}>
                <Icon name={m.icon} className="nav-icon" />{m.label}
              </NavLink>
            ))
            // Aún no se conoce el rol (y con él, qué módulos ve): marcadores del tamaño de cada opción.
            : Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="nav-skeleton"><span className="sk sk-icon" /><span className="sk" style={{ width: `${55 + ((i * 23) % 35)}%` }} /></span>
            ))}
        </nav>
        <div className="sidebar-foot">
          {/* Como el perfil en Ajustes de iOS: tocar tu nombre abre Ajustes (apariencia, preferencias, cerrar sesión). */}
          <NavLink to="/ajustes" className="who" aria-label="Ajustes">
            <span className="avatar" aria-hidden>{user?.name.charAt(0) ?? ''}</span>
            {user
              ? <span className="who-text"><strong>{user.name}</strong><span className="small muted">Ajustes</span></span>
              : <span className="sk" style={{ width: '60%' }} />}
            <Icon name="forward" className="icon who-chevron" />
          </NavLink>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <div className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <span className="topbar-title" aria-hidden>{inSettings ? 'Ajustes' : current?.label}</span>
          <span className="demo-pill">{fecha(TODAY)}</span>
          {user && (
            <button className="btn btn-sm btn-tinted tour-btn" data-tour="start" onClick={() => setTouring(true)}>
              <Icon name="compass" /><span className="tour-label">Tour guiado</span>
            </button>
          )}
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>

      {user && (
        <nav className="tabbar" aria-label="Accesos rápidos">
          {tabs.map(({ m, label }) => (
            <NavLink key={m.key} to={m.path} end={m.path === '/'}>
              <Icon name={m.icon} className="tab-icon" /><span>{label}</span>
            </NavLink>
          ))}
          <button className={menuOpen || inSettings || (!inTabs && current) ? 'active' : ''} onClick={() => setMenuOpen(true)}>
            <Icon name="more" className="tab-icon" /><span>Más</span>
          </button>
        </nav>
      )}
      {touring && user && <Tour onClose={endTour} />}
    </div>
  )
}
