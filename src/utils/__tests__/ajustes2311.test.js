// =====================================================================
//  AJUSTES DE 23/11/2026 (pedido do dono)
//   • os dados do estabelecimento sumiam (sobretudo depois de ficar sem
//     internet): as preferências da conta agora sobem por chave;
//   • "Como vai sair" no topo da janela de imprimir;
//   • a impressora mora em Meus itens; a tela Imprimir é só etiquetar;
//   • Impressas sem "válida / vencida";
//   • o texto dos métodos do item, curto.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aplicarPatches, itensDePrefs, patchDoItem, ehMudancaDePrefs, subirPatches,
} from '../prefsDaConta';
import { faltasDoPrimeiroUso } from '../primeiroUso';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

const patch = (p, extra = {}) => ({ kind: 'prefs', op: 'mesclar', payload: { patch: p }, _uid: Math.random().toString(36), ...extra });
const docAntigo = (dados, extra = {}) => ({ kind: 'doc', op: 'upsert', payload: { restaurante_id: 'r1', chave: 'prefs', dados }, _uid: 'velho', ...extra });

// Um servidor de mentira, com o mesmo contrato do RPC salvar_documento:
// documento que não existe é criado; versão diferente devolve conflito.
function servidorFalso(inicial = null) {
  const srv = { dados: inicial, versao: inicial ? 1 : 0, gravacoes: 0, leituras: 0 };
  srv.salvar = async (dados, versao) => {
    if (srv.dados === null) { srv.dados = dados; srv.versao = 1; srv.gravacoes++; return { data: { ok: true, versao: 1 } }; }
    if (versao !== srv.versao) return { data: { ok: false, conflito: true, versao: srv.versao, dados: srv.dados } };
    srv.dados = dados; srv.versao += 1; srv.gravacoes++;
    return { data: { ok: true, versao: srv.versao } };
  };
  srv.ler = async () => { srv.leituras++; return { data: srv.dados === null ? null : { dados: srv.dados, versao: srv.versao } }; };
  // outro aparelho grava direto (com internet)
  srv.outroAparelho = (mudanca) => { srv.dados = { ...srv.dados, ...mudanca }; srv.versao += 1; };
  return srv;
}

