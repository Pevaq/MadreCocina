import { useEffect, useState } from 'react'
import { supabase, hideSplash } from '../lib.js'
import Orders from './Orders.jsx'
import Products from './Products.jsx'
import Categories from './Categories.jsx'
import Settings from './Settings.jsx'

const TABS = { orders: 'Pedidos', manage: 'Gestión', settings: 'Ajustes' }
const ORDER_TABS = { pending: 'Pendientes', delivered: 'Finalizados' }
const MANAGE_TABS = { products: 'Productos', categories: 'Categorías' }

export default function Admin() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('orders')

  useEffect(() => {
    hideSplash()
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Login />

  return (
    <div className="page">
      <div className="row admin-head">
        <h1>Backoffice</h1>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Salir</button>
      </div>
      <nav className="chips">
        {Object.entries(TABS).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      {tab === 'orders' && <SubTabs tabs={ORDER_TABS}>{(k) => <Orders key={k} status={k} />}</SubTabs>}
      {tab === 'manage' && <SubTabs tabs={MANAGE_TABS}>{(k) => (k === 'products' ? <Products /> : <Categories />)}</SubTabs>}
      {tab === 'settings' && <Settings />}
    </div>
  )
}

// Second level of navigation inside a module (Pedidos, Gestión).
function SubTabs({ tabs, children }) {
  const [tab, setTab] = useState(Object.keys(tabs)[0])
  return (
    <>
      <nav className="tabs">
        {Object.entries(tabs).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      {children(tab)}
    </>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setError(error ? 'Email o contraseña incorrectos.' : '')
  }

  return (
    <form className="page narrow" onSubmit={submit}>
      <h1>Ingresar</h1>
      <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Contraseña<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button>Entrar</button>
    </form>
  )
}
