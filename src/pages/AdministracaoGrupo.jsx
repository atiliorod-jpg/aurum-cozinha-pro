import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Icon from '../components/Icons';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { GRUPOS_ADMIN, useAcessosAdmin } from '../store/acessosAdmin';
import { temRecurso } from '../utils/modulos';
import {
  CartaoSuporteRemoto, CartaoArmazenamentos, CartaoEstados, CartaoEtiquetas, CartaoEstabelecimento,
  CartaoMeusDados,
} from '../components/config/CartoesConfig';
import CartaoAparelhos from '../components/config/CartaoAparelhos';
import { CartaoSenhaDaAdministracao } from '../components/SenhaDaAdministracao';
import CartaoMinhaSenha from '../components/config/CartaoMinhaSenha';
import CartaoEquipe from '../components/config/CartaoEquipe';
import { ResumoDoPlano } from '../components/PlanoExtras';
import {
  CartaoReceitas, CartaoDestinosSaida, CartaoDestinosApara, CartaoMinMaxAuto, CartaoGuiaTurno, CartaoRendimento,
} from '../components/config/CartoesEstoque';
import { CartaoInstalarApp, CartaoNovidades, CartaoZonaPerigo } from '../components/config/CartoesConta';

/**
 * Uma tela por grupo da Administração (Lote 4 da auditoria, 14/10/2026):
 * A casa, Etiqueta, Equipe, Estoque, Conta. Substituiu Configurações (quatro
 * abas) no Pro e Ajustes no plano Etiquetas — as duas telas tinham os mesmos
 * cartões em ordens diferentes. Quem alcança o quê: store/acessosAdmin.js.
 */
export default function AdministracaoGrupo() {
  const { grupo } = useParams();
  const acesso = useAcessosAdmin();
  const g = GRUPOS_ADMIN.find(x => x.id === grupo);
  // grupo que não existe, ou que este cargo não alcança: volta para o hub
  if (!g || !acesso.grupos[grupo]) return <Navigate to="/administracao" replace />;

  return (
    // ⚠️ No plano Etiquetas a barra do rodapé FICA (a Administração é uma aba
    // dela) e a volta vem pelo `voltar`; no Pro a área de administração não
    // tem barra e o Layout já põe a volta sozinho.
    <Layout title={g.titulo} {...(acesso.soEtiq ? { voltar: '/administracao' } : { area: 'admin' })}>
      {grupo === 'casa' && <GrupoCasa a={acesso} />}
      {grupo === 'etiqueta' && <GrupoEtiqueta a={acesso} />}
      {grupo === 'equipe' && <GrupoEquipe a={acesso} />}
      {grupo === 'estoque' && <GrupoEstoque a={acesso} />}
      {grupo === 'conta' && <GrupoConta a={acesso} />}
    </Layout>
  );
}

