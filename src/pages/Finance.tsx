import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Badge, Card, Modal, PageHeader, Progress, Stat, StatusBadge, Tabs } from '../components/ui'
import { ExpenseForm } from '../components/forms'
import { EXPENSE_LABEL, financePeriods, incomeStatement, lastMonths, vehicleProfit, vehicleRecovery } from '../lib/finance'
import { fecha, mes, mxn } from '../lib/format'
import { downloadCsv } from '../lib/files'
import type { ExpenseCategory } from '../data/types'

type Tab = 'resultados' | 'coches' | 'gastos'
type SortKey = 'income' | 'costs' | 'profit' | 'profitPerMonth' | 'occupancy' | 'recovered'

const pct = (x: number) => `${Math.round(x * 100)}%`

export default function Finance() {
  const { data } = useStore()
  const L = useLookup()
  const periods = useMemo(() => financePeriods(), [])
  const [pk, setPk] = useState('last12')
  const period = periods.find((x) => x.key === pk)!
  const [tab, setTab] = useState<Tab>('resultados')
  const [sort, setSort] = useState<SortKey>('profit')
  const [cat, setCat] = useState<ExpenseCategory | ''>('')
  const [adding, setAdding] = useState(false)

  const st = incomeStatement(data, period)
  const monthly = lastMonths().map((ym) => ({ ym, ...incomeStatement(data, periods.find((x) => x.key === ym)!) }))

  const cars = data.vehicles.map((v) => ({ v, ...vehicleProfit(data, v, period), recovery: vehicleRecovery(data, v) }))
  const sortVal = (c: (typeof cars)[number]) => (sort === 'recovered' ? c.recovery.recovered : c[sort])
  const sorted = [...cars].sort((a, b) => sortVal(b) - sortVal(a))
  const tot = { income: cars.reduce((a, c) => a + c.income, 0), costs: cars.reduce((a, c) => a + c.costs, 0) }
  const best = sorted[0]
  const worst = [...cars].sort((a, b) => a.profitPerMonth - b.profitPerMonth)[0]
  const pctOrDash = (x: number) => (Number.isFinite(x) ? pct(x) : '—')

  const expenses = data.expenses.filter((e) => (!cat || e.category === cat) && e.date >= period.from && e.date <= period.to).sort((a, b) => (a.date < b.date ? 1 : -1))

  const Th = ({ k, children }: { k: SortKey; children: string }) => (
    <th className={`num sortable ${sort === k ? 'sorted' : ''}`} onClick={() => setSort(k)}>{children}{sort === k ? ' ↓' : ''}</th>
  )

  const exportCars = () => downloadCsv(`rentabilidad-${period.key}.csv`, [
    ['Coche', 'Placas', 'Ingresos', 'Mantenimiento', 'Incidentes', 'Otros gastos', 'Utilidad', 'Utilidad/mes', 'Ocupación', 'Precio compra', '% recuperado (histórico)'],
    ...sorted.map((c) => [`${c.v.brand} ${c.v.model} ${c.v.year}`, c.v.plates, c.income, c.maintenance, c.incidents, c.other, c.profit, Math.round(c.profitPerMonth), pct(c.occupancy), c.v.purchasePrice, pctOrDash(c.recovery.recovered)]),
  ])

  return (
    <>
      <PageHeader module="finanzas" title="Finanzas" subtitle="Números operativos para decidir; no sustituyen la contabilidad fiscal."
        actions={<>
          <select value={pk} onChange={(e) => setPk(e.target.value)} aria-label="Periodo">
            <optgroup label="Rangos">{periods.slice(0, 3).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
            <optgroup label="Mes">{periods.slice(3).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
          </select>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>＋ Registrar gasto</button>
        </>} />

      <div className="stats">
        <Stat label="Ingresos cobrados" value={mxn(st.income)} hint={`de ${mxn(st.charged)} cargado (${st.charged ? pct(st.income / st.charged) : '—'} cobrado)`} />
        <Stat label="Gastos operativos" value={mxn(st.expenses)} />
        <Stat label="Utilidad operativa" value={mxn(st.profit)} tone={st.profit >= 0 ? 'green' : 'red'} hint={`Margen ${pct(st.margin)}`} />
        <Stat label="Compra de coches" value={mxn(st.purchases)} hint="Inversión del periodo; no se cuenta como gasto" />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[['resultados', 'Estado de resultados'], ['coches', 'Rentabilidad por coche'], ['gastos', 'Gastos']]} />

      {tab === 'resultados' && (
        <div className="grid-2">
          <Card title={`Estado de resultados · ${period.label}`}>
            <table className="table compact statement">
              <tbody>
                <tr className="section"><td colSpan={2}>Ingresos</td></tr>
                <tr><td>Rentas cobradas</td><td className="num">{mxn(st.income)}</td></tr>
                <tr className="section"><td colSpan={2}>Gastos operativos</td></tr>
                <tr><td>Mantenimiento y servicios</td><td className="num">{mxn(st.maintenance)}</td></tr>
                <tr><td>Incidentes a cargo de la empresa</td><td className="num">{mxn(st.incidents)}</td></tr>
                {st.byCategory.map((c) => <tr key={c.cat}><td>{c.label}</td><td className="num">{mxn(c.amount)}</td></tr>)}
                <tr className="total"><td>Total gastos</td><td className="num">{mxn(st.expenses)}</td></tr>
                <tr className="total"><td>Utilidad operativa <span className="muted small">· margen {pct(st.margin)}</span></td><td className={`num ${st.profit < 0 ? 'neg' : ''}`}>{mxn(st.profit)}</td></tr>
                <tr className="section"><td colSpan={2}>Inversión</td></tr>
                <tr><td>Compra de coches</td><td className="num">{mxn(st.purchases)}</td></tr>
                <tr className="total"><td>Flujo después de inversión</td><td className={`num ${st.cashAfterInvestment < 0 ? 'neg' : ''}`}>{mxn(st.cashAfterInvestment)}</td></tr>
              </tbody>
            </table>
            <p className="muted small">Ingresos = pagos registrados (lo cobrado, no lo cargado). Los incidentes a cargo del conductor no cuentan como gasto. Sin IVA ni depreciación.</p>
          </Card>
          <Card title="Mes a mes">
            <div className="table-wrap"><table className="table compact">
              <thead><tr><th>Mes</th><th className="num">Ingresos</th><th className="num">Gastos</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
              <tbody>{monthly.map((m) => (
                <tr key={m.ym} className="clickable" onClick={() => setPk(m.ym)}>
                  <td>{mes(m.ym)}</td><td className="num">{mxn(m.income)}</td><td className="num">{mxn(m.expenses)}</td>
                  <td className={`num ${m.profit < 0 ? 'neg' : ''}`}>{mxn(m.profit)}</td><td className="num">{m.income ? pct(m.margin) : '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <p className="muted small">Haz clic en un mes para ver su estado de resultados.</p>
          </Card>
        </div>
      )}

      {tab === 'coches' && (
        <>
          {best && <div className="grid-2">
            <Card title="Más rentable por mes"><p><Link to={`/flota/${best.v.id}`}>{best.v.brand} {best.v.model} {best.v.plates}</Link> · {mxn(best.profitPerMonth)} de utilidad al mes · ocupación {pct(best.occupancy)}</p></Card>
            <Card title="Menos rentable por mes"><p><Link to={`/flota/${worst.v.id}`}>{worst.v.brand} {worst.v.model} {worst.v.plates}</Link> · {mxn(worst.profitPerMonth)} al mes · ocupación {pct(worst.occupancy)} <StatusBadge value={worst.v.status} /></p></Card>
          </div>}
          <Card title={`Rentabilidad por coche · ${period.label}`} actions={<button className="btn btn-sm" onClick={exportCars}>⬇ Exportar a Excel (CSV)</button>}>
            <div className="table-wrap"><table className="table compact">
              <thead><tr>
                <th>Coche</th><Th k="income">Ingresos</Th><Th k="costs">Costos</Th><Th k="profit">Utilidad</Th><Th k="profitPerMonth">Utilidad / mes</Th><Th k="occupancy">Ocupación</Th>
                <Th k="recovered">Recuperado</Th><th className="num">Recupera su costo en</th>
              </tr></thead>
              <tbody>{sorted.map((c) => (
                <tr key={c.v.id}>
                  <td><Link to={`/flota/${c.v.id}`}>{c.v.brand} {c.v.model} {c.v.year}</Link><div className="muted small">{c.v.plates} · compra {mxn(c.v.purchasePrice)}</div></td>
                  <td className="num">{mxn(c.income)}</td>
                  <td className="num" title={`Mantenimiento ${mxn(c.maintenance)} · incidentes ${mxn(c.incidents)} · otros ${mxn(c.other)}`}>{mxn(c.costs)}</td>
                  <td className={`num ${c.profit < 0 ? 'neg' : ''}`}>{mxn(c.profit)}</td>
                  <td className="num">{mxn(c.profitPerMonth)}</td>
                  <td className="num">{pct(c.occupancy)}</td>
                  <td className="recovery"><div className="recovery-cell"><Progress value={c.recovery.recovered} tone="green" /><span className="small">{pctOrDash(c.recovery.recovered)}</span></div></td>
                  <td className="num small">{c.recovery.monthsToRecover === 0 ? <Badge tone="green">Recuperado</Badge> : c.recovery.monthsToRecover === Infinity ? '—' : `~${Math.ceil(c.recovery.monthsToRecover)} meses`}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr className="total"><td>Flota</td><td className="num">{mxn(tot.income)}</td><td className="num">{mxn(tot.costs)}</td><td className="num">{mxn(tot.income - tot.costs)}</td><td colSpan={4}></td></tr></tfoot>
            </table></div>
            <p className="muted small">
              Costos = mantenimiento + incidentes a cargo de la empresa + gastos del coche (seguro, refrendo, GPS). Los gastos generales no se reparten entre coches.
              "Recuperado" compara la utilidad acumulada desde la compra contra el precio de compra; "recupera en" lo estima con la utilidad mensual promedio.
              La ocupación es el porcentaje de días rentado desde que el coche está en la flota.
            </p>
          </Card>
        </>
      )}

      {tab === 'gastos' && (
        <Card title={`Gastos · ${period.label}`} actions={
          <select value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory | '')}>
            <option value="">Todas las categorías</option>
            {(Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map((c) => <option key={c} value={c}>{EXPENSE_LABEL[c]}</option>)}
          </select>
        }>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Coche</th><th className="num">Monto</th><th>Registró</th></tr></thead>
            <tbody>{expenses.slice(0, 100).map((e) => {
              const v = e.vehicleId ? L.vehicle(e.vehicleId) : undefined
              return (
                <tr key={e.id}><td>{fecha(e.date)}</td><td>{e.concept}</td><td className="muted small">{EXPENSE_LABEL[e.category]}</td>
                  <td>{v ? <Link to={`/flota/${v.id}`}>{v.model} {v.plates}</Link> : <span className="muted">General</span>}</td>
                  <td className="num">{mxn(e.amount)}</td><td className="muted small">{L.user(e.userId)?.name}</td></tr>
              )
            })}</tbody>
          </table></div>
          <p className="muted small">{expenses.length > 100 ? `Mostrando 100 de ${expenses.length}. ` : ''}Los servicios e incidentes no aparecen aquí: se registran en Mantenimiento e Incidentes y ya cuentan como gasto.</p>
        </Card>
      )}

      <Modal open={adding} title="Registrar gasto" onClose={() => setAdding(false)}><ExpenseForm onDone={() => setAdding(false)} /></Modal>
    </>
  )
}
