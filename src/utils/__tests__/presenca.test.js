// =====================================================================
//  PRESENÇA (M58, 30/09/2026) — o sinalzinho de "em uso agora" do painel
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { situacaoPresenca, contasEmUso } from '../painel';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const AGORA = new Date('2026-09-30T15:00:00Z').getTime();
const ha = (min) => new Date(AGORA - min * 60000).toISOString();

describe('situacaoPresenca', () => {
  it('conta que nunca deu sinal: apagada, sem inventar horário', () => {
    expect(situacaoPresenca(undefined, AGORA)).toEqual({ online: false, texto: 'ainda não abriu o app', quem: [] });
    expect(situacaoPresenca({ agora: 0, quem: [], ultimo: null }, AGORA).online).toBe(false);
  });

  it('uma pessoa agora: verde, com o nome', () => {
    const s = situacaoPresenca({ agora: 1, quem: ['Maria'], ultimo: ha(1) }, AGORA);
    expect(s).toEqual({ online: true, quem: ['Maria'], texto: 'em uso agora' });
  });

  it('várias pessoas: diz quantas', () => {
    const s = situacaoPresenca({ agora: 3, quem: ['Ana', 'João', 'Maria'], ultimo: ha(0) }, AGORA);
    expect(s.texto).toBe('em uso agora · 3 pessoas');
    expect(s.quem).toHaveLength(3);
  });

  it('quem decide o "agora" é o banco, não o relógio deste computador', () => {
    // relógio local 3 horas adiantado: o banco disse 1, continua verde
    expect(situacaoPresenca({ agora: 1, quem: ['Ana'], ultimo: ha(0) }, AGORA + 3 * 3600000).online).toBe(true);
    // e sinal "recente" pelo relógio local, mas o banco disse 0: apagado
    expect(situacaoPresenca({ agora: 0, quem: [], ultimo: ha(1) }, AGORA).online).toBe(false);
  });

  it('apagada: "visto há" em minutos, horas e dias', () => {
    const t = (min) => situacaoPresenca({ agora: 0, quem: [], ultimo: ha(min) }, AGORA).texto;
    expect(t(12)).toBe('visto há 12 min');
    expect(t(59)).toBe('visto há 59 min');
    expect(t(180)).toBe('visto há 3 h');
    expect(t(47 * 60)).toBe('visto há 47 h');
    expect(t(5 * 1440)).toBe('visto há 5 dias');
    // relógio local atrasado não vira "há -3 min"
    expect(t(-3)).toBe('visto há 1 min');
  });
});

describe('contasEmUso', () => {
  it('conta só as contas com alguém agora', () => {
    expect(contasEmUso({ a: { agora: 2 }, b: { agora: 0 }, c: { agora: 1 }, d: {} })).toBe(2);
    expect(contasEmUso({})).toBe(0);
    expect(contasEmUso(undefined)).toBe(0);
  });
});

describe('M58 no banco', () => {
  const sql = ler('../../lib/migration58_presenca.sql');

  it('uma linha por usuário: a tabela não cresce com o uso', () => {
    expect(sql).toMatch(/usuario_id\s+uuid primary key/);
    expect(sql).toMatch(/on conflict \(usuario_id\) do update/);
  });

  it('o cliente não lê a tabela, e só o super-admin lê o painel', () => {
    expect(sql).toMatch(/alter table presenca enable row level security;/);
    expect(sql).toMatch(/revoke all on presenca from anon, authenticated;/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/if not coalesce\(sou_super_admin\(\), false\) then\s+raise exception 'Apenas o administrador do sistema consulta a presença\.'/);
  });

  it('a Aurum não conta como presença, e há freio contra sinal repetido', () => {
    expect(sql).toMatch(/uid = '318071c2-49c0-41d0-89aa-235f0672e1ad'::uuid then return;/);
    expect(sql).toMatch(/where p\.visto_em < now\(\) - interval '45 seconds'/);
  });

  it('a migração se recusa a terminar se anon chama ou se a tabela ficou legível', () => {
    expect(sql).toMatch(/M58: anon consegue chamar/);
    expect(sql).toMatch(/M58: a tabela presenca está legível pelo cliente/);
  });
});

describe('o app dá o sinal', () => {
  const lib = ler('../../lib/presenca.js');
  const app = ler('../../store/AppContext.jsx');
  const painel = ler('../../pages/Admin.jsx');

  it('só com a tela visível e com internet; a falha é calada', () => {
    expect(lib).toMatch(/if \(document\.visibilityState !== 'visible' \|\| navigator\.onLine === false\) return;/);
    expect(lib).toMatch(/supabase\.rpc\('marcar_presenca', \{ p_aparelho: aparelho\(\) \}\)\)\.catch\(\(\) => \{\}\)/);
    expect(lib).toMatch(/INTERVALO_PRESENCA_MS = 2 \* 60 \* 1000/);
  });

  it('modo suporte, demonstração e super-admin não acendem a conta do cliente', () => {
    expect(app).toMatch(/const semPresenca = !rid \|\| rid === 'demo' \|\| !!impersonando \|\| !!sessao\?\.demo \|\| !!sessao\?\.eSuperAdmin;/);
    expect(app).toMatch(/useEffect\(\(\) => \(semPresenca \? undefined : iniciarPresenca\(\)\), \[semPresenca, rid\]\);/);
  });

  it('o painel relê sozinho a cada minuto e o sinal tem nome para leitor de tela', () => {
    expect(painel).toMatch(/supabase\.rpc\('presenca_dos_restaurantes'\)/);
    expect(painel).toMatch(/setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) carregarPresenca\(\); \}, 60 \* 1000\)/);
    expect(painel).toMatch(/aria-label=\{pres\.online \? 'Em uso agora' : 'Ninguém usando agora'\}/);
  });
});
