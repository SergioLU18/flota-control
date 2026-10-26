import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MODULES } from '../data/modules'
import { useStore } from '../data/store'
import { StatusBadge } from './ui'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { TODAY, fecha } from '../lib/format'

export default function Layout() {
  const { user, logout } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0) }, [loc.pathname])

  const items = MODULES.filter((m) => user && m.roles.includes(user.role))

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <Logo className="brand-mark" />
          <div>
            <strong>Flota Control</strong>
            <small>Flota y rentas</small>
          </div>
        </div>
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
          <div className="who">
            {user ? <><strong>{user.name}</strong><StatusBadge value={user.role} /></> : <span className="sk" style={{ width: '60%' }} />}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Salir</button>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <div className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">☰</button>
          <span className="demo-pill">Hoy es {fecha(TODAY)}</span>
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
