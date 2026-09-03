import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { faltasDoPrimeiroUso } from '../utils/primeiroUso';

// =====================================================================
//  PrimeiroUso — as duas coisas que a etiqueta precisa e a conta nova não tem
//
//  ⚠️ O QUE ISTO EVITA, e foi visto numa conta real: criar a conta, cadastrar
//  um item e imprimir um rolo inteiro com o campo RESP. em branco. O
//  responsável é um dos cinco campos que a etiqueta de manipulação precisa ter,
//  e o endereço do estabelecimento sai no rodapé — os dois moram na
//  Administração, e ninguém adivinha que precisa ir lá antes de imprimir. A
//  tela de impressão dizia "Nenhuma pessoa cadastrada" num canto e o botão de
//  imprimir liberava do mesmo jeito.
//
//  ⚠️ PEDE AQUI, NÃO MANDA PARA OUTRA TELA. Um link para a Administração no
//  meio do primeiro uso é o mesmo beco que já corrigimos duas vezes: a pessoa
//  vai, se perde no meio dos cartões e volta sem ter feito. São dois campos —
//  cabem no caminho.
//
//  ⚠️ SÓ PARA A CONTA DONA. A cozinha não alcança nem a equipe nem os dados do
//  estabelecimento; mostrar o formulário para ela seria oferecer um botão que
//  leva a uma recusa, que é exatamente o defeito do "Meus itens" negado.
//
//  Some sozinho quando as duas coisas existem — e dá para adiar, porque é
//  aviso, não portão: quem está com o pote na mão pode resolver depois.
// =====================================================================
export default function PrimeiroUso() {
  const { pessoas, addPessoa, prefs, setPref } = useApp();
  const { temPermissao } = useAuth();
  const [nome, setNome] = useState('');
  const est = prefs.estabelecimento || {};
  const [endereco, setEndereco] = useState(est.endereco || '');
  const [cidade, setCidade] = useState(est.cidade || '');

  const { mostrar, faltaPessoa, faltaEndereco } =
    faltasDoPrimeiroUso({ pessoas, prefs, ehDiretoria: temPermissao('diretoria') });
  if (!mostrar) return null;

  const salvarPessoa = () => {
    const n = nome.trim();
    if (n.length < 2) return;
    addPessoa(n);
    setNome('');
  };

  const salvarEndereco = () => {
    // ⚠️ Mescla com o que já existe: o CEP e o resto do rodapé são gravados na
    // MESMA chave pela tela de Administração, e sobrescrever o objeto inteiro
    // apagaria o que a pessoa preencheu lá.
    setPref('estabelecimento', { ...est, endereco: endereco.trim(), cidade: cidade.trim() });
  };

  const campo = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white';

  return (
    <section aria-labelledby="pu-titulo"
      className="bg-polo-beige border border-polo-gold/40 rounded-xl px-3 pt-2.5 pb-3 mb-3">
      <div className="flex items-start justify-between gap-2">
        <h2 id="pu-titulo" className="text-sm font-bold text-polo-navy">
          Antes de imprimir o primeiro rolo
        </h2>
        <button type="button" onClick={() => setPref('primeiroUsoAdiado', true)}
          aria-label="Deixar para depois"
          className="text-gray-500 text-lg font-bold leading-none min-w-11 min-h-11 flex items-center justify-center -mr-2 -mt-2">
          ×
        </button>
      </div>
      <p className="text-xs text-gray-700 mt-0.5">
        {faltaPessoa && faltaEndereco
          ? 'Faltam duas coisas que saem impressas na etiqueta.'
          : faltaPessoa
            ? 'Falta quem assina a etiqueta — é o campo RESP.'
            : 'Falta o endereço, que sai no rodapé da etiqueta.'}
      </p>

      {faltaPessoa && (
        <div className="mt-2.5">
          <label htmlFor="pu-pessoa" className="block text-[11px] font-semibold text-gray-600 mb-1">
            Quem assina as etiquetas
          </label>
          <div className="flex gap-2">
            <input id="pu-pessoa" type="text" value={nome} onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvarPessoa(); }}
              placeholder="Nome de quem manipula" className={campo} />
            <button type="button" onClick={salvarPessoa} disabled={nome.trim().length < 2}
              className="bg-polo-navy text-polo-gold font-bold px-4 rounded-lg text-sm disabled:opacity-40 min-h-11 flex-shrink-0">
              Add
            </button>
          </div>
          <p className="text-[11px] text-gray-600 mt-1">
            Dá para cadastrar mais gente depois, na Administração.
          </p>
        </div>
      )}

      {faltaEndereco && (
        <div className="mt-2.5">
          <label htmlFor="pu-end" className="block text-[11px] font-semibold text-gray-600 mb-1">
            Endereço do estabelecimento
          </label>
          <input id="pu-end" type="text" value={endereco} onChange={e => setEndereco(e.target.value)}
            placeholder="Rua, número" className={campo} />
          <label htmlFor="pu-cid" className="block text-[11px] font-semibold text-gray-600 mb-1 mt-2">
            Cidade - UF
          </label>
          <input id="pu-cid" type="text" value={cidade} onChange={e => setCidade(e.target.value)}
            placeholder="Recife - PE" className={campo} />
          <button type="button" onClick={salvarEndereco} disabled={!endereco.trim()}
            className="mt-2 w-full bg-polo-navy text-polo-gold font-bold text-sm py-2.5 rounded-xl disabled:opacity-40 min-h-11">
            Salvar endereço
          </button>
        </div>
      )}
    </section>
  );
}
