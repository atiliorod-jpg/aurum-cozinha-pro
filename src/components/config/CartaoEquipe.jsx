import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { useAuth } from '../../store/AuthContext';
import { useUI } from '../../store/UIContext';
import { DIGITOS, temSenha } from '../../utils/senhaEquipe';
import { DIAS_SEM_USO, ultimoUso, diasParaSair } from '../../utils/usoEquipe';
import { hoje, isoLocal, fmtDataDoBanco } from '../../utils/formatters';
import { textoDaFalhaDeRede } from '../../utils/conexao';
import Botao from '../Botao';
import Icon from '../Icons';

// =====================================================================
//  A EQUIPE E A SENHA DE CADA NOME (13/10/2026; jeito do Magurō 23/11/2026)
//
//  Um cartão só para os dois planos (Administração → Equipe).
//
//  ⚠️ OS NOMES NÃO SÃO AS CONTAS. A conta de acesso pode ser de um posto
//  ("Produção", "Noite"); aqui entra todo mundo que imprime, e é esta lista
//  que aparece em "Quem vai imprimir?".
//
//  ⚠️ NINGUÉM CRIA A SENHA DO OUTRO (desde 23/11/2026): cada pessoa cria a
//  sua no primeiro toque no nome. A conta dona só ZERA, quando a pessoa
//  esquece — e ela cria outra no próximo toque. Ninguém vê senha nenhuma.
//
//  ⚠️ NOME PARADO SAI SOZINHO: 60 dias de uso da cozinha sem a pessoa
//  entrar (regra em utils/usoEquipe.js). Faltando 15 dias ou menos, o
//  cartão avisa.
// =====================================================================

const AVISAR_FALTANDO = 15;

function textoDoUltimoUso(dia) {
  if (!dia) return '';
  if (dia === hoje()) return 'Último uso: hoje';
  if (dia === isoLocal(new Date(Date.now() - 86_400_000))) return 'Último uso: ontem';
  return `Último uso: ${fmtDataDoBanco(dia)}`;
}

