import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { StoreProvider, useStore } from './data/store'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Vehicles from './pages/Vehicles'
import VehicleDetail from './pages/VehicleDetail'
import Drivers from './pages/Drivers'
import DriverDetail from './pages/DriverDetail'
import Rentals from './pages/Rentals'
import Billing from './pages/Billing'
import Maintenance from './pages/Maintenance'
import Incidents from './pages/Incidents'
import Inspections, { NewInspection } from './pages/Inspections'
import Orion from './pages/Orion'
import Users from './pages/Users'
import Docs from './pages/Docs'
import Finance from './pages/Finance'
import './styles.css'

function App() {
  const { user } = useStore()
  if (!user) return <Login />
  const admin = user.role === 'admin'
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="flota" element={<Vehicles />} />
        <Route path="flota/:id" element={<VehicleDetail />} />
        <Route path="conductores" element={<Drivers />} />
        <Route path="conductores/:id" element={<DriverDetail />} />
        <Route path="rentas" element={<Rentals />} />
        <Route path="cobranza" element={<Billing />} />
        <Route path="mantenimiento" element={<Maintenance />} />
        <Route path="incidentes" element={<Incidents />} />
        <Route path="inspecciones" element={<Inspections />} />
        <Route path="inspecciones/nueva" element={<NewInspection />} />
        {admin && <Route path="finanzas" element={<Finance />} />}
        {admin && <Route path="orion" element={<Orion />} />}
        {admin && <Route path="usuarios" element={<Users />} />}
        <Route path="documentacion" element={<Docs />} />
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
