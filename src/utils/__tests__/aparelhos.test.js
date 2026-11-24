// =====================================================================
//  APARELHOS CONECTADOS (M64, 24/11/2026 — pedido do dono)
//  O Aurum Etiquetas passa a R$ 99,90 com até 3 aparelhos na mesma conta; o
//  4º mostra o Pix de R$ 20 e só entra quando a Aurum confirma; daí em
//  diante, R$ 20 por aparelho a mais em toda cobrança. "Outro CNPJ" saiu.
//  (o banco — a mesma regra — confere em scripts/pentest-aparelhos.mjs)
// =====================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APARELHOS_INCLUSOS, ADICIONAL_APARELHO, aparelhosInclusos, mensalComAparelhos, precoPlano, planoPorId,
  mensalCombinado, PRODUTOS,
} from '../assinatura';
import { nomeDoAparelho, decidirAparelho, lerAparelhoGuardado, guardarAparelho, quandoFoiVisto } from '../../lib/aparelhos';
import { filaDoPainel, numerosDoPainel } from '../painel';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('o preço', () => {
  it('Etiquetas R$ 99,90 com 3 aparelhos; aparelho a mais R$ 20; o Pro sem limite', () => {
    expect(PRODUTOS.etiquetas.precoMes).toBe(99.9);
    expect(APARELHOS_INCLUSOS).toEqual({ etiquetas: 3, completo: null });
    expect(ADICIONAL_APARELHO).toBe(20);
    expect(aparelhosInclusos('etiquetas')).toBe(3);
    expect(aparelhosInclusos({ produto: 'etiquetas' })).toBe(3);
    expect(aparelhosInclusos('completo')).toBe(null);
  });

  it('o aparelho a mais entra no mês e nos planos (com o desconto do período sobre o total)', () => {
    expect(mensalComAparelhos('etiquetas', 0)).toBe(99.9);
    expect(mensalComAparelhos('etiquetas', 1)).toBe(119.9);
    expect(mensalComAparelhos('etiquetas', 2)).toBe(139.9);
    expect(mensalComAparelhos('etiquetas', -3)).toBe(99.9);   // nunca desconta
    expect(precoPlano(planoPorId('anual'), 'etiquetas', 1)).toBe(1294.92); // 119,90 × 12 × 0,9
    expect(precoPlano(planoPorId('semestral'), 'etiquetas', 1)).toBe(683.43); // 119,90 × 6 × 0,95
    expect(mensalCombinado('etiquetas', 1, { tipo: 'valor', valor: 10 })).toBe(109.9);
  });
});