describe('preferências da conta: sobem por chave, nunca o documento inteiro', () => {
  it('os patches entram na ordem — o mais novo ganha — e o resto do documento fica', () => {
    const doc = { estabelecimento: { endereco: 'Rua A' }, etiquetaConfig: { incluirQR: true } };
    const r = aplicarPatches(doc, [{ etiquetaConfig: { incluirQR: false } }, { guia: true }, { guia: false }]);
    expect(r).toEqual({ estabelecimento: { endereco: 'Rua A' }, etiquetaConfig: { incluirQR: false }, guia: false });
    expect(doc.etiquetaConfig.incluirQR).toBe(true); // não mexe no original
    expect(aplicarPatches(null, [null, { a: 1 }])).toEqual({ a: 1 });
  });

  it('a fila: o formato novo e o antigo (documento inteiro) são mudanças de prefs; morto não sobe', () => {
    const fila = [
      { kind: 'registro', op: 'insert', payload: {} },
      patch({ guia: true }),
      docAntigo({ guia: false }),
      { kind: 'doc', op: 'upsert', payload: { chave: 'produtos', dados: [] } },
      patch({ autoMinMax: true }, { _morto: true }),
    ];
    expect(itensDePrefs(fila).map(patchDoItem)).toEqual([{ guia: true }, { guia: false }]);
    expect(ehMudancaDePrefs(fila[3])).toBe(false);
    expect(ehMudancaDePrefs({ kind: 'prefs', op: 'mesclar', payload: { patch: [] } })).toBe(false);
  });

  it('O DEFEITO: aparelho sem internet muda o QR; outro salva o endereço; o primeiro volta — o endereço FICA', async () => {
    const srv = servidorFalso({ etiquetaConfig: { incluirQR: true } });
    // o aparelho A viu a versão 1 e ficou sem internet
    const visto = { dados: { ...srv.dados }, versao: srv.versao };
    // o aparelho B salva os dados do estabelecimento (com internet)
    srv.outroAparelho({ estabelecimento: { endereco: 'Rua das Flores, 10', cidade: 'Recife - PE' } });
    // A volta e sobe o que mudou lá: só o QR
    const res = await subirPatches({
      servidor: visto, patches: [{ etiquetaConfig: { incluirQR: false } }], salvar: srv.salvar, ler: srv.ler,
    });
    expect(res.ok).toBe(true);
    expect(srv.dados.estabelecimento).toEqual({ endereco: 'Rua das Flores, 10', cidade: 'Recife - PE' });
    expect(srv.dados.etiquetaConfig).toEqual({ incluirQR: false });
    expect(res.dados).toEqual(srv.dados);
  });

  it('item antigo da fila (o documento inteiro, sem endereço) não apaga o endereço salvo em outro aparelho', async () => {
    const srv = servidorFalso({ estabelecimento: { endereco: 'Rua das Flores, 10' }, guia: false });
    const res = await subirPatches({
      servidor: null, patches: [patchDoItem(docAntigo({ guia: true }))], salvar: srv.salvar, ler: srv.ler,
    });
    expect(res.ok).toBe(true);
    expect(srv.leituras).toBe(1); // não sabia o que o servidor tinha: leu antes de subir
    expect(srv.dados).toEqual({ estabelecimento: { endereco: 'Rua das Flores, 10' }, guia: true });
  });

  it('aparelho com o cache vazio não sobe os valores padrão por cima da conta', async () => {
    const srv = servidorFalso({ estabelecimento: { endereco: 'Rua A' }, etiquetaConfig: { incluirQR: false } });
    const res = await subirPatches({
      servidor: null, patches: [{ primeiroUsoAdiado: true }],
      padrao: { etiquetaConfig: { incluirQR: true } }, salvar: srv.salvar, ler: srv.ler,
    });
    expect(res.ok).toBe(true);
    expect(srv.dados).toEqual({ estabelecimento: { endereco: 'Rua A' }, etiquetaConfig: { incluirQR: false }, primeiroUsoAdiado: true });
  });

  it('conta sem o documento ainda: nasce com o padrão e a mudança por cima', async () => {
    const srv = servidorFalso(null);
    const res = await subirPatches({
      servidor: { dados: { guia: false }, versao: 0 }, patches: [{ guia: true }],
      padrao: { guia: false, autoMinMax: false }, salvar: srv.salvar, ler: srv.ler,
    });
    expect(res).toMatchObject({ ok: true, versao: 1 });
    expect(srv.dados).toEqual({ guia: true });
    const vazio = servidorFalso(null);
    await subirPatches({ servidor: null, patches: [], padrao: { guia: false }, salvar: vazio.salvar, ler: vazio.ler });
    expect(vazio.dados).toEqual({ guia: false });
  });

  it('erro ou conflito sem fim: devolve não-ok, e a mudança continua guardada por quem chamou', async () => {
    const erro = await subirPatches({
      servidor: { dados: {}, versao: 1 }, patches: [{ a: 1 }],
      salvar: async () => ({ error: { message: 'Failed to fetch' } }), ler: async () => ({ data: null }),
    });
    expect(erro).toEqual({ ok: false, error: { message: 'Failed to fetch' } });
    let n = 0;
    const briga = await subirPatches({
      servidor: { dados: {}, versao: 1 }, patches: [{ a: 1 }], tentativas: 3,
      salvar: async () => { n++; return { data: { ok: false, conflito: true, versao: 1 + n, dados: {} } }; },
      ler: async () => ({ data: null }),
    });
    expect(briga.ok).toBe(false);
    expect(n).toBe(3);
    const semLer = await subirPatches({
      servidor: null, patches: [{ a: 1 }], salvar: async () => ({ data: { ok: true, versao: 1 } }),
      ler: async () => ({ error: { message: 'offline' } }),
    });
    expect(semLer).toEqual({ ok: false, error: { message: 'offline' } });
  });
});

