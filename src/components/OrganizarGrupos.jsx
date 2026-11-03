import { useState } from 'react';
import Dialogo from './Dialogo';
import Botao from './Botao';
import { useUI } from '../store/UIContext';
import { plural } from '../utils/formatters';
import { nomeDeGrupo, gruposDoProduto, moverGrupo, renomearGrupo, removerGrupo, itensNoGrupo } from '../utils/grupos';

// =====================================================================
//  ORGANIZAR GRUPOS (Lote 11, parte 2, 03/11/2026 — visto no Suflex). Mora em
//  Meus itens, perto dos itens que organiza (decisão do dono). A casa cria,
//  renomeia, ordena e apaga os grupos; a ORDEM daqui é a ordem dos cabeçalhos
//  em Meus itens e na tela de imprimir. Quem marca o item no grupo é a ficha.
//
//  ⚠️ Cada toque grava na hora (como o resto da Administração): não existe
//  "Salvar" para esquecer. Renomear troca o nome também em todos os itens.
// =====================================================================
export default function OrganizarGrupos({ produtos, setProdutos, categorias, setCategorias, aoFechar }) {
  const { toast, confirm } = useUI();
  const [renomeando, setRenomeando] = useState(null);
  const [texto, setTexto] = useState('');
  const [novo, setNovo] = useState('');

  // ⚠️ A LISTA COMPLETA: a da casa + grupo usado por item e que não está nela
  // (veio de planilha antiga, cópia de segurança...). Sem eles aqui, um grupo
  // visível nas listas não teria onde ser renomeado ou apagado.
  const usados = [...new Set(produtos.filter(p => p.ativo !== false).flatMap(gruposDoProduto))];
  const lista = [...categorias, ...usados.filter(g => !categorias.includes(g)).sort()];

  const criar = () => {
    const nome = nomeDeGrupo(novo);
    if (!nome) return;
    if (lista.includes(nome)) { toast(`Já existe o grupo "${nome}".`, 'aviso'); return; }
    setCategorias([...lista, nome]);
    setNovo('');
    toast(`Grupo "${nome}" criado. Marque os itens dele na ficha de cada um.`, 'sucesso');
  };

  const salvarNome = (de) => {
    const r = renomearGrupo(produtos, lista, de, texto);
    if (r.erro) { toast(r.erro, 'aviso'); return; }
    if (r.produtos !== produtos) setProdutos(r.produtos);
    setCategorias(r.categorias);
    setRenomeando(null);
    if (nomeDeGrupo(texto) !== de) toast(`"${de}" agora é "${nomeDeGrupo(texto)}".`, 'sucesso');
  };

  const remover = async (g) => {
    const r = removerGrupo(produtos, lista, g);
    if (r.presos.length) {
      toast(`${plural(r.presos.length, 'item só está', 'itens só estão')} no grupo "${g}". Marque outro grupo neles antes.`, 'aviso');
      return;
    }
    const n = itensNoGrupo(produtos, g);
    const ok = await confirm({
      titulo: `Remover o grupo "${g}"?`,
      mensagem: n
        ? `Ele sai de ${plural(n, 'item', 'itens')}, que continuam nos outros grupos deles.`
        : 'Nenhum item está nele.',
      perigo: true, confirmar: 'Remover',
    });
    if (!ok) return;
    if (n) setProdutos(r.produtos);
    setCategorias(r.categorias);
    toast(`Grupo "${g}" removido.`, 'sucesso');
  };

  const botao = 'min-h-11 min-w-11 px-3 rounded-lg text-sm font-bold disabled:opacity-40';
  return (
    <Dialogo aoFechar={aoFechar} titulo="Organizar grupos" forma="ficha" largura="lg" camada={70} classeCaixa="space-y-3">
      <p className="text-xs text-gray-600">
        A ordem daqui é a ordem das listas. Para pôr um item num grupo, abra a ficha dele:
        um item pode estar em mais de um grupo.
      </p>
      <ul className="divide-y divide-gray-100 border-y border-gray-100">
        {lista.map((g, i) => {
          const n = itensNoGrupo(produtos, g);
          return (
            <li key={g} className="py-2">
              {renomeando === g ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={texto} autoFocus maxLength={40}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') salvarNome(g); }}
                    aria-label={`Novo nome do grupo ${g}`}
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <Botao onClick={() => salvarNome(g)} tamanho="sm" largura="auto">Salvar</Botao>
                  <button type="button" onClick={() => setRenomeando(null)} className="min-h-11 px-2 text-sm text-gray-600">Cancelar</button>
                </div>
              ) : (
                // nome numa linha, botões na outra: no celular os quatro
                // botões ao lado do nome o cortavam em poucas letras
                <div>
                <p className="text-sm">
                  <span className="font-semibold text-gray-900 break-words">{g}</span>
                  <span className="text-xs text-gray-600"> · {n ? plural(n, 'item', 'itens') : 'vazio'}</span>
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  {/* setas de texto, não emoji: o app não usa emoji na interface */}
                  <button type="button" onClick={() => setCategorias(moverGrupo(lista, g, -1))} disabled={i === 0}
                    aria-label={`Subir o grupo ${g}`} className={`${botao} text-polo-navy`}>↑</button>
                  <button type="button" onClick={() => setCategorias(moverGrupo(lista, g, +1))} disabled={i === lista.length - 1}
                    aria-label={`Descer o grupo ${g}`} className={`${botao} text-polo-navy`}>↓</button>
                  <button type="button" onClick={() => { setRenomeando(g); setTexto(g); }}
                    aria-label={`Renomear o grupo ${g}`} className={`${botao} text-polo-navy`}>Renomear</button>
                  <button type="button" onClick={() => remover(g)}
                    aria-label={`Remover o grupo ${g}`} className={`${botao} text-red-700`}>Remover</button>
                </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2">
        <input type="text" value={novo} maxLength={40} onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') criar(); }}
          placeholder="Novo grupo (ex.: Almoço de funcionários)"
          aria-label="Nome do novo grupo"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <Botao onClick={criar} tamanho="sm" largura="auto">Criar</Botao>
      </div>
      <Botao onClick={aoFechar} variante="secundario">Pronto</Botao>
    </Dialogo>
  );
}
