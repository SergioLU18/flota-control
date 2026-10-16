import { useState } from 'react'
import { useStore } from '../data/store'

export default function Login() {
  const { login } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="login">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true); setError('')
        try {
          await login(email, password)
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}>
        <Brand />
        <label className="field"><span>Correo</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label className="field"><span>Contraseña</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="muted small">Las cuentas las da de alta un administrador. Si olvidaste tu contraseña, pídele que la restablezca.</p>
      </form>
    </div>
  )
}

/** Pantalla para una cuenta que existe pero que un admin aún no activa. */
export function Pending() {
  const { user, logout } = useStore()
  return (
    <div className="login">
      <div className="login-card">
        <Brand />
        <p>Tu cuenta <b>{user?.email}</b> está creada, pero un administrador todavía no la activa.</p>
        <p className="muted small">Cuando la activen, vuelve a entrar.</p>
        <button className="btn btn-block" onClick={logout}>Salir</button>
      </div>
    </div>
  )
}

/** Mensaje de carga o de error mientras se leen los datos. */
export function Splash({ error }: { error?: string }) {
  const { logout } = useStore()
  return (
    <div className="login">
      <div className="login-card">
        <Brand />
        {error ? <>
          <p className="form-error">No se pudieron cargar los datos: {error}</p>
          <div className="form-actions">
            <button className="btn" onClick={logout}>Salir</button>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
          </div>
        </> : <p className="muted">Cargando…</p>}
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="brand brand-lg">
      <span className="brand-mark">B</span>
      <div><strong>Flota Control</strong><small>Gestión de flota y rentas</small></div>
    </div>
  )
}
