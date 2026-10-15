import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { useAuth } from '../../store/AuthContext';
import { useUI } from '../../store/UIContext';
import { DIGITOS, senhaNoFormato, temSenha, gerarRegistroDeSenha } from '../../utils/senhaEquipe';
import Botao from '../Botao';
import Aviso from '../Aviso';
import Icon from '../Icons';

// =====================================================================
//  A EQUIPE E A SENHA DE CADA NOME (13/10/2026)
//
//  Um cartão só para os dois planos (Responsáveis no Etiquetas; Equipe em
//  Configurações → Acessos no Pro). Antes eram duas listas de "chips"
//  escritas duas vezes.
//
//  ⚠️ OS NOMES NÃO SÃO AS CONTAS. A conta de acesso pode ser de um posto
//  ("Produção", "Noite"); aqui entra todo mundo que imprime, e é esta lista
//  que aparece em "Quem vai imprimir?".
//
//  ⚠️ SÓ A CONTA DONA mexe nas senhas (decisão do dono). Ela cria, repassa
//  para a pessoa, troca e tira. Depois de salva, ninguém vê a senha — nem a
//  dona: esqueceu, cria outra.
// =====================================================================

function FormSenha({ nome, aoSalvar, aoCancelar }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const soNumeros = (v) => v.replace(/\D/g, '').slice(0, DIGITOS);

  const salvar = async () => {
    if (!senhaNoFormato(a)) { setErro(`A senha precisa ter ${DIGITOS} números.`); return; }
    if (a !== b) { setErro('As duas senhas não são iguais. Digite de novo.'); return; }
    setSalvando(true);
    try {
      await aoSalvar(a);
    } catch (e) {
      setErro(e?.message || 'Não foi possível salvar a senha.');
      setSalvando(false);
    }
  };

  // ⚠️ autoComplete="new-password": sem isto, o navegador preenche aqui a
  // senha da CONTA que ele tem guardada — e ela viraria a senha da pessoa.
  const campo = 'w-24 min-h-11 border border-gray-200 rounded-lg px-3 text-base tracking-[0.4em] text-center';
  return (
    <div className="mt-2 bg-polo-beige rounded-lg p-3 space-y-2">
      <p className="text-xs text-gray-700">
        Senha de {DIGITOS} números para <strong>{nome}</strong>. Pode ser, por exemplo, o dia e o mês do aniversário.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-gray-700 flex items-center gap-2">
          Senha
          <input aria-label={`Nova senha de ${nome}`} type="password" inputMode="numeric" autoComplete="new-password"
            maxLength={DIGITOS} value={a} onChange={e => { setA(soNumeros(e.target.value)); setErro(''); }}
            className={campo} />
        </label>
        <label className="text-xs font-semibold text-gray-700 flex items-center gap-2">
          Repita
          <input aria-label={`Repita a senha de ${nome}`} type="password" inputMode="numeric" autoComplete="new-password"
            maxLength={DIGITOS} value={b} onChange={e => { setB(soNumeros(e.target.value)); setErro(''); }}
            onKeyDown={e => { if (e.key === 'Enter') salvar(); }}
            className={campo} />
        </label>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="flex gap-2">
        <Botao variante="secundario" tamanho="sm" largura="auto" onClick={aoCancelar} disabled={salvando}>Cancelar</Botao>
        <Botao tamanho="sm" largura="auto" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar senha'}
        </Botao>
      </div>
    </div>
  );
}

