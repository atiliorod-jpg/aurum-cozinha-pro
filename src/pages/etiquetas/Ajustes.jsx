import { useState } from 'react';
import Layout from '../../components/Layout';
import Botao from '../../components/Botao';
import { Link } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { useAuth } from '../../store/AuthContext';
import { useUI } from '../../store/UIContext';
import { CartaoArmazenamentos, CartaoEtiquetas, CartaoSuporteRemoto } from '../../components/config/CartoesConfig';
import { statusAssinatura, produtoDe } from '../../utils/assinatura';
import { fmtData, isoLocal } from '../../utils/formatters';

/**
 * Ajustes do plano Aurum Etiquetas.
 *
 * Reúne SÓ o que este produto tem: como a etiqueta sai, como os itens são
 * armazenados, quem assina, e a conta. Não monta destinos de saída, mín/máx
 * automático, planilha de produtos nem limpar tudo — são todos de estoque.
 *
 * ⚠️ Esta tela existe porque no plano etiquetas NÃO EXISTE Administração.
 * Sem ela as Configurações ficariam sem porta nenhuma — que é o mesmo defeito
 * de tela-sem-caminho-de-volta que o app já corrigiu em outros lugares. Por
 * isso "Ajustes" tem lugar fixo na barra inferior.
 */
export default function Ajustes() {
  const { prefs, setPref, pessoas, addPessoa, removePessoa } = useApp();
  const { sessao, logout } = useAuth();
  const { toast, confirm } = useUI();
  const [novaPessoa, setNovaPessoa] = useState('');

  const st = statusAssinatura(sessao);
  const prod = produtoDe(sessao);

  const adicionarPessoa = () => {
    const n = novaPessoa.trim();
    if (!n) return;
    if (pessoas.some(p => p.toLowerCase() === n.toLowerCase())) {
      toast('Essa pessoa já está na lista.', 'aviso'); return;
    }
    addPessoa(n);
    setNovaPessoa('');
    toast(`${n} adicionado(a).`, 'sucesso');
  };

  const tirarPessoa = async (p) => {
    const ok = await confirm({
      titulo: `Remover ${p}?`,
      mensagem: 'As etiquetas já impressas com esse nome continuam como estão.',
      perigo: true, confirmar: 'Remover',
    });
    if (ok) { removePessoa(p); toast('Pessoa removida.', 'sucesso'); }
  };

  return (
    <Layout title="Ajustes">
      {/* Armazenamento vem primeiro: define o que a etiqueta imprime */}
      <CartaoArmazenamentos prefs={prefs} setPref={setPref} toast={toast} confirm={confirm} />

      <CartaoEtiquetas prefs={prefs} setPref={setPref} toast={toast} />

      {/* Responsáveis — é o nome que sai assinado na etiqueta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-polo-navy">Responsáveis</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Quem pode assinar a etiqueta. O nome escolhido sai impresso no campo RESP.
          </p>
        </div>
        {pessoas.length === 0 ? (
          <p className="text-xs text-gray-600 italic">Ninguém cadastrado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pessoas.map(p => (
              <span key={p} className="inline-flex items-center gap-1.5 bg-polo-beige text-polo-navy text-xs font-semibold rounded-full pl-3 pr-1.5 py-1.5">
                {p}
                <button onClick={() => tirarPessoa(p)} aria-label={`Remover ${p}`}
                  className="w-5 h-5 rounded-full bg-white/70 text-gray-600 leading-none">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <input type="text" value={novaPessoa} onChange={e => setNovaPessoa(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') adicionarPessoa(); }}
            placeholder="Nome de quem assina" aria-label="Nome do novo responsável"
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
          <Botao onClick={adicionarPessoa} tamanho="sm" largura="auto">Adicionar</Botao>
        </div>
      </div>

      {/* Conta e plano */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-polo-navy">Sua conta</p>
          <p className="text-xs text-gray-500 mt-0.5">{sessao?.restauranteNome}</p>
        </div>
        <div className="text-xs text-gray-700 space-y-1">
          <p>Plano: <strong>{prod.label}</strong> — R$ {prod.precoMes}/mês</p>
          <p>
            {st.tipo === 'assinatura' ? `Assinatura válida até ${fmtData(isoLocal(new Date(st.ate)))}`
              : st.tipo === 'teste' ? `Teste grátis até ${fmtData(isoLocal(new Date(st.ate)))}`
              : st.tipo === 'isento' ? 'Sem cobrança para esta conta'
              : 'Assinatura vencida'}
          </p>
        </div>
        {/* Caminho do upgrade: quem cresceu e quer estoque precisa saber que dá */}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-600 mb-2">
            Precisa também de estoque, compras, produção e relatórios? O <strong>Aurum Cozinha Pro</strong> tem
            tudo isso — e os seus itens e etiquetas continuam exatamente onde estão.
          </p>
          <Link to="/pagamento">
            <Botao variante="secundario" tamanho="sm" largura="auto">Ver planos</Botao>
          </Link>
        </div>
      </div>

      <CartaoSuporteRemoto prefs={prefs} setPref={setPref} toast={toast} />

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <Botao variante="secundario" onClick={async () => {
          const ok = await confirm({ titulo: 'Sair da conta', mensagem: 'Você vai precisar entrar de novo.', confirmar: 'Sair' });
          if (ok) logout();
        }}>Sair da conta</Botao>
      </div>
    </Layout>
  );
}
