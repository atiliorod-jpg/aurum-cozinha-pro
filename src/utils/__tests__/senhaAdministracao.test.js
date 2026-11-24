// =====================================================================
//  A SENHA DA ADMINISTRAÇÃO (23/11/2026, jeito do Magurō — pedido do dono)
//  Sem cargos, matriz nem contas da equipe: um login da casa, os nomes com
//  senha de 2 números, e UMA senha (4 a 8 números) que abre a Administração.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  senhaAdmValida, cargoEfetivo, textoDaRecusa, ehFuncaoAusente, MIN_DIGITOS_ADM, MAX_DIGITOS_ADM,
  MINUTOS_PARADA_ADM, SENHA_DA_DEMO,
} from '../senhaAdministracao';
import { pode, podeAbrirAdministracao } from '../permissoes';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('a senha', () => {
  it('de 4 a 8 números — "maior que só 4 teclas", e nada além de número', () => {
    expect([MIN_DIGITOS_ADM, MAX_DIGITOS_ADM, MINUTOS_PARADA_ADM, SENHA_DA_DEMO]).toEqual([4, 8, 3, '1234']);
    for (const ok of ['1234', '123456', '12345678']) expect(senhaAdmValida(ok)).toBe(true);
    for (const nao of ['', '123', '123456789', '12a4', ' 1234', null, undefined]) expect(senhaAdmValida(nao)).toBe(false);
  });

  it('o que a tela diz para cada recusa', () => {
    expect(textoDaRecusa({ ok: false, motivo: 'senha', restantes: 4 })).toBe('Senha errada. Restam 4 tentativas antes de esperar.');
    expect(textoDaRecusa({ ok: false, motivo: 'senha', restantes: 1 })).toBe('Senha errada. Resta 1 tentativa antes de esperar.');
    expect(textoDaRecusa({ ok: false, motivo: 'espera', segundos: 30 })).toBe('Muitas tentativas erradas. Espere 30 segundos e tente de novo.');
    expect(textoDaRecusa({ ok: false, motivo: 'sem_senha' })).toMatch(/ainda não tem senha da Administração/);
    expect(textoDaRecusa({ ok: false, motivo: 'rede' })).toMatch(/Sem internet/);
    expect(textoDaRecusa({ ok: false, motivo: 'sem_servidor' })).toMatch(/ainda não foi ligada no servidor/);
    expect(textoDaRecusa({ ok: true })).toBe('');
  });

  it('reconhece o banco sem a M62 (a função não existe)', () => {
    expect(ehFuncaoAusente({ message: 'Could not find the function public.abrir_administracao(p_senha) in the schema cache' })).toBe(true);
    expect(ehFuncaoAusente({ code: 'PGRST202' })).toBe(true);
    expect(ehFuncaoAusente({ message: 'Failed to fetch' })).toBe(false);
  });
});

describe('o cargo que vale agora', () => {
  const dono = { cargo: 'diretoria', usuarioId: 'u1' };
  it('com a senha ligada: aberta = diretoria, fechada = cozinha — até para a conta dona', () => {
    expect(cargoEfetivo({ sessao: dono, aberta: true, noServidor: true })).toBe('diretoria');
    expect(cargoEfetivo({ sessao: dono, aberta: false, noServidor: true })).toBe('cozinha');
    expect(cargoEfetivo({ sessao: { cargo: 'cozinha' }, aberta: true, noServidor: true })).toBe('diretoria');
    // ainda conferindo o servidor: o lado seguro
    expect(cargoEfetivo({ sessao: dono, aberta: false, noServidor: null })).toBe('cozinha');
    // a demonstração não tem servidor: a senha vale no aparelho
    expect(cargoEfetivo({ sessao: { ...dono, demo: true }, aberta: false, noServidor: null })).toBe('cozinha');
  });

  it('banco sem a M62: o cargo gravado, como antes; super-admin e perfil incompleto, como sempre', () => {
    expect(cargoEfetivo({ sessao: dono, aberta: false, noServidor: false })).toBe('diretoria');
    expect(cargoEfetivo({ sessao: { cargo: null, eSuperAdmin: true }, aberta: false, noServidor: true })).toBe(null);
    expect(cargoEfetivo({ sessao: { cargo: null }, aberta: false, noServidor: true })).toBe(null);
  });
});

describe('o que a cozinha pode sem a senha', () => {
  // a matriz antiga dava tudo à cozinha — com a senha ligada, ela não vale mais
  const matrizGenerosa = { cozinha: { gerenciarProdutos: true, configurarSistema: true, verFinanceiro: true } };
  const fechada = { cargo: 'cozinha', cargoDaConta: 'diretoria', usuarioId: 'u1' };
  const aberta = { cargo: 'diretoria', cargoDaConta: 'diretoria', usuarioId: 'u1' };

  it('fechada: imprimir, lançar e REIMPRIMIR; o resto pede a senha (a matriz não vale)', () => {
    expect(pode(fechada, matrizGenerosa, 'verImpressas')).toBe(true);
    for (const cap of ['gerenciarProdutos', 'configurarSistema', 'verFinanceiro', 'verRelatorio', 'verRelatorioEtiquetas', 'inventario', 'removerRegistros']) {
      expect(pode(fechada, matrizGenerosa, cap), cap).toBe(false);
    }
  });

  it('aberta: tudo; e a porta da Administração aparece para todos (a tela pede a senha)', () => {
    expect(pode(aberta, {}, 'verFinanceiro')).toBe(true);
    expect(podeAbrirAdministracao(fechada, {})).toBe(true);
    expect(podeAbrirAdministracao({ cargo: 'cozinha', demo: true }, {})).toBe(true);
  });

  it('banco sem a M62 (sessão sem cargoDaConta): a matriz de antes continua valendo', () => {
    expect(pode({ cargo: 'cozinha', usuarioId: 'u2' }, matrizGenerosa, 'gerenciarProdutos')).toBe(true);
    expect(pode({ cargo: 'cozinha', usuarioId: 'u2' }, {}, 'gerenciarProdutos')).toBe(false);
  });
});

