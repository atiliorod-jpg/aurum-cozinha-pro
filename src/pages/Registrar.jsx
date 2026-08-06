import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { pode } from '../utils/permissoes';
import { temRecurso, MODULO_PADRAO } from '../utils/modulos';

const SECOES = [
  {
    label: 'Recebimento',
    desc: 'O que chegou do fornecedor',
    acoes: [
      { to: '/compras', emoji: '🛒', titulo: 'Compra', recurso: 'compras', desc: 'Registrar matéria-prima recebida',
        descSeco: 'Registrar o que chegou do fornecedor (grãos, enlatados, descartáveis…)' },
    ],
  },
  {
    label: 'Estoque interno',
    desc: 'Produção e entradas que alimentam o estoque',
    acoes: [
      { to: '/producao', emoji: '🍲', titulo: 'Produção', recurso: 'producao', desc: 'Executar ficha — baixa ingredientes e entra a porção/semiacabado' },
      { to: '/entradas', emoji: '📥', titulo: 'Entrada avulsa', recurso: 'entradas', desc: 'Item só porcionado, sem receita (ex.: picanha cortada e embalada)',
        descSeco: 'Dar entrada de mantimento no estoque' },
    ],
  },
  {
    label: 'Saída e correções',
    desc: 'Transferências internas e ajustes',
    acoes: [
      { to: '/saidas',  emoji: '📤', titulo: 'Saída',         recurso: 'saidas', desc: 'Envio para a cozinha principal / outras unidades (transferência interna)',
        descSeco: 'Requisição: o que saiu do seco para as cozinhas' },
      { to: '/aparas',  emoji: '✂️', titulo: 'Apara / Perda', recurso: 'perdas', desc: 'Aproveitamento e descarte',
        descSeco: 'Registrar o que estragou, quebrou ou venceu' },
    ],
  },
  {
    label: 'Identificação',
    desc: 'Etiquetas de validade para os potes e embalagens',
    acoes: [
      { to: '/etiquetas', emoji: '🏷️', titulo: 'Etiquetas', recurso: 'etiquetas', desc: 'Imprimir etiquetas do estoque ou avulsas' },
      { to: '/validades', emoji: '⏰', titulo: 'Validades', desc: 'O que vence hoje, em 3 dias, ou já venceu' },
      { to: '/historico', emoji: '📋', titulo: 'Histórico geral', desc: 'Tudo que foi registrado, de todas as telas, num lugar só' },
    ],
  },
  {
    label: 'Fim do turno',
    desc: 'Conte a sobra da bancada — o consumo é calculado sozinho',
    acoes: [
      { to: '/fechar-turno', emoji: '🍳', titulo: 'Fechar turno', recurso: 'fecharTurno',
        desc: 'Contagem da sobra: recebido − sobra − perdas = consumo do turno' },
    ],
  },
  {
    label: 'Conferência',
    desc: 'Ajuste o estoque quando conferir a prateleira',
    acoes: [
      // gate: só quem tem a permissão de inventário (a rota já exige o mesmo)
      { to: '/inventario', emoji: '📐', titulo: 'Contagem física', recurso: 'inventario', desc: 'Corrige o estoque para o valor contado na prateleira', cap: 'inventario' },
    ],
  },
];

export default function Registrar() {
  const { modulo, permissoes } = useApp();
  const { sessao } = useAuth();
  const podeAcao = (a) => !a.cap || pode(sessao, permissoes, a.cap);
  // esconde o que não existe no módulo aberto (o seco não tem receita nem apara)
  const noModulo = (a) => !a.recurso || temRecurso(modulo, a.recurso);
  const texto = (a) => (modulo !== MODULO_PADRAO && a.descSeco) ? a.descSeco : a.desc;
  const secoes = SECOES
    .map(s => ({ ...s, acoes: s.acoes.filter(a => podeAcao(a) && noModulo(a)) }))
    .filter(s => s.acoes.length > 0);

  return (
    <Layout title="Registrar">
      <div className="space-y-5">
        {secoes.map(s => (
          <div key={s.label}>
            <div className="mb-2 px-1">
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide">{s.label}</p>
              <p className="text-[11px] text-gray-400">{s.desc}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {s.acoes.map(a => (
                <Link key={a.to} to={a.to}
                  className="bg-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform border border-gray-100
                             focus-visible:outline focus-visible:outline-2 focus-visible:outline-polo-gold">
                  <span className="w-12 h-12 rounded-xl bg-polo-beige flex items-center justify-center text-2xl flex-shrink-0">{a.emoji}</span>
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
