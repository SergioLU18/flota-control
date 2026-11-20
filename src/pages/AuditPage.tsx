// Bitácora de cambios (permiso "auditoria"): quién hizo cada cambio y cuándo. La lógica vive en components/AuditLog.tsx.
import { PageHeader } from '../components/ui'
import { AuditLog } from '../components/AuditLog'

export default function AuditPage() {
  return (
    <>
      <PageHeader module="bitacora" title="Bitácora de cambios" subtitle="Cada alta, cambio y eliminación, con quién la hizo y cuándo. No se puede editar ni borrar." />
      <AuditLog />
    </>
  )
}
