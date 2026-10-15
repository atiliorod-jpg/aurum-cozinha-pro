import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Icon from '../components/Icons';
import { useApp } from '../store/AppContext';
import { useAuth, CARGOS } from '../store/AuthContext';
import { useUI } from '../store/UIContext';
import { GRUPOS_ADMIN, useAcessosAdmin } from '../store/acessosAdmin';
import { temRecurso } from '../utils/modulos';
import {
  CartaoSuporteRemoto, CartaoArmazenamentos, CartaoEtiquetas, CartaoEstabelecimento, CartaoContas,
  CartaoCargos, CartaoMeusDados, CartaoUnidades, CartaoEquipeDasUnidades,
} from '../components/config/CartoesConfig';
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
    <Link to={to} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-3 active:scale-[0.99] transition-transform">
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
      {/* No Pro, unidades e cozinhas têm tela própria (criar, renomear,
          arquivar cozinha). No plano Etiquetas não há cozinha para criar: só a
          lista de unidades e onde cada conta trabalha — e os dois cartões
          somem com uma unidade só. */}
      {a.unidades && (a.soEtiq ? (
        <>
          <CartaoUnidades />
          <CartaoEquipeDasUnidades />
        </>
      ) : (
        <LinkCartao to="/estoques" icone="estabelecimento" titulo="Unidades e cozinhas"
          desc="Cada unidade com o seu CNPJ, as cozinhas de cada uma e onde cada conta trabalha" />
      ))}
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
      {/* ⚠️ QR só no Pro: quem lê o código é a baixa pela etiqueta e a
          contagem por câmera, telas que só existem lá. */}
      <CartaoEtiquetas prefs={prefs} setPref={setPref} toast={toast} mostrarQR={!a.soEtiq} />
      <LinkCartao to={a.soEtiq ? '/?aba=impressora' : '/etiquetas?aba=impressora'} icone="etiqueta"
        titulo="Impressora e rolo" desc="Ligar a impressora, o rolo 60 × 50 mm e a etiqueta de teste" />
    </>
  );
}

function GrupoEquipe({ a }) {
  const { permissoes, setPermissoes, logAudit } = useApp();
  const { sessao, usuarios, criarConta, trocarSenhaDe, removerConta, desativarUsuario,
          reativarUsuario, definirApelido, alterarCargo } = useAuth();
  const { toast, confirm } = useUI();
  return (
    <>
      {/* Os NOMES de quem registra e imprime, com a senha de cada um. Não são
          as contas de acesso: essas vêm logo abaixo. */}
      {a.nomes && (
        <CartaoEquipe titulo="Nomes da equipe"
          descricao={a.soEtiq
            ? 'Quem imprime e assina a etiqueta. O nome sai impresso no campo RESP.'
            : 'Quem aparece em “Quem está registrando?” e em “Quem vai imprimir?”. O nome sai no lançamento e no campo RESP. da etiqueta.'} />
      )}
      {/* ⚠️ O plano Etiquetas não tinha COMO colocar ninguém para dentro: a
          tela de acessos morava só no Pro. Quem etiqueta no dia a dia não é
          quem assina o contrato. */}
      {a.contas && (
        <CartaoContas sessao={sessao} usuarios={usuarios} cargos={CARGOS}
          criarConta={criarConta} trocarSenhaDe={trocarSenhaDe} removerConta={removerConta}
          desativarUsuario={desativarUsuario} reativarUsuario={reativarUsuario}
          definirApelido={definirApelido} alterarCargo={alterarCargo} logAudit={logAudit}
          permissoes={permissoes} toast={toast} confirm={confirm} />
      )}
      {/* ⚠️ Logo depois das contas: criar o acesso e decidir o que ele alcança
          são a mesma tarefa. E A MATRIZ NUNCA É DELEGADA: quem pudesse
          editá-la se daria qualquer outra permissão. */}
      {a.cargos && (
        <CartaoCargos permissoes={permissoes} setPermissoes={setPermissoes}
          usuarios={usuarios} soEtiquetas={a.soEtiq} toast={toast} confirm={confirm} />
      )}
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
