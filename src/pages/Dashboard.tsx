import { Link } from 'react-router-dom'
import { useStore } from '../data/store'
import { Badge, Card, PageHeader, Progress, Stat, StatusBadge } from '../components/ui'
import { Icon } from '../components/Icon'
import { carName, inFleet, activeRentalOfDriver, alerts, driverBalance, globalBalance, maintenanceStatus, monthIncome, rentalBalance, weekIncome, MAINTENANCE_INTERVAL } from '../lib/calc'
import { CURRENT_MONDAY, TODAY, addDays, km, mes, mxn, rangoFechas } from '../lib/format'
import { can } from '../data/permissions'
import { canOpen } from '../data/modules'

export default function Dashboard() {
  const { data, user } = useStore()
  const fleet = data.vehicles.filter(inFleet)
  const count = (s: string) => fleet.filter((v) => v.status === s).length
  const total = fleet.length
  // Cada tarjeta y cada aviso es de un módulo: sin su permiso no se muestra (y sus datos ni siquiera llegan).
  const seesMoney = can(user, 'cobranza.ver')
  const seesMaint = can(user, 'mantenimiento.ver')
  const avisos = alerts(data).filter((a) => canOpen(user, a.to) && (!a.perm || can(user, a.perm)))

  const debtors = data.drivers
    .map((dr) => ({ dr, ...driverBalance(data, dr.id) }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance)

  const upcoming = fleet
    .map((v) => ({ v, m: maintenanceStatus(v, data.services, data.mileage) }))
    .sort((a, b) => a.m.remaining - b.m.remaining)
    .slice(0, 6)

  // Los cargos de la semana se generan al empezar la semana: una renta activa con saldo en contra no ha cubierto la semana.
  const weekPending = data.rentals.filter((r) => r.status === 'activa' && rentalBalance(data, r.id).balance > 0).length
  const g = globalBalance(data)

  return (
    <>
      <PageHeader module="dashboard" title={`Hola, ${user?.name.split(' ')[0]}`} subtitle={`Semana del ${rangoFechas(CURRENT_MONDAY, addDays(CURRENT_MONDAY, 6))}`} />

      <div className="stats" data-tour="indicadores">
        {seesMoney && <>
          <Stat label="Ingresos de la semana" value={mxn(weekIncome(data))} hint={`${weekPending} rentas activas con saldo pendiente`} icon="trend" tone="green" />
          <Stat label={`Ingresos de ${mes(TODAY.slice(0, 7))}`} value={mxn(monthIncome(data))} icon="calendar" />
          <Stat label="Adeudo total" value={mxn(g.debt)} hint={`${debtors.length} conductores con saldo${g.credit ? ` · ${mxn(g.credit)} a favor` : ''}`} tone="red" icon="wallet" />
        </>}
        <Stat label="Avisos" value={avisos.length} hint={`${avisos.filter((a) => a.level === 'alta').length} urgentes`} tone="amber" icon="alert" />
        <div className="stat stat-wide stat-blue" data-tour="dash-flota">
          <div className="stat-head">
            <div className="stat-label">Coches por estado</div>
            <span className="stat-icon" aria-hidden><Icon name="car" /></span>
          </div>
          <div className="stat-value">{count('rentado')} / {total} <span className="small muted">rentados · {total ? Math.round((count('rentado') / total) * 100) : 0}% de ocupación</span></div>
          <div className="fleet-bar" aria-label="Distribución de la flota">
            {(['rentado', 'disponible', 'taller'] as const).map((s) => (
              <div key={s} className={`seg seg-${s}`} style={{ flex: count(s) }} title={`${s}: ${count(s)}`} />
            ))}
          </div>
          <ul className="legend">
            {(['rentado', 'disponible', 'taller'] as const).map((s) => (
              <li key={s}>{canOpen(user, '/flota') ? <Link to={`/flota?estado=${s}`}><StatusBadge value={s} /> <b>{count(s)}</b></Link> : <><StatusBadge value={s} /> <b>{count(s)}</b></>}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dash">
        <Card tour="avisos" title="Avisos internos" actions={<Badge tone="amber">{avisos.length}</Badge>}>
          <ul className="alert-list">
            {avisos.slice(0, 10).map((a, i) => (
              <li key={i} className={`alert-${a.level}`}><Link to={a.to}>{a.text}</Link></li>
            ))}
          </ul>
        </Card>

        {seesMoney && <Card tour="adeudos" title="Adeudos por conductor" actions={<Link to="/cobranza" className="link">Ver cobranza<Icon name="forward" /></Link>}>
          <table className="table compact">
            <thead><tr><th>Conductor</th><th>Coche</th><th className="num">Adeudo</th></tr></thead>
            <tbody>
              {debtors.slice(0, 7).map(({ dr, balance }) => {
                const r = activeRentalOfDriver(data, dr.id)
                const v = r && data.vehicles.find((x) => x.id === r.vehicleId)
                return (
                  <tr key={dr.id}>
                    <td><Link to={`/conductores/${dr.id}`}>{dr.name}</Link></td>
                    <td className="muted">{v ? v.plates : 'Sin coche'}</td>
                    <td className="num neg">{mxn(balance)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>}

        {seesMaint && <Card tour="proximos-mant" title="Próximos mantenimientos" actions={<Link to="/mantenimiento" className="link">Ver todos<Icon name="forward" /></Link>}>
          <table className="table compact">
            <thead><tr><th>Coche</th><th>Desde último servicio</th><th></th></tr></thead>
            <tbody>
              {upcoming.map(({ v, m }) => (
                <tr key={v.id}>
                  <td><Link to={`/flota/${v.id}`}>{carName(v)}</Link><div className="muted small">{v.plates}</div></td>
                  <td style={{ minWidth: 140 }}>
                    <Progress value={m.since / MAINTENANCE_INTERVAL} tone={m.level === 'vencido' ? 'red' : m.level === 'proximo' ? 'amber' : 'green'} />
                    <span className="small muted">{km(m.since)}</span>
                  </td>
                  <td><StatusBadge value={m.level} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>}
      </div>
    </>
  )
}
