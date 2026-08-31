import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/pwaInstall.js' // registra o listener de instalação cedo
import App from './App.jsx'
import BarreiraDeErro from './components/BarreiraDeErro.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* ⚠️ POR FORA DE TUDO, inclusive dos contextos: um erro ao montar o
        AuthContext ou o AppContext é justamente o que deixaria a tela branca
        antes de qualquer rota existir. */}
    <BarreiraDeErro>
      <App />
    </BarreiraDeErro>
  </StrictMode>,
)
