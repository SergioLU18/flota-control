import { Link } from 'react-router-dom'
import { useStore } from '../data/store'
import { Badge, Card, Empty, PageHeader, StatusBadge } from '../components/ui'
import { fechaHora, km } from '../lib/format'

export default function Orion() {
  const { data, orionSync } = useStore()
  const { orion } = data
  const linked = data.vehicles.filter((v) => v.orionDeviceId)

  return (
    <>
      <PageHeader module="orion" title="Integración con Orión GPS"
        subtitle={<>Estado: {orion.status === 'pendiente' ? <Badge tone="amber">Pendiente de confirmar API</Badge> : <Badge tone="green">Simulación activa</Badge>}</>}
        actions={<button className="btn btn-primary" onClick={orionSync}>Simular sincronización</button>} />

      <div className="banner banner-amber">
        Aún no se confirma si Orión tiene API o exportación de datos. Este módulo está <b>aislado</b>: si no existe o se retrasa,
        el kilometraje se sigue capturando a mano y en entregas/recepciones, y el resto del sistema funciona igual.
      </div>

      <div className="grid-2">
        <Card title="Cómo funcionaría">
          <ol className="steps">
            <li>Una tarea programada (por ejemplo, cada noche) consulta a Orión el odómetro de cada equipo.</li>
            <li>Relaciona cada equipo con un coche mediante su <b>ID de equipo Orión</b>.</li>
            <li>Crea un registro de km con origen <StatusBadge value="orion" />. Nunca sobrescribe los registros manuales.</li>
            <li>Si una lectura es menor que la anterior o el salto es absurdo, la descarta y genera un aviso.</li>
            <li>Las alertas de mantenimiento se recalculan solas con el nuevo km.</li>
          </ol>
          <p className="muted small">Si Orión solo exporta archivos, la misma tarea puede importar un CSV o Excel subido a mano.</p>
        </Card>
        <Card title="Sincronizaciones">
          {orion.syncs.length === 0 ? <Empty>Ninguna todavía. Usa “Simular sincronización”.</Empty> : (
            <ul className="plain">{orion.syncs.map((s, i) => <li key={i}>{fechaHora(s.at)} · {s.updated} coches actualizados · <span className="muted">{s.note}</span></li>)}</ul>
          )}
          <h3 className="mt">Alertas de exceso de velocidad <Badge tone="gray">Futuro</Badge></h3>
          <p className="muted small">Según las notas, Orión ya envía alertas de exceso de velocidad. Si la API las expone, podrían aparecer en el expediente del conductor.</p>
        </Card>
        <Card title={`Equipos vinculados (${linked.length})`} className="span-2">
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Equipo</th><th>Coche</th><th>Estado</th><th className="num">Km actual</th><th>Última lectura Orión</th></tr></thead>
            <tbody>{linked.map((v) => {
              const last = data.mileage.filter((m) => m.vehicleId === v.id && m.source === 'orion').sort((a, b) => (a.date < b.date ? 1 : -1))[0]
              return <tr key={v.id}><td><code>{v.orionDeviceId}</code></td><td><Link to={`/flota/${v.id}`}>{v.brand} {v.model} {v.plates}</Link></td><td><StatusBadge value={v.status} /></td><td className="num">{km(v.currentKm)}</td><td className="small">{last ? `${last.date} · ${km(last.km)}` : '—'}</td></tr>
            })}</tbody>
          </table></div>
        </Card>
      </div>
    </>
  )
}