describe('a migração 62 (o banco decide, não a tela)', () => {
  const sql = ler('../../lib/migration62_administracao_com_senha.sql');

  it('meu_cargo() segue a Administração aberta NESTA sessão de login', () => {
    expect(sql).toMatch(/create or replace function meu_cargo\(\)[\s\S]*?case when administracao_liberada\(\) then 'diretoria' else 'cozinha' end/);
    expect(sql).toMatch(/a\.usuario = auth\.uid\(\) and a\.sessao = sessao_atual\(\) and a\.ate > now\(\)/);
    expect(sql).toMatch(/auth\.jwt\(\) ->> 'session_id'/);
  });

  it('a senha guardada embaralhada, de 4 a 8 números, com espera depois de 5 erros', () => {
    expect(sql).toMatch(/crypt\(p_nova, gen_salt\('bf', 8\)\)/);
    expect(sql).toMatch(/v_s\.hash <> crypt\(p_senha, v_s\.hash\)/);
    expect(sql).toMatch(/p_nova !~ '\^\[0-9\]\{4,8\}\$'/);
    expect(sql).toMatch(/when \(erros \+ 1\) % 5 = 0/);
    expect(sql).toMatch(/least\(600, 30 \* power\(2, \(erros \+ 1\) \/ 5 - 1\)\)/);
  });

  it('a primeira senha e o "esqueci": só a conta dona, logo depois de digitar a senha do login', () => {
    expect(sql).toMatch(/select coalesce\(cargo = 'diretoria', false\) into v_dono from perfis where id = auth\.uid\(\);/);
    expect(sql).toMatch(/auth\.jwt\(\) -> 'amr'/);
    expect(sql).toMatch(/if not administracao_liberada\(\) and not \(coalesce\(v_dono, false\) and v_login\) then/);
  });

  it('a matriz e o financeiro: só com a Administração aberta; nada para anon', () => {
    expect(sql).toMatch(/function pode_na_conta\(p_cap text\)[\s\S]*?coalesce\(sou_super_admin\(\), false\) or coalesce\(meu_cargo\(\), ''\) = 'diretoria'/);
    expect(sql).toMatch(/function pode_ver_financeiro\(\)[\s\S]*?coalesce\(meu_cargo\(\), ''\) = 'diretoria'/);
    for (const f of ['abrir_administracao(text)', 'renovar_administracao()', 'fechar_administracao()', 'definir_senha_administracao(text)', 'tem_senha_administracao()']) {
      expect(sql).toContain(`revoke all on function ${f} from public, anon;`);
      expect(sql).toContain(`grant execute on function ${f} to authenticated;`);
    }
    expect(sql).toMatch(/revoke all on administracao_senha from anon, authenticated;/);
  });
});

describe('o app usa a senha', () => {
  const auth = ler('../../store/AuthContext.jsx');
  const app = ler('../../App.jsx');

  it('sem sessão única: o login da casa abre em vários aparelhos', () => {
    expect(auth).not.toMatch(/from\('sessoes'\)\.upsert/);
    expect(auth).not.toMatch(/table: 'sessoes'/);
  });

  it('abre, renova, fecha e cria a senha pelo banco; fecha sozinha com 3 minutos parada', () => {
    for (const rpc of ['abrir_administracao', 'renovar_administracao', 'fechar_administracao', 'definir_senha_administracao', 'tem_senha_administracao']) {
      expect(auth).toContain(`supabase.rpc('${rpc}'`);
    }
    expect(auth).toMatch(/if \(agora - ultimoToque >= MINUTOS_PARADA_ADM \* 60_000\) \{ fecharAdministracao\(\); return; \}/);
    expect(auth).toMatch(/sessao: sessaoEfetiva,/);
  });

  it('as telas da Administração travam com a senha; reimprimir é livre', () => {
    expect(app).toMatch(/<ComSenha liberado=\{can\('gerenciarProdutos'\)\} titulo="Meus itens"><Itens \/><\/ComSenha>/);
    expect(app).toMatch(/<ComSenha liberado=\{admLiberada\} titulo="Administração"><Administracao \/><\/ComSenha>/);
    expect(app).toMatch(/<ComSenha liberado=\{can\('verRelatorioEtiquetas'\)\} titulo="Relatório de etiquetas">/);
    expect(app).toMatch(/can\('verImpressas'\) \? <Reimprimir \/>/);
    expect(ler('../../pages/Etiquetas.jsx')).toMatch(/<FaixaOperador reimprimir=\{podeReimprimir \? '\/impressas' : null\} \/>/);
  });

  it('saíram as contas da equipe, os cargos e a matriz da Administração', () => {
    const grupo = ler('../../pages/AdministracaoGrupo.jsx');
    expect(grupo).not.toMatch(/<CartaoContas|<CartaoCargos|<CartaoEquipeDasUnidades/);
    expect(grupo).toMatch(/<CartaoSenhaDaAdministracao \/>/);
  });
});
