import { useState } from 'react'
import { useStore } from '../data/store'
import { StatusBadge } from '../components/ui'

export default function Login() {
  const { data, login } = useStore()
  const [selected, setSelected] = useState(data.users[0].id)
  const user = data.users.find((u) => u.id === selected)!

  return (
    <div className="login">
      <form className="login-card" onSubmit={(e) => { e.preventDefault(); login(user) }}>
        <div className="brand brand-lg">
          <span className="brand-mark">B</span>
          <div><strong>Bitácora</strong><small>Gestión de flota y rentas</small></div>
        </div>
        <p className="muted">
          En la demo no hay contraseña: elige un usuario para ver la app con su rol.
          El rol <b>operador</b> no ve Usuarios, Orión ni la parte financiera de cada coche.
        </p>
        <div className="user-pick">
          {data.users.map((u) => (
            <label key={u.id} className={`user-option ${selected === u.id ? 'selected' : ''}`}>
              <input type="radio" name="user" checked={selected === u.id} onChange={() => setSelected(u.id)} />
              <span>{u.name}<small className="muted">{u.email}</small></span>
              <StatusBadge value={u.role} />
            </label>
          ))}
        </div>
        <label className="field"><span>Contraseña</span><input type="password" placeholder="(no se requiere en la demo)" disabled /></label>
        <button className="btn btn-primary btn-block" type="submit">Entrar como {user.name}</button>
      </form>
    </div>
  )
}
