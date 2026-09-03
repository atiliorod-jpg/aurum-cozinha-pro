import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';
import { temRecurso, tipoBase } from '../utils/modulos';
import Icon from '../components/Icons';

const SECOES = [
  {
    label: 'Recebimento',
    desc: 'O que chegou do fornecedor',
    acoes: [
      { to: '/compras', icone: 'compras', titulo: 'Compra', recurso: 'compras', desc: 'Registrar matéria-prima recebida',
        descSeco: 'Registrar o que chegou do fornecedor (grãos, enlatados, descartáveis…)' },
    ],
  },
  {
    label: 'Estoque interno',
    desc: 'Produção e entradas que alimentam o estoque',
    acoes: [
      { to: '/producao', icone: 'producao', titulo: 'Produção', recurso: 'producao', desc: 'Executar uma ficha técnica' },
      { to: '/entradas', icone: 'entradas', titulo: 'Entrada avulsa', recurso: 'entradas', desc: 'Item só porcionado, sem receita (ex.: picanha cortada e embalada)',
        descSeco: 'Dar entrada de mantimento no estoque' },
    ],
  },
  {
    label: 'Saída e correções',
    desc: 'Transferências internas e ajustes',
    acoes: [
      { to: '/saidas',  icone: 'saidas', titulo: 'Saída',         recurso: 'saidas', desc: 'Envio para a cozinha principal / outras unidades (transferência interna)',
        descSeco: 'Requisição: o que saiu do seco para as cozinhas' },
      // Só a Produção tem apara (aproveitamento de corte). No Seco e na
      // Finalização o card é de PERDA pura — "Apara" e a tesoura prometiam
      // uma tela de aproveitamento que não existe ali. A tela em si já abria
      // certa (AparasPerdas abre em Perda); era só o rótulo que mentia.
      { to: '/aparas',  icone: 'correcoes', titulo: 'Apara / Perda', recurso: 'perdas', desc: 'Aproveitamento e descarte',
        semApara: { icone: 'perda', titulo: 'Perda', desc: 'Registrar o que estragou, quebrou ou venceu' } },
    ],
  },
  {
    label: 'Identificação',
    desc: 'Etiquetas de validade para os potes e embalagens',
    acoes: [
      { to: '/etiquetas', icone: 'etiqueta', titulo: 'Etiquetas', recurso: 'etiquetas', desc: 'Imprimir etiquetas do estoque ou avulsas' },
      // "Validades" saiu daqui: é item PERMANENTE da barra inferior, e ter o
      // mesmo destino em dois lugares fazia parecer que eram telas diferentes.
    ],
  },
  {
    label: 'Consulta',
    desc: 'O que já foi lançado',
    acoes: [
      // O nome antigo era "Histórico geral — tudo que foi registrado, de todas
      // as telas". Mentia sobre o escopo: a tela filtra pelo MÓDULO aberto, e
      // quem procurava um lançamento de outro estoque não achava e concluía que
      // o app tinha perdido. Quem é global de verdade é a Auditoria.
      { to: '/historico', icone: 'historico', titulo: 'Histórico',
        desc: 'Tudo que foi lançado neste estoque' },
    ],
  },
  {
    label: 'Fim do turno',
    desc: 'Conte a sobra no fim do serviço',
    acoes: [
      { to: '/fechar-turno', icone: 'frigideira', titulo: 'Fechar turno', recurso: 'fecharTurno',
        desc: 'Conte a sobra no fim do serviço' },
    ],
  },
  {
    label: 'Conferência',
    desc: 'Ajuste o estoque quando conferir a prateleira',
    acoes: [
      // gate: só quem tem a permissão de inventário (a rota já exige o mesmo)
      { to: '/inventario', icone: 'contagem', titulo: 'Contagem física', recurso: 'inventario', desc: 'Corrige o estoque para o valor contado na prateleira', cap: 'inventario' },
    ],
  },
  {
    label: 'Cadastro',
    desc: 'O que este estoque controla',
    acoes: [
      // ⚠️ Isto FALTAVA, e era o buraco que fazia o dono não achar como
      // cadastrar arroz no Seco: a área operacional não tinha NENHUM caminho
      // para o cadastro de produtos. O único era seletor → Administração →
      // Cadastros — quatro toques, e só para quem já sabia que estava lá.
      //
      // Não é destino repetido: a Administração é outra ÁREA, e o app já usa
      // esse mesmo atalho contextual em ResponsavelSelect ("Cadastrar equipe")
      // e em Produção ("Criar ficha"). Quem está com a mercadoria na mão
      // precisa cadastrar dali, não de outra área.
      { to: '/configuracoes?secao=produtos', icone: 'caixa', titulo: 'Produtos do estoque',
        desc: 'Cadastrar item novo, mínimo e máximo', cap: 'gerenciarProdutos' },
    ],
  },
];

export default function Registrar() {
  const { modulo, permissoes } = useApp();
  const { sessao } = useAuth();
  const podeAcao = (a) => !a.cap || pode(sessao, permissoes, a.cap);
  // esconde o que não existe no módulo aberto (o seco não tem receita nem apara)
  const noModulo = (a) => !a.recurso || temRecurso(modulo, a.recurso);
  // Variante do card quando o módulo não tem apara — título, ícone e descrição
  // trocam juntos, senão sobra tesoura com texto de perda.
  const comVariante = (a) => (a.semApara && !temRecurso(modulo, 'aparas')) ? { ...a, ...a.semApara } : a;
  // ⚠️ Pelo TIPO, não por "diferente da produção raiz". `modulo !== MODULO_PADRAO`
  // era verdadeiro para a Finalização e para toda INSTÂNCIA de produção
  // ('producao#ab12'), então uma segunda cozinha de produção mostrava a
  // descrição do Estoque Seco nos cards.
  const texto = (a) => (tipoBase(modulo) === 'seco' && a.descSeco) ? a.descSeco : a.desc;
  const secoes = SECOES
    .map(s => ({ ...s, acoes: s.acoes.filter(a => podeAcao(a) && noModulo(a)).map(comVariante) }))
    .filter(s => s.acoes.length > 0);

  return (
    <Layout title="Registrar">
      <div className="space-y-5">
        {secoes.map(s => (
          <div key={s.label}>
            <div className="mb-2 px-1">
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">{s.label}</p>
              <p className="text-[11px] text-gray-600">{s.desc}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {s.acoes.map(a => (
                <Link key={a.to} to={a.to}
                  className="bg-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform border border-gray-100
                            ">
                  <span className="w-12 h-12 rounded-xl bg-polo-beige text-polo-navy flex items-center justify-center flex-shrink-0">
                    <Icon name={a.icone} size={24} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-polo-navy">{a.titulo}</div>
                    <div className="text-xs text-gray-500">{texto(a)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
