import { Link } from 'react-router-dom'
import { useStore } from '../data/store'
import { Badge, Card, PageHeader, Progress, Stat, StatusBadge } from '../components/ui'
import { activeRentalOfDriver, alerts, driverBalance, globalBalance, maintenanceStatus, monthIncome, weekIncome, MAINTENANCE_INTERVAL } from '../lib/calc'
import { CURRENT_MONDAY, TODAY, addDays, fechaCorta, km, mes, mxn } from '../lib/format'

export default function Dashboard() {
  const { data, user } = useStore()
  const count = (s: string) => data.vehicles.filter((v) => v.status === s).length
  const total = data.vehicles.length
  const avisos = alerts(data)

  const debtors = data.drivers
    .map((dr) => ({ dr, ...driverBalance(data, dr.id) }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance)

  const upcoming = data.vehicles
    .map((v) => ({ v, m: maintenanceStatus(v, data.services) }))
    .sort((a, b) => a.m.remaining - b.m.remaining)
    .slice(0, 6)

  const weekPending = data.rentals
    .filter((r) => r.status === 'activa')
    .filter((r) => !data.payments.some((p) => !p.voided && p.rentalId === r.id && p.date >= CURRENT_MONDAY)).length

  return (
    <>
      <PageHeader module="dashboard" title={`Hola, ${user?.name.split(' ')[0]}`} subtitle={`Semana del ${fechaCorta(CURRENT_MONDAY)} al ${fechaCorta(addDays(CURRENT_MONDAY, 6))}`} />

      <div className="stats">
        <Stat label="Ingresos de la semana" value={mxn(weekIncome(data))} hint={`${weekPending} rentas sin pago esta semana`} />
        <Stat label={`Ingresos de ${mes(TODAY.slice(0, 7))}`} value={mxn(monthIncome(data))} />
        <Stat label="Adeudo total" value={mxn(globalBalance(data).balance)} hint={`${debtors.length} conductores con saldo`} tone="red" />
        <Stat label="Avisos" value={avisos.length} hint={`${avisos.filter((a) => a.level === 'alta').length} urgentes`} tone="amber" />
        <div className="stat stat-wide">
          <div className="stat-label">Coches por estado</div>
          <div className="stat-value">{count('rentado')} / {total} <span className="small muted">rentados · {total ? Math.round((count('rentado') / total) * 100) : 0}% de ocupación</span></div>
          <div className="fleet-bar" aria-label="Distribución de la flota">
            {(['rentado', 'disponible', 'taller'] as const).map((s) => (
              <div key={s} className={`seg seg-${s}`} style={{ flex: count(s) }} title={`${s}: ${count(s)}`} />
            ))}
          </div>
          <ul className="legend">
            {(['rentado', 'disponible', 'taller'] as const).map((s) => (
              <li key={s}><Link to={`/flota?estado=${s}`}><StatusBadge value={s} /> <b>{count(s)}</b></Link></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dash">
        <Card title="Avisos internos" actions={<Badge tone="amber">{avisos.length}</Badge>}>
          <ul className="alert-list">
            {avisos.slice(0, 10).map((a, i) => (
              <li key={i} className={`alert-${a.level}`}><Link to={a.to}>{a.text}</Link></li>
            ))}
          </ul>
        </Card>

        <Card title="Adeudos por conductor" actions={<Link to="/cobranza" className="link">Ver cobranza →</Link>}>
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
        </Card>

        <Card title="Próximos mantenimientos" actions={<Link to="/mantenimiento" className="link">Ver todos →</Link>}>
          <table className="table compact">
            <thead><tr><th>Coche</th><th>Desde último servicio</th><th></th></tr></thead>
            <tbody>
              {upcoming.map(({ v, m }) => (
                <tr key={v.id}>
                  <td><Link to={`/flota/${v.id}`}>{v.brand} {v.model}</Link><div className="muted small">{v.plates}</div></td>
                  <td style={{ minWidth: 140 }}>
                    <Progress value={m.since / MAINTENANCE_INTERVAL} tone={m.level === 'vencido' ? 'red' : m.level === 'proximo' ? 'amber' : 'green'} />
                    <span className="small muted">{km(m.since)}</span>
                  </td>
                  <td><StatusBadge value={m.level} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