describe('o AppContext usa a subida por chave', () => {
  const app = ler('../../store/AppContext.jsx');

  it('setPref e setPrefs mandam só o que mudou — nunca o documento de prefs inteiro', () => {
    expect(app).not.toMatch(/salvarDocNuvem\(rid?, 'prefs'/);
    expect(app).toMatch(/gravarPrefsDaConta\(r, \{ \[chave\]: valor \}\);/);
    expect(app).toMatch(/gravarPrefsDaConta\(r, soRestaurante\(patch\)\);/);
  });

  it('a fila sobe as prefs pelo caminho novo, ANTES do caminho de documento (versão -1)', () => {
    const prefs = app.indexOf('if (ehMudancaDePrefs(item)) {');
    const doc = app.indexOf("else if (item.kind === 'doc' && item.op === 'upsert') {");
    expect(prefs).toBeGreaterThan(0);
    expect(doc).toBeGreaterThan(prefs);
  });

  it('a carga e o tempo real mostram o servidor com o que falta subir por cima (sem ignorar o servidor)', () => {
    expect(app).not.toMatch(/docsPendentes\.has\('prefs'\)/);
    expect(app).toMatch(/mostrarPrefsDoServidor\(rid, mapa\['prefs'\], versoesRef\.current\.prefs \|\| 0\);/);
    expect(app).toMatch(/mostrarPrefsDoServidor\(rid, row\.dados, row\.versao \|\| 0\);/);
    // o que não subiu vai para a fila, não fica só na memória
    expect(app).toMatch(/for \(const x of noCaminho\) outboxAdd\(r, \{ kind: 'prefs', op: 'mesclar', payload: \{ patch: x\.patch \} \}\);/);
  });

  it('o cartão de primeiro uso não pede o endereço antes de saber o que a conta tem', () => {
    expect(faltasDoPrimeiroUso({ pessoas: [], prefs: {}, ehDiretoria: true, prefsConhecidas: false }).mostrar).toBe(false);
    expect(faltasDoPrimeiroUso({ pessoas: ['Ana'], prefs: {}, ehDiretoria: true, prefsConhecidas: true }))
      .toEqual({ mostrar: true, faltaPessoa: false, faltaEndereco: true });
    expect(ler('../../components/PrimeiroUso.jsx')).toMatch(/prefsConhecidas \}\);/);
  });

  it('o formulário do estabelecimento mostra o gravado até alguém mexer', () => {
    const cfg = ler('../../components/config/CartoesConfig.jsx');
    expect(cfg).toMatch(/const local = rascunho \?\? gravado;/);
    expect(cfg).toMatch(/setPref\('estabelecimento', limpo\);\s*setRascunho\(null\);/);
  });
});

