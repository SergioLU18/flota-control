import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { StoreProvider, useStore } from './data/store'
import { MODULES, canSee } from './data/modules'
import Layout from './components/Layout'
import { PageSkeleton } from './components/ui'
import Login, { Pending, Splash } from './pages/Login'
import Dashboard from './pages/Dashboard'
import Vehicles from './pages/Vehicles'
import VehicleDetail from './pages/VehicleDetail'
import Insurance from './pages/Insurance'
import Drivers from './pages/Drivers'
import DriverDetail from './pages/DriverDetail'
import Rentals from './pages/Rentals'
import Billing from './pages/Billing'
import Maintenance from './pages/Maintenance'
import Incidents from './pages/Incidents'
import Inspections, { NewInspection } from './pages/Inspections'
import Orion from './pages/Orion'
import Users from './pages/Users'
import AuditPage from './pages/AuditPage'
import Docs from './pages/Docs'
import Finance from './pages/Finance'
import Settings from './pages/Settings'
import './styles.css'
import './lib/theme'

// Páginas de cada módulo (la llave es la de MODULES en data/modules.ts). Quien no tiene el "ver" del módulo
// no tiene la ruta: entrar por URL lo regresa al dashboard.
const PAGES: Record<string, { path: string; element: ReactNode }[]> = {
  dashboard: [{ path: '', element: <Dashboard /> }],
  flota: [{ path: 'flota', element: <Vehicles /> }, { path: 'flota/:id', element: <VehicleDetail /> }],
  seguros: [{ path: 'seguros', element: <Insurance /> }],
  conductores: [{ path: 'conductores', element: <Drivers /> }, { path: 'conductores/:id', element: <DriverDetail /> }],
  rentas: [{ path: 'rentas', element: <Rentals /> }],
  cobranza: [{ path: 'cobranza', element: <Billing /> }],
  mantenimiento: [{ path: 'mantenimiento', element: <Maintenance /> }],
  incidentes: [{ path: 'incidentes', element: <Incidents /> }],
  inspecciones: [{ path: 'inspecciones', element: <Inspections /> }, { path: 'inspecciones/nueva', element: <NewInspection /> }],
  finanzas: [{ path: 'finanzas', element: <Finance /> }],
  orion: [{ path: 'orion', element: <Orion /> }],
  usuarios: [{ path: 'usuarios', element: <Users /> }],
  bitacora: [{ path: 'bitacora', element: <AuditPage /> }],
  docs: [{ path: 'documentacion', element: <Docs /> }],
}

function App() {
  const { user, status, loadError, hasSession } = useStore()
  if (status === 'sin-sesion') return <Login />
  if (status === 'inactivo') return <Pending />
  if (status === 'error') return <Splash error={loadError} />
  if (status !== 'listo' || !user) {
    if (!hasSession) return null // se está leyendo la sesión guardada
    // Con sesión: menú y esqueleto del módulo mientras llegan el perfil y los datos.
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<PageSkeleton />} />
        </Route>
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        {MODULES.filter((m) => canSee(user, m)).flatMap((m) => (PAGES[m.key] ?? []).map((p) =>
          p.path ? <Route key={p.path} path={p.path} element={p.element} /> : <Route key="index" index element={p.element} />))}
        <Route path="ajustes" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  )
}

// HashRouter: el build es 100 % estático y se puede abrir en cualquier hosting sin configurar rutas.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </StoreProvider>
  </StrictMode>,
)