describe('o aparelho no app (lib/aparelhos.js)', () => {
  beforeEach(() => {
    const mapa = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
      setItem: (k, v) => mapa.set(k, String(v)),
      removeItem: (k) => mapa.delete(k),
    };
  });

  it('o nome que o dono reconhece na lista', () => {
    expect(nomeDoAparelho('Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(nomeDoAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(nomeDoAparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('Windows · Edge');
    expect(nomeDoAparelho('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36')).toBe('Android · Samsung Internet');
    expect(nomeDoAparelho('')).toBe('Aparelho');
  });

  it('a decisão: espera, sai, ou entra — e sem resposta entra (falha de rede não tira acesso)', () => {
    expect(decidirAparelho({ situacao: 'aguardando' })).toBe('esperar');
    expect(decidirAparelho({ situacao: 'removido' })).toBe('sair');
    expect(decidirAparelho({ situacao: 'ativo' })).toBe('entrar');
    expect(decidirAparelho({ situacao: 'isento' })).toBe('entrar');
    expect(decidirAparelho(null)).toBe('entrar');
  });

  it('a resposta guardada é do usuário certo, e sair apaga', () => {
    guardarAparelho('u1', { situacao: 'aguardando', limite: 3 });
    expect(lerAparelhoGuardado('u1')).toEqual({ situacao: 'aguardando', limite: 3 });
    expect(lerAparelhoGuardado('u2')).toBe(null);
    guardarAparelho(null);
    expect(lerAparelhoGuardado('u1')).toBe(null);
  });

  it('"visto hoje 14:32", "ontem", ou a data', () => {
    const agora = new Date(2026, 10, 24, 18, 0);
    expect(quandoFoiVisto(new Date(2026, 10, 24, 14, 32).toISOString(), agora)).toBe('hoje 14:32');
    expect(quandoFoiVisto(new Date(2026, 10, 23, 9, 5).toISOString(), agora)).toBe('ontem 09:05');
    expect(quandoFoiVisto(new Date(2026, 10, 20, 9, 5).toISOString(), agora)).toBe('20/11');
    expect(quandoFoiVisto(null, agora)).toBe('');
  });
});

describe('a migração 64 (o banco decide, não a tela)', () => {
  const sql = ler('../../lib/migration64_aparelhos.sql');

  it('o limite é 3 + os pagos, só no Etiquetas — o mesmo número do app', () => {
    expect(sql).toMatch(/when coalesce\(r\.produto, 'completo'\) = 'etiquetas'\s+then 3 \+ coalesce\(r\.aparelhos_extras, 0\) end/);
    expect(sql).toMatch(/check \(aparelhos_extras between 0 and 50\)/);
  });

  it('aparelho = a sessão do login, e quem entra é decidido com a linha da conta travada', () => {
    expect(sql).toMatch(/v_sessao uuid := sessao_atual\(\);/);
    expect(sql).toMatch(/sessao\s+uuid not null unique/);
    expect(sql).toMatch(/perform 1 from restaurantes where id = v_rid for update;/);
    expect(sql).toMatch(/if v_limite is null or v_usados < v_limite then/);
    // parado há 30 dias libera a vaga sozinho
    expect(sql).toMatch(/visto_em < now\(\) - interval '30 days'/);
  });

  it('ninguém lê nem grava a tabela direto; o super-admin e o modo suporte não ocupam vaga', () => {
    expect(sql).toMatch(/revoke all on aparelhos from public, anon, authenticated;/);
    expect(sql).toMatch(/if coalesce\(sou_super_admin\(\), false\) or v_rid is null or v_sessao is null then\s+return jsonb_build_object\('situacao', 'isento'\);/);
  });

  it('tirar um aparelho só com a Administração aberta, e só da própria conta', () => {
    expect(sql).toMatch(/v_rid is distinct from meu_restaurante_id\(\) or coalesce\(meu_cargo\(\), ''\) <> 'diretoria'/);
  });

  it('só a Aurum dá a vaga paga; o Pix vai para o histórico como aparelho a mais', () => {
    for (const f of ['aparelhos_admin', 'confirmar_aparelho_extra', 'dispensar_pedido_de_aparelho', 'definir_aparelhos_extras']) {
      expect(sql).toMatch(new RegExp(`function ${f}\\([\\s\\S]*?if not sou_super_admin\\(\\) then raise exception`));
    }
    expect(sql).toMatch(/values \(p_restaurante, current_date, 0, 'aparelho', v_produto, 0, 'pix',\s+1, p_valor, 'Aparelho a mais \(1º mês\)'/);
  });

  it('nada para anon', () => {
    for (const f of ['registrar_aparelho(text)', 'sair_do_aparelho()', 'meus_aparelhos()', 'remover_aparelho(uuid)', 'pedir_aparelho_extra(text)']) {
      expect(sql).toContain(`revoke all on function ${f} from public, anon;`);
      expect(sql).toContain(`grant execute on function ${f} to authenticated;`);
    }
  });
});

describe('o app usa os aparelhos', () => {
  const auth = ler('../../store/AuthContext.jsx');
  const app = ler('../../App.jsx');

  it('"Sair" sai SÓ deste aparelho e devolve a vaga (o login da casa fica nos outros)', () => {
    expect(auth).toMatch(/supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
    expect(auth).not.toMatch(/supabase\.auth\.signOut\(\)\.catch/);
    expect(auth).toMatch(/supabase\.rpc\('sair_do_aparelho'\)/);
  });

  it('o aparelho se apresenta ao abrir, a cada 5 min, e a cada 30 s enquanto espera', () => {
    expect(auth).toMatch(/supabase\.rpc\('registrar_aparelho', \{ p_nome: nomeDoAparelho\(\) \}\)/);
    expect(auth).toMatch(/if \(esperando \|\| Date\.now\(\) - ultimo >= INTERVALO_APARELHO_MS\) conferir\(\);/);
    expect(auth).toMatch(/\}, INTERVALO_ESPERANDO_MS\);/);
    // tirado pela Administração: sai, e a entrada explica
    expect(auth).toMatch(/if \(decidirAparelho\(r\) === 'sair'\) \{\s*await logoutRef\.current\?\.\(\);\s*setDerrubado\('removido'\);/);
    expect(app).toMatch(/Este aparelho saiu da conta/);
  });

  it('o 4º aparelho para na tela do aparelho a mais (nem o suporte nem a demo)', () => {
    expect(app).toMatch(/if \(aparelho\?\.situacao === 'aguardando' && !impersonando && !sessao\?\.demo\) \{\s*return <Suspense fallback=\{<Splash \/>\}><AparelhoAMais aoSair=\{logout\} \/><\/Suspense>;/);
  });

  it('a Administração lista os aparelhos (Equipe), e o Pagamento mostra o que inclui', () => {
    expect(ler('../../pages/AdministracaoGrupo.jsx')).toMatch(/\{a\.aparelhos && <CartaoAparelhos \/>\}/);
    expect(ler('../../store/acessosAdmin.js')).toMatch(/aparelhos: dono && !sessao\?\.eSuperAdmin,/);
    expect(ler('../../pages/Pagamento.jsx')).toMatch(/const inclusos = aparelhosInclusos\(prod\.id\);/);
  });

  it('Termos 1.4: aparelhos conectados no lugar das unidades adicionais', () => {
    const t = ler('../../pages/Termos.jsx');
    expect(t).toMatch(/export const TERMOS_VERSAO = '1\.4';/);
    expect(t).toMatch(/<strong>Aparelhos conectados\.<\/strong>/);
    expect(t).toMatch(/até 3 \(três\) aparelhos/);
    expect(t).toMatch(/R\$ 20,00 \(vinte reais\) por\s+mês/);
    expect(t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')).not.toMatch(/Unidades adicionais/);
  });
});

describe('o painel da Aurum', () => {
  const adm = ler('../../pages/Admin.jsx');

  it('lê os aparelhos de todas as contas e confirma o Pix pelo banco', () => {
    expect(adm).toMatch(/supabase\.rpc\('aparelhos_admin'\)/);
    expect(adm).toMatch(/supabase\.rpc\('confirmar_aparelho_extra', \{ p_restaurante: r\.id, p_aparelho: a\.id, p_valor: ADICIONAL_APARELHO \}\)/);
    expect(adm).toMatch(/supabase\.rpc\('dispensar_pedido_de_aparelho'/);
    expect(adm).toMatch(/supabase\.rpc\('definir_aparelhos_extras'/);
    expect(adm).toMatch(/supabase\.rpc\('remover_aparelho'/);
    // o limite de usuários (vagas) saiu
    expect(adm).not.toMatch(/definir_max_usuarios|Limite de usuários/);
  });

  it('o Pix do aparelho entra na fila do dia, logo depois dos avisos de pagamento', () => {
    const agora = Date.now();
    const r = {
      id: 'r1', nome: 'Casa', produto: 'etiquetas', assinatura_ate: new Date(agora + 86400000 * 20).toISOString(),
      aparelhos: [{ id: 'a1', pedido_em: new Date(agora - 60000).toISOString(), pagador: 'Ana' }, { id: 'a2', pedido_em: null }],
      aviso_pagamento_em: new Date(agora - 120000).toISOString(),
    };
    const fila = filaDoPainel([r], agora, [{ id: 'f1', status: 'aberto', created_at: new Date(agora - 999999).toISOString() }]);
    expect(fila.map(i => i.tipo)).toEqual(['aviso', 'aparelho', 'feedback']);
    expect(fila[1].aparelho.pagador).toBe('Ana');
  });

  it('revisão do painel (24/11/2026): login da casa, sem contas da equipe, caminhos de hoje', () => {
    expect(adm).toMatch(/\{u\.cargo === 'diretoria' \? 'login da casa' : 'conta antiga'\}/);
    expect(adm).toMatch(/Logins ativos:/);
    expect(adm).not.toMatch(/limite de contas|Contas extras|Configurações → Sistema → Suporte remoto/);
    expect(adm).toMatch(/Administração → Conta → Suporte remoto/);
  });

  it('a receita estimada soma os aparelhos a mais', () => {
    const agora = Date.now();
    const r = { id: 'r1', produto: 'etiquetas', assinatura_ate: new Date(agora + 86400000 * 20).toISOString(), aparelhos_extras: 1 };
    expect(numerosDoPainel([r], agora).mrr).toBe(119.9);
  });
});