export default function CartaoEquipe({ titulo = 'Equipe', descricao = '' }) {
  const { pessoas, addPessoa, removePessoa, senhasEquipe, definirSenhaDaPessoa } = useApp();
  const { temPermissao } = useAuth();
  const { toast, confirm } = useUI();
  const ehDono = temPermissao('diretoria');
  const [novaPessoa, setNovaPessoa] = useState('');
  const [editando, setEditando] = useState('');

  const adicionar = () => {
    const n = novaPessoa.trim();
    if (!n) return;
    if (pessoas.some(p => p.toLowerCase() === n.toLowerCase())) {
      toast('Essa pessoa já está na lista.', 'aviso'); return;
    }
    addPessoa(n);
    setNovaPessoa('');
    toast(`${n} adicionado(a).`, 'sucesso');
  };

  const remover = async (p) => {
    const ok = await confirm({
      titulo: `Remover ${p}?`,
      mensagem: 'As etiquetas e os registros que já têm esse nome continuam como estão. A senha desse nome também é apagada.',
      perigo: true, confirmar: 'Remover',
    });
    if (ok) { removePessoa(p); if (editando === p) setEditando(''); toast('Pessoa removida.', 'sucesso'); }
  };

  const salvarSenha = async (p, pin) => {
    const registro = await gerarRegistroDeSenha(pin);
    definirSenhaDaPessoa(p, registro);
    setEditando('');
    toast(`Senha de ${p} salva. Repasse para a pessoa: o app não mostra a senha de novo.`, 'sucesso', { duracao: 6000 });
  };

  const tirarSenha = async (p) => {
    const ok = await confirm({
      titulo: `Tirar a senha de ${p}?`,
      mensagem: `Qualquer pessoa vai poder imprimir no nome de ${p} só tocando no nome.`,
      confirmar: 'Tirar senha',
    });
    if (ok) { definirSenhaDaPessoa(p, null); toast(`${p} agora entra sem senha.`, 'sucesso'); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        {/* título de verdade (h2) nos dois planos: era um <p> no Etiquetas */}
        <h2 className="text-sm font-bold text-polo-navy">{titulo}</h2>
        {descricao && <p className="text-xs text-gray-600 mt-0.5">{descricao}</p>}
        <p className="text-xs text-gray-500 mt-1">
          Não precisa ter conta de acesso: a conta pode ser de um posto (como “Produção”) e aqui entra
          todo mundo que imprime. Com senha, só quem sabe os {DIGITOS} números imprime naquele nome.
        </p>
      </div>

      {pessoas.length === 0 ? (
        <p className="text-xs text-gray-600 italic">Ninguém cadastrado ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border-y border-gray-100">
          {pessoas.map(p => {
            const com = temSenha(senhasEquipe, p);
            return (
              <li key={p} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-polo-navy min-w-0 break-words flex-1">{p}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5
                    ${com ? 'bg-polo-navy text-polo-gold' : 'bg-gray-100 text-gray-600'}`}>
                    {com && <Icon name="cadeado" size={12} />}{com ? 'com senha' : 'sem senha'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ehDono && (
                    <button type="button" onClick={() => setEditando(editando === p ? '' : p)}
                      aria-label={`${com ? 'Trocar' : 'Criar'} senha de ${p}`}
                      className="min-h-11 px-3 rounded-lg border border-polo-navy/30 text-polo-navy text-xs font-bold">
                      {com ? 'Trocar senha' : 'Criar senha'}
                    </button>
                  )}
                  {ehDono && com && (
                    <button type="button" onClick={() => tirarSenha(p)} aria-label={`Tirar senha de ${p}`}
                      className="min-h-11 px-3 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold">
                      Tirar senha
                    </button>
                  )}
                  <button type="button" onClick={() => remover(p)} aria-label={`Remover ${p}`}
                    className="min-h-11 px-3 rounded-lg text-red-700 text-xs font-semibold">
                    Remover
                  </button>
                </div>
                {ehDono && editando === p && (
                  <FormSenha nome={p} aoSalvar={(pin) => salvarSenha(p, pin)} aoCancelar={() => setEditando('')} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input aria-label="Nome da pessoa" type="text" value={novaPessoa} onChange={e => setNovaPessoa(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
          placeholder="Nome da pessoa"
          className="flex-1 min-w-0 min-h-11 border border-gray-200 rounded-lg px-3 text-base" />
        <Botao onClick={adicionar} tamanho="sm" largura="auto">Adicionar</Botao>
      </div>
      {!ehDono && pessoas.length > 0 && (
        <p className="text-xs text-gray-500">As senhas são criadas pela conta dona.</p>
      )}
    </div>
  );
}
