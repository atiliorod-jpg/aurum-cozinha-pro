// =====================================================================
//  REVISÃO DE 24/09/2026 — os defeitos que a verificação adversarial
//  confirmou nas mudanças do dia (etiquetas em linhas, sem internet,
//  unidades fase 2, duas etapas) e a M52.
// =====================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { listarEstoques } from '../instancias';
import { unidadeFixaDe, cozinhaDaFixa, bloqueioDaFixa } from '../unidades';
import { traduzErroAuth } from '../erros';
import { textoDoBloqueio } from '../semInternet';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const auth = ler('../../store/AuthContext.jsx');
const app = ler('../../store/AppContext.jsx');
const sql = ler('../../lib/migration52_correcoes_da_revisao.sql');

describe('"Sair" sem internet sai de verdade', () => {
  it('a sessão deste aparelho é apagada mesmo quando o servidor não responde', () => {
    expect(auth).toMatch(/async function sairDoSupabase\(\) \{/);
    // no máximo 3 s esperando o servidor
    expect(auth).toMatch(/new Promise\(r => setTimeout\(\(\) => r\(\{ error: 'sem resposta' \}\), 3000\)\)/);
    // falhou → apaga a sessão guardada (e descarta um token renovando agora)
    expect(auth).toMatch(/await supabase\.auth\._removeSession\?\.\(\);/);
    expect(auth).toMatch(/\['', '-user', '-code-verifier'\]\.forEach\(s => \{\s*try \{ localStorage\.removeItem\(supabase\.auth\.storageKey \+ s\);/);
    expect(auth).toMatch(/\} else \{\s*await sairDoSupabase\(\);\s*\}/);
    expect(auth).not.toMatch(/\} else \{\s*await supabase\.auth\.signOut\(\);\s*\}/);
  });

  it('o "Sair" zera tudo que a entrada tinha deixado', () => {
    const logout = auth.slice(auth.indexOf('const logout = useCallback'), auth.indexOf('}, [sessao]);', auth.indexOf('const logout = useCallback')));
    expect(logout).toMatch(/geracaoRef\.current \+= 1;/);
    expect(logout).toMatch(/carregadoRef\.current = null;/);
    expect(logout).toMatch(/setConfirmacao\(\{ confirmadoEm: null, desvioMs: 0, semInternet: false \}\);/);
    expect(logout).toMatch(/setNivelLogin\(null\);/);
  });

  it('uma entrada que termina DEPOIS do "Sair" não põe a conta de volta', () => {
    const perfil = auth.slice(auth.indexOf('const carregarPerfil = useCallback'), auth.indexOf('// A conta dona prende'));
    expect(perfil).toMatch(/const geracao = geracaoRef\.current;/);
    // antes de gravar a sessão e antes de gravar a equipe
    expect(perfil).toMatch(/if \(saiu\(\)\) return false;\s*setSessao\(sessaoNova\);/);
    expect(perfil).toMatch(/if \(saiu\(\)\) return false;\s*setUsuarios\(todos \|\| \[\]\);/);
    // e a cópia da sessão não é regravada
    const confirmar = auth.slice(auth.indexOf('const confirmarAgora = useCallback'), auth.indexOf('const entrarSemInternet'));
    expect(confirmar).toMatch(/if \(geracaoRef\.current !== geracao\) return;[^\n]*\n\s*const agora = Date\.now\(\);/);
    const reconf = auth.slice(auth.indexOf('const reconfirmarSemLimite'), auth.indexOf('const reconfirmar = useCallback'));
    expect((reconf.match(/if \(geracaoRef\.current !== geracao\) return false;/g) || []).length).toBe(2);
  });

  it('token ainda válido e sem internet: a cópia abre em 4 s, sem esperar a busca do perfil insistir', () => {
    expect(auth).toMatch(/const atalhoPerfil = lerInstantaneo\(\)\?\.usuarioId === uid\s*\? setTimeout\(\(\) => \{ if \(!pronto\) entrarSemInternet\(uid, session\.user\.email \|\| ''\); \}, 4000\)/);
    expect(auth).toMatch(/carregarPerfil\(uid\)\.finally\(\(\) => \{ pronto = true; if \(atalhoPerfil\) clearTimeout\(atalhoPerfil\); \}\);/);
  });
});

describe('duas etapas: "não deu para ler" não é "falta o código"', () => {
  it('erro na leitura vira sem-rede, com a tela de internet e "Tentar de novo"', () => {
    expect(auth).toMatch(/if \(error \|\| !data\) return 'sem-rede';/);
    const tela = ler('../../App.jsx');
    expect(tela).toMatch(/if \(nivelLogin === 'sem-rede'\) return <ConecteInternet motivo="painel" aoTentar=\{verificarNivel\} aoSair=\{logout\} \/>;/);
    expect(textoDoBloqueio('painel')).toMatch(/verificação em duas etapas/);
  });

  it('o nível é relido quando o token renova, e zerado ao sair', () => {
    expect(auth).toMatch(/\['TOKEN_REFRESHED', 'SIGNED_IN', 'MFA_CHALLENGE_VERIFIED'\]\.includes\(event\)\) \{\s*verificarNivel\(\);/);
    expect(auth).toMatch(/setSessao\(null\); setUsuarios\(\[\]\); setCarregando\(false\); setNivelLogin\(null\);/);
  });

  it('a tela do código tem "Tentar de novo" e não mostra "Failed to fetch"', () => {
    const tela = ler('../../components/DuasEtapas.jsx');
    expect(tela).toMatch(/setTentativa\(n => n \+ 1\)/);
    expect(tela).toMatch(/\}, \[tentativa\]\);/);
    expect(tela).toMatch(/Sem conexão com o servidor/);
  });

  it('trocar a senha sem o código diz o motivo certo (não "mínimo 8 caracteres")', () => {
    const msg = traduzErroAuth('AAL2 session is required to update email or password when MFA is enabled.');
    expect(msg).toMatch(/verificação em duas etapas/);
    expect(msg).not.toMatch(/mínimo 8/);
    // a genérica de senha continua valendo
    expect(traduzErroAuth('Password should be at least 8 characters')).toMatch(/8/);
  });
});

