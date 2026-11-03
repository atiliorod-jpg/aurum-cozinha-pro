import { useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { EtiquetaLabel } from './EtiquetaPrint';
import { montarCamposEtiqueta, configEtiqueta } from '../utils/etiquetas';
import { dadosDaEtiqueta } from '../utils/unidades';
import { acharArmazenamento } from '../utils/armazenamento';
import { listarEstados } from '../utils/metodos';
import { hoje, fmtHora } from '../utils/formatters';

// =====================================================================
//  "VER ETIQUETA" DENTRO DA FICHA DO ITEM (Lote 11, 02/11/2026 — visto no
//  Suflex). Quem cadastra o método quer saber como ele sai no pote antes de
//  gastar rolo: armazenamento, estado, e a validade com ou sem horário.
//
//  ⚠️ O DESENHO É O DA JANELA DE IMPRESSÃO (EtiquetaLabel), com os dados que
//  ainda não foram salvos — o que está na ficha agora. Sai como se fosse
//  impressa neste minuto, sem o responsável (quem imprime decide) e sem o QR
//  (o código só existe quando a etiqueta é impressa de verdade).
// =====================================================================
export default function PreviaEtiquetaItem({ item, metodo }) {
  const { prefs, estoqueAtual, unidadeAtual } = useApp();
  const { sessao } = useAuth();
  const { nome: nomeImpresso, estabelecimento } = useMemo(() => dadosDaEtiqueta({
    unidade: unidadeAtual, estoque: estoqueAtual, nomeConta: sessao?.restauranteNome,
    cnpjConta: sessao?.cnpj, estabelecimentoConta: prefs.estabelecimento,
  }), [unidadeAtual, estoqueAtual, sessao?.restauranteNome, sessao?.cnpj, prefs.estabelecimento]);
  const config = useMemo(() => ({ ...configEtiqueta(prefs), incluirQR: false }), [prefs]);
  const armaz = acharArmazenamento(prefs, metodo.armazenamento);
  const estado = listarEstados(prefs).find(e => e.id === metodo.estado);
  const hora = fmtHora();
  const campos = montarCamposEtiqueta({
    nome: (item.nome || '').trim() || 'Nome do item',
    dataFabricacao: hoje(),
    tipoData: item.tipoData,
    armazenamento: metodo.armazenamento,
    armazenamentoNome: armaz?.nome || '',
    armazenamentoFaixa: armaz?.faixa || '',
    estadoNome: estado?.nome || '',
    diasValidade: parseInt(metodo.dias) || 0,
    horasValidade: parseInt(metodo.horas) || 0,
    minutosValidade: parseInt(metodo.minutos) || 0,
    mostrarHora: metodo.mostrarHora !== false,
    restauranteNome: nomeImpresso,
    medida: (item.medidaPadrao || '').trim(),
    marca: (item.marca || '').trim(),
    sif: (item.sif || '').trim(),
    hora,
  });
  return (
    <div>
      <div className="bg-gray-100 rounded-xl p-3 flex justify-center overflow-x-auto">
        <div className="shadow-md flex-shrink-0">
          <EtiquetaLabel campos={campos} config={config} estabelecimento={estabelecimento} />
        </div>
      </div>
      <p className="text-xs text-gray-600 mt-1">
        Como sairia agora, às {hora}.{' '}
        {campos.validadeFmt ? `Vence ${campos.validadeFmt}.` : 'Sem prazo: sai sem data de vencimento.'}
      </p>
    </div>
  );
}
