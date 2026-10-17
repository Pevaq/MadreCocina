import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import Shop from './Shop.jsx'
import Admin from './admin/Admin.jsx'
import './style.css'

// Hash routing: GitHub Pages has no server rewrites, so "#/admin" is the only safe deep link.
function App() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => setHash(location.hash)
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return hash.startsWith('#/admin') ? <Admin /> : <Shop />
}

createRoot(document.getElementById('root')).render(<App />)
