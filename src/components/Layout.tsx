import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MODULES } from '../data/modules'
import { useStore } from '../data/store'
import { StatusBadge } from './ui'
import { Icon } from './Icon'
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
          <span className="brand-mark">B</span>
          <div>
            <strong>Flota Control</strong>
            <small>Flota y rentas</small>
          </div>
        </div>
        <nav>
          {items.map((m) => (
            <NavLink key={m.key} to={m.path} end={m.path === '/'}>
              <Icon name={m.icon} className="nav-icon" />{m.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <strong>{user?.name}</strong>
            {user && <StatusBadge value={user.role} />}
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
