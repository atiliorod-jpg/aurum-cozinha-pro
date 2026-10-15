// =====================================================================
//  ADMINISTRAÇÃO → CONTA, e o aviso de fila presa (Lote 4, 14/10/2026)
//
//  Viviam soltos na aba Sistema de Configuracoes.jsx, misturados com estoque e
//  etiqueta. O plano Etiquetas não tinha nenhum deles — nem o "Instalar app",
//  nem o aviso de lançamento que não subiu.
// =====================================================================
import { Link } from 'react-router-dom';
import { useApp } from '../../store/AppContext';
import { useUI } from '../../store/UIContext';
import { usePwaInstall } from '../../lib/pwaInstall';
import { fmtData, plural } from '../../utils/formatters';

// A fila de erro mostrava `kind`/`op` crus — nomes internos do banco. Quem lê
// precisa reconhecer o lançamento, não o esquema.
const ROTULO_FILA = {
  compra: 'Compra', entrada: 'Entrada', saida: 'Saída',
  apara: 'Apara', perda: 'Perda', ajuste: 'Contagem', doc: 'Cadastro',
};

/**
 * Lançamentos que pararam de tentar subir. Fica no TOPO da Administração (e
 * não escondido numa aba): é a única tela que diz que algo da cozinha não
 * chegou na nuvem.
 */
export function CartaoFilaComErro() {
  const { mortos, retentarMortos, descartarMortos } = useApp();
  const { toast, confirm } = useUI();
  if (!mortos?.length) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
      <h2 className="text-sm font-bold text-red-800">{plural(mortos.length, 'lançamento não sincronizou', 'lançamentos não sincronizaram')}</h2>
      <p className="text-xs text-red-800 mt-0.5">
        Estes itens falharam várias vezes ao subir para a nuvem e pararam de tentar sozinhos.
        Toque em <strong>Tentar de novo</strong>; se persistir, chame o suporte pela Ajuda.
      </p>
      <ul className="text-xs text-red-800 mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
        {mortos.slice(0, 6).map((m, i) => (
          <li key={m.id || i}>• {ROTULO_FILA[m.kind] || 'Lançamento'}{m.dados?.data ? ` de ${fmtData(m.dados.data)}` : ''}</li>
        ))}
      </ul>
      <div className="flex gap-2 mt-2">
        <button onClick={() => { retentarMortos(); toast('Tentando sincronizar de novo…', 'sucesso'); }}
          className="bg-polo-navy text-polo-gold font-bold px-3 min-h-11 rounded-lg text-sm">Tentar de novo</button>
        <button onClick={async () => {
            const ok = await confirm({ titulo: 'Descartar itens', mensagem: `Descartar ${plural(mortos.length, 'lançamento que não sincroniza', 'lançamentos que não sincronizam')}? Eles somem deste aparelho e não sobem para a nuvem.`, perigo: true, confirmar: 'Descartar' });
            if (ok) { descartarMortos(); toast('Itens descartados.', 'sucesso'); }
          }}
          className="text-red-700 font-semibold px-3 min-h-11 rounded-lg text-sm border border-red-200 bg-white">Descartar</button>
      </div>
    </div>
  );
}

/** Instalar o app na tela inicial deste aparelho. */
export function CartaoInstalarApp() {
  const { podeInstalar, instalado, ios, instalar } = usePwaInstall();
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-bold text-polo-navy">Instalar o app neste aparelho</h2>
          {instalado ? (
            <p className="text-xs text-green-800 mt-0.5">App já instalado neste aparelho.</p>
          ) : ios ? (
            <p className="text-xs text-gray-600 mt-0.5">
              No iPhone ou iPad: toque em <strong>Compartilhar</strong> no Safari e em <strong>"Adicionar à Tela de Início"</strong>.
            </p>
          ) : podeInstalar ? (
            <p className="text-xs text-gray-600 mt-0.5">Coloca o ícone da Aurum na tela inicial, abrindo em tela cheia.</p>
          ) : (
            <p className="text-xs text-gray-600 mt-0.5">
              Se o botão não aparecer: abra o menu <strong>⋮</strong> do navegador e toque em <strong>"Instalar aplicativo"</strong>.
              Caso não apareça, feche o navegador por completo e abra o app de novo.
            </p>
          )}
        </div>
        {!instalado && !ios && podeInstalar && (
          <button onClick={instalar}
            className="bg-polo-navy text-polo-gold font-bold px-4 min-h-11 rounded-lg text-sm whitespace-nowrap">Instalar</button>
        )}
      </div>
    </div>
  );
}

/** O que mudou nas últimas atualizações. */
export function CartaoNovidades() {
  return (
    <Link to="/novidades"
      className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 mb-4 active:scale-[0.99] transition-transform">
      <div>
        <h2 className="text-sm font-bold text-polo-navy">Novidades do app</h2>
        <p className="text-xs text-gray-600 mt-0.5">Veja o que mudou nas últimas atualizações.</p>
      </div>
      <span aria-hidden="true" className="text-polo-navy text-lg">›</span>
    </Link>
  );
}

/**
 * Apagar todos os registros.
 * ⚠️ SÓ A CONTA DONA (Lote 4): ficava na aba Sistema, aberta a qualquer cargo
 * com "configurar o sistema" — inclusive um cargo de cozinha a quem o dono só
 * quis deixar mexer na etiqueta. Quem chama confere o cargo.
 */
export function CartaoZonaPerigo() {
  const { limparTudo } = useApp();
  const { toast, confirm } = useUI();
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3 mb-4">
      <h2 className="text-sm font-bold text-red-800">Zona de perigo</h2>
      <p className="text-xs text-red-800">
        Apaga entradas, saídas, aparas, perdas e contagens. Os itens e as configurações ficam.
      </p>
      <button onClick={async () => {
        const ok = await confirm({ titulo: 'Apagar todos os registros', mensagem: 'ATENÇÃO: isso apaga entradas, saídas, aparas, desperdício e contagens. Esta ação não pode ser desfeita.\n\nDica: baixe uma cópia de segurança antes.', perigo: true, confirmar: 'Apagar tudo' });
        if (ok) { limparTudo(); toast('Todos os registros foram apagados.', 'sucesso'); }
      }}
        className="w-full min-h-11 bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm">
        Apagar todos os registros
      </button>
    </div>
  );
}
