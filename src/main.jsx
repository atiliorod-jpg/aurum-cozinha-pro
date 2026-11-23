import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// ⚠️ AS LETRAS DO JEITO DO MAGURŌ (23/11/2026): Inter no texto, Montserrat
// nos títulos. GUARDADAS NO PRÓPRIO APP (e não no Google Fonts, como no
// Magurō): a cozinha abre o app sem internet, e o service worker guarda os
// arquivos .woff2 junto com o resto (vite.config.js, globPatterns). Só o
// conjunto "latin" — que já tem ç, ã, é… —, para não baixar cirílico e grego.
// ⚠️ A ETIQUETA NÃO MUDA: ela tem a letra dela, fixa (EtiquetaLabel e
// nomeEmBitmap). O dono já recusou letra mais grossa no papel.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/montserrat/latin-700.css'
import '@fontsource/montserrat/latin-800.css'
import '@fontsource/montserrat/latin-900.css'
import './index.css'
import './lib/pwaInstall.js' // registra o listener de instalação cedo
import App from './App.jsx'
import BarreiraDeErro from './components/BarreiraDeErro.jsx'
import { ouvirErrosGlobais } from './lib/relatarErro.js'

// os erros dos aparelhos chegam no painel da Aurum (M50)
ouvirErrosGlobais()

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