function LinkCartao({ to, titulo, desc, icone }) {
  return (
    <Link to={to} className="cartao flex items-center gap-3 active:scale-[0.99] transition-transform">
      {icone && (
        <span className="w-10 h-10 rounded-lg bg-polo-beige text-polo-navy flex items-center justify-center flex-shrink-0">
          <Icon name={icone} size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-polo-navy">{titulo}</span>
        <span className="block text-xs text-gray-600 mt-0.5">{desc}</span>
      </span>
      <span aria-hidden="true" className="text-polo-navy text-lg">›</span>
    </Link>
  );
}

function GrupoCasa({ a }) {
  const { prefs, setPref } = useApp();
  const { sessao } = useAuth();
  const { toast } = useUI();
  return (
    <>
      {a.estabelecimento && (
        <CartaoEstabelecimento prefs={prefs} setPref={setPref} toast={toast}
          nomeRestaurante={sessao?.restauranteNome} cnpjDaConta={sessao?.cnpj} />
      )}
      {/* ⚠️ SEM UNIDADES (24/11/2026, pedido do dono): "outro CNPJ" saiu do
          app — cada CNPJ é uma conta. No Pro fica a tela das cozinhas. */}
      {a.cozinhas && (
        <LinkCartao to="/estoques" icone="estabelecimento" titulo="Cozinhas"
          desc="Criar, renomear e arquivar as cozinhas" />
      )}
    </>
  );
}

function GrupoEtiqueta({ a }) {
  const { prefs, setPref } = useApp();
  const { toast, confirm } = useUI();
  return (
    <>
      {/* Armazenamento vem primeiro: define o que a etiqueta imprime */}
      <CartaoArmazenamentos prefs={prefs} setPref={setPref} toast={toast} confirm={confirm} />
      {/* os estados (pista fria...) vivem dentro de um armazenamento — Lote 11 */}
      <CartaoEstados prefs={prefs} setPref={setPref} toast={toast} confirm={confirm} />
      {/* ⚠️ QR só no Pro: quem lê o código é a baixa pela etiqueta e a
          contagem por câmera, telas que só existem lá. */}
      <CartaoEtiquetas prefs={prefs} setPref={setPref} toast={toast} mostrarQR={!a.soEtiq} />
      {/* ⚠️ A impressora (conectar, rolo, etiqueta de teste) mora em Meus itens
          → Impressora desde 23/11/2026 — o dono tirou o cartão daqui. */}
    </>
  );
}

function GrupoEquipe({ a }) {
  return (
    <>
      {/* Os NOMES de quem registra e imprime, com a senha de cada um. Não são
          as contas de acesso: essas vêm logo abaixo. */}
      {a.nomes && (
        <CartaoEquipe titulo="Nomes da equipe" />
      )}
      {/* ⚠️ JEITO DO MAGURŌ (23/11/2026, pedido do dono): saíram as contas da
          equipe, os cargos e a matriz de acessos. Um login da casa entra em
          todos os aparelhos; os nomes acima dizem quem fez; e a senha abaixo
          abre a Administração, Meus itens e os relatórios. */}
      <CartaoSenhaDaAdministracao />
      {/* quais aparelhos estão com a conta aberta, e o "Tirar" (M64) */}
      {a.aparelhos && <CartaoAparelhos />}
    </>
  );
}

function GrupoEstoque({ a }) {
  const { estoqueAtual, modulo } = useApp();
  return (
    <>
      {/* ⚠️ Receitas e destinos são de CADA cozinha. A Administração não é
          uma cozinha, então a tela diz de qual está falando — sem isto, quem
          abriu o app no Seco ajustava o Seco achando que era a Produção. */}
      <p className="text-xs text-polo-navy bg-white border border-polo-gold/40 rounded-xl px-3 py-2 mb-4">
        Valem para <strong>{estoqueAtual?.nome || 'a cozinha aberta'}</strong>, a cozinha aberta neste aparelho.
        Para ajustar outra, abra ela no topo da tela e volte aqui.
      </p>
      {a.receitas && <CartaoReceitas />}
      {a.ajustesEstoque && (
        <>
          {temRecurso(modulo, 'saidas') && <CartaoDestinosSaida />}
          {temRecurso(modulo, 'aparas') && <CartaoDestinosApara />}
          <CartaoMinMaxAuto />
          {temRecurso(modulo, 'aparas') && <CartaoRendimento />}
          <CartaoGuiaTurno />
        </>
      )}
    </>
  );
}

function GrupoConta({ a }) {
  const { prefs, setPrefs, exportarBackup, importarBackup } = useApp();
  const { toast, confirm } = useUI();
  return (
    <>
      {/* uma linha: plano, situação e o caminho para Planos e pagamento */}
      {a.plano && <ResumoDoPlano />}
      {/* ⚠️ Logo abaixo do plano: a conta entregue pela Aurum chega com a senha
          que a Aurum sorteou, e trocar é a primeira coisa que o dono faz. O
          cartão some sozinho para quem não é a conta dona. */}
      <CartaoMinhaSenha toast={toast} />
      {/* Autorizar a Aurum a ver os dados da casa é de quem assina o contrato */}
      {a.suporte && <CartaoSuporteRemoto prefs={prefs} setPrefs={setPrefs} toast={toast} />}
      {/* ⚠️ Os Termos prometem esta exportação (cláusula 15) — nos dois planos */}
      {a.copia && (
        <CartaoMeusDados exportarBackup={exportarBackup} importarBackup={importarBackup}
          toast={toast} confirm={confirm} />
      )}
      <CartaoInstalarApp />
      <CartaoNovidades />
      {a.zonaPerigo && <CartaoZonaPerigo />}
    </>
  );
}
