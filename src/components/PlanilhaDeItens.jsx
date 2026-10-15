import { useRef } from 'react';
import Dialogo from './Dialogo';
import Botao from './Botao';
import { useApp } from '../store/AppContext';
import { useUI } from '../store/UIContext';
import { armazenamentosAtivos } from '../utils/armazenamento';
import { temRecurso } from '../utils/modulos';
import { plural } from '../utils/formatters';
import { colunasDoModelo, linhaDoItem, lerPlanilhaDeItens, mesclarItens } from '../utils/planilhaItens';

// =====================================================================
//  PLANILHA DENTRO DE MEUS ITENS (Lote 4 da auditoria, 14/10/2026)
//
//  Era um cartão em Configurações → Sistema, longe da lista que ela altera.
//  Agora sai com os itens da própria conta: baixar, mexer no Excel e importar
//  de volta é o jeito de cadastrar 200 itens sem tocar 200 vezes na tela.
//  As regras de leitura e mescla estão em utils/planilhaItens.js.
// =====================================================================
export default function PlanilhaDeItens({ soEtiq, aoFechar }) {
  const { produtos, setProdutos, categorias, setCategorias, prefs, logAudit, modulo } = useApp();
  const { toast, confirm } = useUI();
  const arquivoRef = useRef(null);
  const armazenamentos = armazenamentosAtivos(prefs);
  const comEstoque = !soEtiq;
  const meus = produtos.filter(p => p.ativo !== false);

  const baixar = async () => {
    const XLSX = await import('xlsx');
    const colunas = colunasDoModelo({ armazenamentos, comEstoque });
    const titulo = ['MEUS ITENS — Aurum | Colunas com * são obrigatórias. Uma linha por item. Nome igual ao de um item seu atualiza o item; nome novo cria um item.'];
    const grupos = colunas.map((c, i) => (i === 0 || colunas[i - 1].g !== c.g ? c.g : ''));
    const ordenados = [...meus].sort((a, b) =>
      (a.categoria || '').localeCompare(b.categoria || '') || (a.nome || '').localeCompare(b.nome || ''));
    const ws = XLSX.utils.aoa_to_sheet([titulo, grupos, colunas.map(c => c.t), ...ordenados.map(p => linhaDoItem(p, colunas))]);
    ws['!cols'] = colunas.map((c, i) => ({ wch: i === 0 ? 32 : Math.max(14, Math.min(c.t.length + 2, 30)) }));
    const instrucoes = [
      ['Coluna', 'O que preencher'],
      ['Nome', 'Obrigatório. Igual ao de um item seu: atualiza o item. Nome novo: cria um item.'],
      ['Grupo', 'Obrigatório. Ex.: PROTEÍNAS, LATICÍNIOS. Grupo novo é criado sozinho.'],
      ['Unidade', 'kg, g, L, mL ou unid.'],
      ['Medida padrão', 'Sugestão do campo Medida ao imprimir. Ex.: 150 g, 1 kg.'],
      ['Data na etiqueta', '"manipulação" (você porcionou, cortou ou cozinhou) ou "abertura" (você abriu a embalagem do fabricante).'],
      ['Prazo (dias)', 'Uma coluna por armazenamento da casa: quantos dias o item dura guardado ali. Vazio ou 0 = sem prazo.'],
      ['Marca/Fornecedor e SIF', 'Saem na etiqueta. Opcionais.'],
      ...(comEstoque ? [
        ['Controla estoque', '"sim" = entra no Início, nas Entradas, Saídas e na Contagem. "não" = só etiqueta.'],
        ['Estoque inicial', 'O ponto de partida, antes dos lançamentos. Para acertar o saldo de hoje, use a Contagem.'],
        ['Mínimo e Máximo', 'Abaixo do mínimo, o item vai para a lista de compras; o máximo é a meta de reposição. 0 = sem meta.'],
        ['Peso por unidade (g)', 'Só para item contado por unidade: converte a lista de compras em kg.'],
        ['Perda na cocção e Entra cozido', 'Para item que entra no estoque já cozido: quanto % se perde no cozimento.'],
      ] : []),
      ['Coluna que não existir', 'Não mexe no item. Pode apagar as colunas que não usa.'],
    ];
    const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInst['!cols'] = [{ wch: 30 }, { wch: 100 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Itens');
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções');
    XLSX.writeFile(wb, 'meus_itens.xlsx');
    toast(meus.length ? `Planilha baixada com ${plural(meus.length, 'item', 'itens')}.` : 'Planilha baixada. Preencha uma linha por item e importe aqui.', 'sucesso');
  };

  const importar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        const { itens, erro } = lerPlanilhaDeItens(rows, { armazenamentos });
        if (erro) { toast(erro, 'erro'); return; }
        const ok = await confirm({
          titulo: 'Importar planilha',
          mensagem: `Encontrei ${plural(itens.length, 'item', 'itens')}. Os que já existem (mesmo nome) serão atualizados; os novos serão criados. Continuar?`,
          confirmar: 'Importar',
        });
        if (!ok) return;
        const r = mesclarItens(produtos, itens, {
          armazenamentoPadrao: armazenamentos[0]?.id || 'congelado',
          grupoPadrao: categorias[0] || 'OUTROS',
          comEstoque,
          abertoPorPadrao: temRecurso(modulo, 'etiquetaDeAbertura'),
        });
        const novas = [...new Set(itens.map(i => i.categoria).filter(c => c && !categorias.includes(c)))];
        if (novas.length) setCategorias([...categorias, ...novas]);
        setProdutos(r.produtos);
        logAudit('importou planilha de itens', `${r.criados} novos, ${r.atualizados} atualizados`);
        toast(`Planilha importada: ${plural(r.criados, 'novo', 'novos')}, ${plural(r.atualizados, 'atualizado', 'atualizados')}.`, 'sucesso');
        aoFechar();
      } catch (err) {
        toast(err?.message || 'Não foi possível ler a planilha. Use a planilha baixada aqui.', 'erro');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Dialogo aoFechar={aoFechar} titulo="Planilha de itens" largura="md" classeCaixa="space-y-4">
      <p className="text-sm text-gray-700">
        Para cadastrar ou mudar muitos itens de uma vez, no Excel ou no Google Planilhas.
      </p>
      <ol className="text-sm text-gray-700 list-decimal pl-5 space-y-1">
        <li>Baixe a planilha. Ela vem com {meus.length ? `os seus ${plural(meus.length, 'item', 'itens')}` : 'as colunas prontas'}.</li>
        <li>Mude o que quiser e acrescente linhas. Nome igual atualiza o item; nome novo cria um item.</li>
        <li>Importe a planilha aqui.</li>
      </ol>
      <div className="flex flex-col gap-2">
        <Botao onClick={baixar}>Baixar planilha</Botao>
        <Botao variante="secundario" onClick={() => arquivoRef.current?.click()}>Importar planilha</Botao>
      </div>
      <input ref={arquivoRef} type="file" onChange={importar} className="hidden" aria-label="Arquivo da planilha"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
    </Dialogo>
  );
}
