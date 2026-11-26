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

  // ⚠️ REDESIGN (26/11/2026): um cartão por nome — a inicial, a situação da
  // senha, o último uso e as duas ações em contorno (zerar em azul, remover
  // em vinho). O campo de adicionar leva o ícone de pessoa.
  return (
    <div className="cartao space-y-3">
      <div>
        <h2 className="titulo-secao">{titulo}</h2>
        {descricao && <p className="text-sm text-polo-tinta mt-0.5">{descricao}</p>}
        {/* ⚠️ TEXTO CURTO (24/11/2026, pedido do dono): saíram "não precisa ter
            conta de acesso…" (as contas da equipe nem existem mais) e a
            explicação longa dos dias de uso. */}
        <p className="text-sm text-polo-tinta mt-1">
          Cada um cria a própria senha de {DIGITOS} números. Quem fica {DIAS_SEM_USO} dias de uso sem entrar sai da lista.
        </p>
      </div>

      {pessoas.length === 0 ? (
        <p className="text-sm text-polo-tinta">Ninguém cadastrado ainda.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {pessoas.map(p => {
            const com = temSenha(senhasEquipe, p);
            const resta = diasParaSair(usoEquipe, p);
            const perto = resta !== null && resta <= AVISAR_FALTANDO;
            const uso = com ? textoDoUltimoUso(ultimoUso(usoEquipe, p)) : '';
            return (
              <li key={p} className="rounded-2xl border-2 border-polo-linha p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="w-11 h-11 rounded-full bg-polo-navy text-polo-gold font-titulo font-extrabold text-lg flex items-center justify-center flex-shrink-0">
                    {(p.trim()[0] || '?').toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-polo-navy break-words">{p}</p>
                    {uso && <p className="text-xs text-polo-tinta">{uso}</p>}
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 flex-shrink-0
                    ${com ? 'bg-ok-suave text-ok-tinta' : 'bg-amber-100 text-amber-900'}`}>
                    {com && <Icon name="cadeado" size={12} />}{com ? 'Com senha' : '1º acesso'}
                  </span>
                </div>
                {perto && (
                  <p className="text-xs font-bold text-amber-900">
                    {resta === 0 ? 'Sai da lista hoje' : `Sai da lista em ${resta} ${resta === 1 ? 'dia' : 'dias'} de uso sem entrar`}
                  </p>
                )}
                <div className="flex gap-2">
                  {ehDono && com && (
                    <button type="button" onClick={() => zerar(p)} disabled={zerando === p}
                      aria-label={`Zerar senha de ${p}`}
                      className="flex-1 min-h-11 px-3 rounded-xl border-2 border-polo-linha bg-white text-polo-navy text-sm font-bold
                                 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                      <Icon name="cadeado" size={14} />{zerando === p ? 'Zerando…' : 'Zerar senha'}
                    </button>
                  )}
                  <button type="button" onClick={() => remover(p)} aria-label={`Remover ${p}`}
                    className="flex-1 min-h-11 px-3 rounded-xl border-2 border-perigo/40 bg-white text-perigo text-sm font-bold">
                    Remover
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* flex-wrap: no celular o botão desce para a linha de baixo — lado a
          lado, ele espremia o campo até cortar o nome ("Nome da pe") */}
      <div className="flex flex-wrap items-center gap-2 border-t border-polo-linha pt-3">
        <div className="relative flex-1 min-w-[12rem]">
          <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-polo-tinta">
            <Icon name="pessoa" size={20} />
          </span>
          <input aria-label="Nome da pessoa" type="text" value={novaPessoa} onChange={e => setNovaPessoa(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
            placeholder="Nome da pessoa" className="campo pl-11" />
        </div>
        <Botao onClick={adicionar} largura="auto" className="px-4 flex-1 sm:flex-none"><Icon name="mais" size={18} />Adicionar</Botao>
      </div>
      {!ehDono && pessoas.some(p => temSenha(senhasEquipe, p)) && (
        <p className="text-sm text-polo-tinta">Só a conta dona zera senhas.</p>
      )}
    </div>
  );
}