export default function CartaoEquipe({ titulo = 'Equipe', descricao = '' }) {
  const { pessoas, addPessoa, removePessoa, senhasEquipe, usoEquipe, zerarSenhaDaPessoa } = useApp();
  const { temPermissao } = useAuth();
  const { toast, confirm } = useUI();
  const ehDono = temPermissao('diretoria');
  const [novaPessoa, setNovaPessoa] = useState('');
  const [zerando, setZerando] = useState('');

  const adicionar = () => {
    const n = novaPessoa.trim();
    if (!n) return;
    if (pessoas.some(p => p.toLowerCase() === n.toLowerCase())) {
      toast('Essa pessoa já está na lista.', 'aviso'); return;
    }
    addPessoa(n);
    setNovaPessoa('');
    toast(`${n} adicionado(a). No primeiro toque no nome, a pessoa cria a senha dela.`, 'sucesso', { duracao: 6000 });
  };

  const remover = async (p) => {
    const ok = await confirm({
      titulo: `Remover ${p}?`,
      mensagem: 'As etiquetas e os registros que já têm esse nome continuam como estão. A senha desse nome também é apagada.',
      perigo: true, confirmar: 'Remover',
    });
    if (ok) { removePessoa(p); toast('Pessoa removida.', 'sucesso'); }
  };

  // ⚠️ PRECISA DE INTERNET: zerar sem internet e gravar depois, por cima do
  // servidor, apagaria a senha que outra pessoa criou nesse meio-tempo.
  const zerar = async (p) => {
    const ok = await confirm({
      titulo: `Zerar a senha de ${p}?`,
      mensagem: `No próximo toque no nome, ${p} cria uma senha nova. Use quando a pessoa esquecer a senha.`,
      confirmar: 'Zerar senha',
    });
    if (!ok) return;
    setZerando(p);
    const r = await zerarSenhaDaPessoa(p);
    setZerando('');
    if (r.ok) {
      toast(`Senha de ${p} zerada. No próximo toque no nome, a pessoa cria outra.`, 'sucesso', { duracao: 6000 });
    } else if (r.semRede) {
      toast(`A senha não foi zerada. ${await textoDaFalhaDeRede()}`, 'erro', { duracao: 8000 });
    } else {
      toast(r.soLeitura ? 'No modo suporte não dá para zerar senha.' : (r.erro || 'Não foi possível zerar a senha.'), 'erro');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 space-y-3">
      <div>
        <h2 className="text-base font-bold text-polo-navy">{titulo}</h2>
        {descricao && <p className="text-sm text-gray-600 mt-0.5">{descricao}</p>}
        <p className="text-sm text-gray-600 mt-1">
          Não precisa ter conta de acesso: a conta pode ser de um posto (como “Produção”) e aqui entra
          todo mundo que imprime. Cada pessoa cria a própria senha de {DIGITOS} números no primeiro toque
          no nome. Esqueceu? Toque em Zerar senha, e ela cria outra.
        </p>
        <p className="text-sm text-gray-600 mt-1">
          Quem fica {DIAS_SEM_USO} dias de uso sem entrar sai sozinho da lista. Só contam os dias em que a
          cozinha usou o app: férias e folga geral não contam. O que a pessoa já imprimiu continua com o nome dela.
        </p>
      </div>

      {pessoas.length === 0 ? (
        <p className="text-sm text-gray-600 italic">Ninguém cadastrado ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border-y border-gray-100">
          {pessoas.map(p => {
            const com = temSenha(senhasEquipe, p);
            const resta = diasParaSair(usoEquipe, p);
            const perto = resta !== null && resta <= AVISAR_FALTANDO;
            const uso = com ? textoDoUltimoUso(ultimoUso(usoEquipe, p)) : '';
            return (
              <li key={p} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-polo-navy min-w-0 break-words flex-1">{p}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2 py-0.5
                    ${com ? 'bg-polo-navy text-polo-gold' : 'bg-amber-100 text-amber-900'}`}>
                    {com && <Icon name="cadeado" size={12} />}{com ? 'com senha' : '1º acesso'}
                  </span>
                </div>
                {(uso || perto) && (
                  <p className="text-xs mt-1">
                    {uso && <span className="text-gray-600">{uso}</span>}
                    {uso && perto && <span className="text-gray-600"> · </span>}
                    {perto && (
                      <strong className="text-amber-900">
                        {resta === 0 ? 'sai da lista hoje' : `sai da lista em ${resta} ${resta === 1 ? 'dia' : 'dias'} de uso sem entrar`}
                      </strong>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ehDono && com && (
                    <button type="button" onClick={() => zerar(p)} disabled={zerando === p}
                      aria-label={`Zerar senha de ${p}`}
                      className="min-h-12 px-3 rounded-xl border-2 border-polo-navy/20 text-polo-navy text-sm font-bold
                                 inline-flex items-center gap-1.5 disabled:opacity-50">
                      <Icon name="cadeado" size={14} />{zerando === p ? 'Zerando…' : 'Zerar senha'}
                    </button>
                  )}
                  <button type="button" onClick={() => remover(p)} aria-label={`Remover ${p}`}
                    className="min-h-12 px-3 rounded-xl text-red-700 text-sm font-semibold">
                    Remover
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input aria-label="Nome da pessoa" type="text" value={novaPessoa} onChange={e => setNovaPessoa(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
          placeholder="Nome da pessoa"
          className="flex-1 min-w-0 min-h-12 border-2 border-polo-navy/15 rounded-xl px-3 text-base" />
        <Botao onClick={adicionar} tamanho="sm" largura="auto">Adicionar</Botao>
      </div>
      {!ehDono && pessoas.some(p => temSenha(senhasEquipe, p)) && (
        <p className="text-sm text-gray-600">Só a conta dona zera senhas.</p>
      )}
    </div>
  );
}