describe('telas', () => {
  // ⚠️ "Como vai sair" no topo foi tentado e DESFEITO no mesmo dia: o dono
  // não queria outra ordem, queria a janela inteira na tela, sem rolar
  it('"Como vai sair" fica depois dos campos, e a prévia encolhe para a janela caber na tela', () => {
    const ep = ler('../../components/EtiquetaPrint.jsx');
    const previa = ep.indexOf('Como vai sair — {config.larguraMm}');
    const itens = ep.indexOf('{itens.map((item, idx) => {');
    expect(itens).toBeGreaterThan(0);
    expect(previa).toBeGreaterThan(itens);
    expect(ep).toMatch(/const MENOR_PREVIA = 0\.6;/);
    // desde 26/11/2026 a prévia também CRESCE quando sobra espaço (até 1,4×)
    expect(ep).toMatch(/style=\{zoomPrevia !== 1 \? \{ zoom: zoomPrevia \} : undefined\}/);
    expect(ep).toMatch(/const MAIOR_PREVIA = 1\.4;/);
    // rótulos de uma linha e botões numa linha só
    expect(ep).toMatch(/const rotulo = metodosLigados\(item\)\.length \? 'Método de conservação' : 'Armazenamento';/);
    expect(ep).toMatch(/Lote<span className="sr-only"> do fabricante<\/span>/);
    expect(ep).not.toMatch(/Sai direto, no tamanho exato/);
    expect(ler('../../components/Dialogo.jsx')).toMatch(/fundo: 'fixed inset-0 bg-polo-navy\/60 overflow-y-auto \[scrollbar-gutter:stable\] px-2 pt-2 pb-0 sm:p-4 print:hidden'/);
    // a zona morta que acabou com a janela "tremida" (24/11/2026)
    // (desde 26/11/2026 o teto é `maximo` — até 1,4×, cabendo na largura)
    expect(ler('../../components/EtiquetaPrint.jsx')).toMatch(/if \(sobra < 0\) novo = \(atual \+ sobra - 2\) \/ natural;\s*else if \(sobra > 16 && aplicado < maximo\) novo = \(atual \+ sobra - 8\) \/ natural;/);
  });

  it('Impressas saiu da barra e mora no Relatório de etiquetas (Administração)', () => {
    const nav = ler('../../components/NavBar.jsx');
    const barraEtiquetas = nav.slice(nav.indexOf('const NAV_ETIQUETAS'), nav.indexOf('export default function NavBar'));
    expect(barraEtiquetas).not.toMatch(/to: '\/impressas'/);
    expect(barraEtiquetas).toMatch(/label: 'Administração', cap: 'configurarSistema', tambem: \['\/relatorio-etiquetas', '\/relatorio-desperdicio'\]/);
    // 24/11/2026: a aba Impressas SAIU do relatório (reimprimir = link discreto, só as de hoje)
    const rel = ler('../../pages/RelatorioEtiquetas.jsx');
    expect(rel).not.toMatch(/ListaDeImpressas|\['impressas', 'Impressas'\]/);
    // só as de hoje (24/11/2026): sem os totais e sem "Ver dias anteriores"
    const lista = ler('../../pages/etiquetas/Impressas.jsx');
    expect(lista).toMatch(/export function ListaDeImpressas\(\) \{/);
    expect(lista).toMatch(/\.filter\(e => e\.impressoEm === hj\)/);
    expect(lista).not.toMatch(/Ver dias anteriores|totaisImpressos/);
    expect(ler('../../pages/Reimprimir.jsx')).toMatch(/<ListaDeImpressas \/>/);
    // e o REIMPRIMIR é livre, fora da Administração (23/11/2026, à noite)
    expect(ler('../../App.jsx')).toMatch(/<Route path="\/impressas"\s+element=\{can\('verImpressas'\) \? <Reimprimir \/> : <Navigate to="\/" replace \/>\} \/>/);
  });

  it('Administração → Etiqueta não tem mais o cartão da impressora', () => {
    expect(ler('../../pages/AdministracaoGrupo.jsx')).not.toMatch(/titulo="Impressora e rolo"|aba=impressora/);
    expect(ler('../../store/acessosAdmin.js')).not.toMatch(/temperaturas, impressora/);
  });

  it('Impressas sem a situação da etiqueta (válida, vence hoje, vencida)', () => {
    const imp = ler('../../pages/etiquetas/Impressas.jsx');
    expect(imp).not.toMatch(/statusEtiqueta|STATUS_ETIQUETA|info\.label/);
    expect(imp).toMatch(/Validade \$\{fmtData\(e\.validade\)\}/); // a data do papel continua
  });

  it('o texto dos métodos do item ficou curto', () => {
    const itens = ler('../../pages/etiquetas/Itens.jsx');
    expect(itens).toMatch(/'Quanto dura depois de aberto\?' : 'Quanto dura depois de manipulado\?'/);
    expect(itens).toMatch(/O principal já vem escolhido na hora de imprimir\./);
    expect(itens).not.toMatch(/É o prazo do processo da sua cozinha|como fica guardado e quanto dura/);
  });
});