describe('etiquetas em linhas: as correções', () => {
  it('a etiqueta apagada não volta pelo documento antigo', () => {
    // só é nova a que o banco não tem de jeito nenhum (apagadas incluídas)
    expect(app).toMatch(/let antigas = etiquetasDoDocumentoAntigo\(/);
    expect(app).toMatch(/await supabase\.from\('etiquetas'\)\.select\('id'\)\s*\.eq\('restaurante_id', rid\)\.in\('id', antigas\.slice\(i, i \+ 100\)\.map\(e => e\.id\)\);/);
    expect(app).toMatch(/antigas = falhou \? \[\] : antigas\.filter\(e => !jaNoBanco\.has\(e\.id\)\);/);
  });

  it('mudar a situação de uma etiqueta que ainda está na fila vai junto com ela', () => {
    const mudar = app.slice(app.indexOf('const mudarStatusEtiqueta'), app.indexOf('const etiquetaAindaSubindo'));
    expect(mudar).toMatch(/if \(fila\.some\(temNaFila\)\) \{/);
    expect(mudar).toMatch(/itens: i\.payload\.itens\.map\(e => \(e\.id === id \? \{ \.\.\.e, status \} : e\)\)/);
    // o banco não achou a linha: tenta de novo na próxima subida
    expect(mudar).toMatch(/if \(error \|\| data === false\) naFila\(\);/);
  });

  it('apagar espera a etiqueta subir', () => {
    expect(app).toMatch(/\(i\.kind === 'etiquetas' \|\| i\.kind === 'impressao'\)/);
    const tela = ler('../../pages/etiquetas/Impressas.jsx');
    expect(tela).toMatch(/if \(etiquetaAindaSubindo\?\.\(e\)\) \{\s*try \{ window\.dispatchEvent\(new Event\('forcar-sync'\)\); \}/);
    expect(tela.indexOf('etiquetaAindaSubindo?.(e)')).toBeLessThan(tela.indexOf("supabase.rpc('apagar_impressao'"));
  });

  describe('o id da etiqueta continua de onde parou', () => {
    afterEach(() => { delete globalThis.localStorage; vi.resetModules(); });

    it('lê o contador guardado e grava o novo', async () => {
      const store = { 'pe::_seqLote': '41' };
      globalThis.localStorage = {
        getItem: (c) => (c in store ? store[c] : null),
        setItem: (c, v) => { store[c] = String(v); },
        removeItem: (c) => { delete store[c]; },
      };
      vi.resetModules();
      const { gerarLoteId } = await import('../etiquetas');
      const a = gerarLoteId();
      const b = gerarLoteId();
      expect(a.slice(3, 6)).toBe((42).toString(36).padStart(3, '0'));
      expect(b.slice(3, 6)).toBe((43).toString(36).padStart(3, '0'));
      expect(store['pe::_seqLote']).toBe('43');
      expect(a).toMatch(/^[0-9a-z]{8}$/);
    });

    it('sem nada guardado começa num ponto sorteado (dois aparelhos não andam juntos)', async () => {
      vi.resetModules();
      const { gerarLoteId } = await import('../etiquetas');
      const ids = Array.from({ length: 50 }, () => gerarLoteId());
      expect(new Set(ids).size).toBe(50);
    });
  });

  it('M52: apagar de novo não desconta de novo; id repetido com linha antiga ocupa o lugar', () => {
    expect(sql).toMatch(/where restaurante_id = rid and id = p_lote and apagada_em is null;\s*--[^\n]*\n\s*--[^\n]*\n\s*--[^\n]*\n\s*if not found and exists \(select 1 from etiquetas where restaurante_id = rid and id = p_lote\) then\s*return 0;/);
    expect(sql).toMatch(/on conflict \(restaurante_id, id\) do update/);
    expect(sql).toMatch(/where etiquetas\.impresso_em < excluded\.impresso_em - 180\s*and coalesce\(etiquetas\.validade, etiquetas\.impresso_em\) < excluded\.impresso_em - 30;/);
    // o resto do apagar continua igual: só a conta dona
    expect(sql).toMatch(/if coalesce\(meu_cargo\(\), ''\) <> 'diretoria' then\s*raise exception 'Só a conta dona do restaurante apaga uma etiqueta impressa\.'/);
  });
});

describe('unidades: as correções', () => {
  const unidades = [{ id: 'u1', nome: 'Boa Viagem', cozinha: 'producao#bv01', criada_em: '2026-09-01', arquivada_em: '2026-09-20T10:00:00Z' }];
  const estoques = listarEstoques({ itens: [] }, unidades);

  it('conta presa a uma unidade ARQUIVADA fica na cozinha dela — nunca na principal', () => {
    const fixa = { id: 'u1' };
    expect(cozinhaDaFixa(estoques, fixa, 'producao')).toBe('producao#bv01');
    expect(cozinhaDaFixa(estoques, fixa, undefined)).toBe('producao#bv01');
    // e a etiqueta continua travada, com o aviso
    expect(bloqueioDaFixa(fixa, unidades, 'u1')).toMatch(/arquivada/);
    // presa à principal continua na principal
    expect(cozinhaDaFixa(estoques, { id: null }, 'producao')).toBe('producao');
  });

  it('a diretoria nunca fica presa', () => {
    expect(unidadeFixaDe({ cargo: 'diretoria', unidade_fixa: true, unidade_id: 'u1' })).toBeNull();
    expect(unidadeFixaDe({ cargo: 'cozinha', unidade_fixa: true, unidade_id: 'u1' })).toEqual({ id: 'u1' });
    // a reconferência lê o cargo junto
    expect(auth).toMatch(/from\('perfis'\)\.select\('cargo, unidade_fixa, unidade_id'\)\.eq\('id', s\.usuarioId\)/);
  });

  it('o cartão aparece enquanto houver alguém preso numa unidade arquivada', () => {
    const cartao = ler('../../components/config/CartoesConfig.jsx');
    expect(cartao).toMatch(/if \(!temUnidadesExtras\(unidades\) && !\(usuarios \|\| \[\]\)\.some\(arquivadaDe\)\) return null;/);
  });

  it('M52: promover a Diretoria solta; soltar a diretoria é aceito; relatório e impressão ignoram a trava dela', () => {
    expect(sql).toMatch(/if p_cargo = 'diretoria' then\s*perform set_config\('aurum\.muda_unidade', '1', true\);\s*update perfis set unidade_fixa = false, unidade_id = null/);
    expect(sql).toMatch(/if v_alvo\.cargo = 'diretoria' and coalesce\(p_fixa, false\) then/);
    expect(sql).toMatch(/select unidade_fixa and cargo <> 'diretoria', unidade_id into v_fixa, v_uni from perfis where id = auth\.uid\(\);/);
    expect(sql).toMatch(/select coalesce\(p\.unidade_fixa, false\) and p\.cargo <> 'diretoria', p\.unidade_id/);
    // alterar_cargo mantém as travas antigas
    expect(sql).toMatch(/Você não pode alterar o seu próprio cargo\./);
    expect(sql).toMatch(/Gerência não pode promover ninguém a Diretoria\./);
  });

  it('M52: grants conferidos pela sonda', () => {
    for (const f of ['apagar_impressao(uuid, text, date, text, text, integer)', 'registrar_etiquetas(jsonb)',
      'alterar_cargo(uuid, text)', 'definir_unidade_da_conta(uuid, boolean, uuid)',
      'registrar_impressoes(jsonb)', 'relatorio_etiquetas(date, date, uuid)']) {
      expect(sql).toContain(`grant execute on function ${f}`);
      expect(sql).toContain(`'${f}'`);
    }
  });
});
