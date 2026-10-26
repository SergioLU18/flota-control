// Ajustes del usuario, al estilo de la app Ajustes de iOS. Las preferencias se guardan en este dispositivo.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../data/store'
import { PageHeader, StatusBadge } from '../components/ui'
import { Icon, type IconName } from '../components/Icon'
import { useTheme, type ThemePref } from '../lib/theme'
import { FLEET_VIEW_KEY } from './Vehicles'

/** Evento que escucha components/Layout.tsx para lanzar el tour desde aquí. */
export const START_TOUR = 'flota:tour'

type FleetView = 'auto' | 'tabla' | 'grid'
const readFleetView = (): FleetView => {
  try {
    const v = localStorage.getItem(FLEET_VIEW_KEY)
    return v === 'tabla' || v === 'grid' ? v : 'auto'
  } catch { return 'auto' }
}

export default function Settings() {
  const { user, logout } = useStore()
  const [theme, setTheme] = useTheme()
  const [fleetView, setFleetViewState] = useState<FleetView>(readFleetView)
  const setFleetView = (v: FleetView) => {
    setFleetViewState(v)
    try { v === 'auto' ? localStorage.removeItem(FLEET_VIEW_KEY) : localStorage.setItem(FLEET_VIEW_KEY, v) } catch { /* sin almacenamiento */ }
  }
  if (!user) return null

  return (
    <>
      <PageHeader title="Ajustes" />

      <section className="settings-group profile">
        <span className="avatar avatar-lg" aria-hidden>{user.name.charAt(0)}</span>
        <div className="profile-text">
          <strong>{user.name}</strong>
          <span className="muted small">{user.email}</span>
        </div>
        <StatusBadge value={user.role} />
      </section>

      <Group title="Apariencia">
        <div className="theme-picker" role="radiogroup" aria-label="Apariencia">
          {([['light', 'Claro'], ['dark', 'Oscuro'], ['auto', 'Automático']] as [ThemePref, string][]).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={theme === k} className={`theme-option ${theme === k ? 'active' : ''}`} onClick={() => setTheme(k)}>
              <span className={`theme-preview theme-preview-${k}`} aria-hidden><span /><span /><span /></span>
              <span>{label}</span>
              <span className="theme-check" aria-hidden>{theme === k && <Icon name="check" />}</span>
            </button>
          ))}
        </div>
      </Group>
      <p className="settings-note">Automático cambia entre claro y oscuro según la configuración de tu dispositivo.</p>

      <Group title="Flota">
        <Row icon="car" color="blue" label="Vista de la lista">
          <div className="segmented" role="group" aria-label="Vista de la lista de flota">
            {([['auto', 'Automática'], ['tabla', 'Tabla'], ['grid', 'Tarjetas']] as [FleetView, string][]).map(([k, label]) => (
              <button key={k} className={fleetView === k ? 'active' : ''} aria-pressed={fleetView === k} onClick={() => setFleetView(k)}>{label}</button>
            ))}
          </div>
        </Row>
      </Group>
      <p className="settings-note">Automática muestra tarjetas en el celular y tabla en pantallas grandes.</p>

      <Group title="Ayuda">
        <Row icon="compass" color="orange" label="Tour guiado" onClick={() => window.dispatchEvent(new Event(START_TOUR))} chevron />
        <Row icon="book" color="gray" label="Documentación" to="/documentacion" chevron />
      </Group>

      <Group>
        <button className="settings-row settings-danger" onClick={logout}>Cerrar sesión</button>
      </Group>
      <p className="settings-note center">Tus preferencias se guardan en este dispositivo.</p>
    </>
  )
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <>
      {title && <h2 className="settings-title">{title}</h2>}
      <section className="settings-group">{children}</section>
    </>
  )
}

function Row({ icon, color, label, children, onClick, to, chevron }: {
  icon: IconName; color: 'blue' | 'orange' | 'gray' | 'green' | 'red'; label: string; children?: ReactNode; onClick?: () => void; to?: string; chevron?: boolean
}) {
  const inner = (
    <>
      <span className={`row-icon row-icon-${color}`}><Icon name={icon} /></span>
      <span className="row-label">{label}</span>
      {children && <span className="row-value">{children}</span>}
      {chevron && <Icon name="forward" className="icon row-chevron" />}
    </>
  )
  if (to) return <Link to={to} className="settings-row">{inner}</Link>
  if (onClick) return <button className="settings-row" onClick={onClick}>{inner}</button>
  return <div className="settings-row">{inner}</div>
}
