// =====================================================================
//  A tela de ETIQUETAR no dia a dia (23/09/2026): busca sem acento, os mais
//  usados no topo e a impressora à vista.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { casaBusca, normalizarBusca } from '../busca';
import { maisUsados } from '../etiquetas';
import { buscarNaBiblioteca } from '../../data/bibliotecaEtiquetas';
import { textoDoDiagnostico } from '../diagnostico';
import { erroEmPortugues } from '../erros';
import { aoMudarConexao, versaoDaConexao, desconectar, estadoDaConexao } from '../../lib/impressoraBLE';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('busca sem acento e por palavras', () => {
  it('quem digita sem acento acha o item com acento', () => {
    expect(casaBusca('file', 'Filé mignon')).toBe(true);
    expect(casaBusca('pure', 'Purê de batata')).toBe(true);
    expect(casaBusca('feijao', 'Feijão preto cozido')).toBe(true);
    expect(casaBusca('limao', 'Limão siciliano')).toBe(true);
    expect(casaBusca('acem', 'Acém em cubos')).toBe(true);
    expect(casaBusca('acucar', 'Açúcar refinado')).toBe(true);
  });

  it('e o contrário: com acento acha o que foi cadastrado sem', () => {
    expect(casaBusca('Filé', 'File de frango')).toBe(true);
    expect(casaBusca('MOLHO', 'molho de tomate')).toBe(true);
  });

  it('as palavras em qualquer ordem, e pedaço de cada uma', () => {
    expect(casaBusca('mignon porc', 'Filé mignon porcionado')).toBe(true);
    expect(casaBusca('porcionado file', 'Filé mignon porcionado')).toBe(true);
    expect(casaBusca('mignon frango', 'Filé mignon porcionado')).toBe(false);
  });

  it('procura em todos os campos passados (nome, categoria, responsável...)', () => {
    expect(casaBusca('bovinos', 'Picanha', 'BOVINOS')).toBe(true);
    expect(casaBusca('picanha maria', 'Picanha', null, 'Maria')).toBe(true);
  });

  it('busca vazia ou só espaços casa com tudo', () => {
    expect(casaBusca('', 'Qualquer')).toBe(true);
    expect(casaBusca('   ', 'Qualquer')).toBe(true);
    expect(casaBusca(undefined, 'Qualquer')).toBe(true);
  });

  it('normaliza ç e maiúsculas', () => {
    expect(normalizarBusca('Maçã AÇAÍ')).toBe('maca acai');
  });

  it('a biblioteca segue achando por categoria e sem acento', () => {
    expect(buscarNaBiblioteca('acem').length).toBeGreaterThan(0);
    expect(buscarNaBiblioteca('bovinos').every(i => i.categoria === 'BOVINOS' || /bovin/i.test(i.nome))).toBe(true);
    expect(buscarNaBiblioteca('').length).toBeGreaterThan(100);
  });

  it('nenhuma tela de busca ficou com o jeito antigo (toLowerCase().includes)', () => {
    for (const tela of [
      '../../pages/Etiquetas.jsx', '../../pages/etiquetas/Itens.jsx', '../../pages/etiquetas/Impressas.jsx',
      '../../pages/Entradas.jsx', '../../pages/Saidas.jsx', '../../pages/Compras.jsx',
      '../../pages/Configuracoes.jsx', '../../pages/AparasPerdas.jsx', '../../pages/Historico.jsx',
      '../../pages/Auditoria.jsx',
    ]) {
      const src = ler(tela);
      expect(src, tela).toMatch(/casaBusca\(/);
      expect(src, tela).not.toMatch(/toLowerCase\(\)\.includes\((busca|buscaHist|termo|t|b)\b/);
    }
  });
});

describe('mais usados no topo da tela Etiquetar', () => {
  const HOJE = '2026-09-23';
  const P = (id, nome, ativo = true) => ({ id, nome, ativo });
  const produtos = [P('a', 'Arroz'), P('b', 'Bacon'), P('c', 'Cebola'), P('d', 'Damasco'), P('z', 'Zimbro', false)];
  const imp = (produtoId, impressoEm = HOJE, copias = 1) => ({ id: `${produtoId}-${Math.random()}`, produtoId, impressoEm, copias });

  it('escolhe os mais etiquetados e mostra em ordem ALFABÉTICA (os blocos não trocam de lugar)', () => {
    const lista = [imp('c'), imp('c'), imp('c'), imp('b'), imp('b'), imp('a')];
    expect(maisUsados(lista, produtos, HOJE, { max: 2 }).map(p => p.nome)).toEqual(['Bacon', 'Cebola']);
  });

  it('conta o PAPEL (copias), não a linha', () => {
    const lista = [imp('a', HOJE, 10), imp('b'), imp('b'), imp('c')];
    expect(maisUsados(lista, produtos, HOJE, { max: 1, minimo: 1 }).map(p => p.id)).toEqual(['a']);
  });

  it('só os últimos 14 dias, contando hoje', () => {
    const lista = [imp('a', '2026-09-10'), imp('a', '2026-09-10'), imp('a', '2026-09-10'), imp('b', '2026-09-09'), imp('c')];
    // 10/09 entra (14 dias contando 23/09), 09/09 não
    expect(maisUsados(lista, produtos, HOJE).map(p => p.id)).toEqual(['a', 'c']);
  });

  it('item inativo ou apagado não vira atalho', () => {
    const lista = [imp('z'), imp('z'), imp('sumiu'), imp('a'), imp('b')];
    expect(maisUsados(lista, produtos, HOJE).map(p => p.id)).toEqual(['a', 'b']);
  });

  it('com menos de 2 itens, não mostra nada (conta nova não ganha faixa vazia)', () => {
    expect(maisUsados([], produtos, HOJE)).toEqual([]);
    expect(maisUsados([imp('a'), imp('a')], produtos, HOJE)).toEqual([]);
    expect(maisUsados(undefined, produtos, HOJE)).toEqual([]);
  });

  it('no máximo 8', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => P(`p${i}`, `Item ${String(i).padStart(2, '0')}`));
    const lista = muitos.map(p => imp(p.id));
    expect(maisUsados(lista, muitos, HOJE)).toHaveLength(8);
  });

  it('a tela usa o atalho, com o mesmo imprimir da lista, e esconde ao buscar', () => {
    const src = ler('../../pages/Etiquetas.jsx');
    expect(src).toMatch(/maisUsados\(etiquetasImpressas, produtos\.filter\(p => p\.ativo\), hoje\(\)\)/);
    expect(src).toMatch(/\{!buscando && catAtiva === '' && atalhos\.length > 0 && \(/);
    expect(src).toMatch(/atalhos\.map\(p => \(\s*<button key=\{p\.id\} onClick=\{\(\) => imprimirProduto\(p\)\}/);
  });
});

describe('impressora à vista', () => {
  it('quem olha a conexão é avisado quando ela cai ou é trocada', () => {
    let avisos = 0;
    const sair = aoMudarConexao(() => { avisos += 1; });
    const antes = versaoDaConexao();
    desconectar();
    expect(avisos).toBe(1);
    expect(versaoDaConexao()).toBe(antes + 1);
    sair();
    desconectar();
    expect(avisos).toBe(1); // depois de sair, não recebe mais
    expect(estadoDaConexao()).toEqual({ conectada: false, nome: '', modo: '' });
  });

  it('trocar solta a atual e abre o seletor SEM espera antes (regra do requestDevice)', () => {
    const src = ler('../../components/Impressora.jsx');
    expect(src).toMatch(/desconectar\(\);\s*try \{\s*await escolherImpressora\(\);/);
    // na faixa, o Conectar também vai direto ao seletor
    expect(src).toMatch(/try \{ await escolherImpressora\(\); \}/);
  });

  it('a etiqueta de teste vai marcada, e a janela não registra nada dela', () => {
    const imp = ler('../../components/Impressora.jsx');
    expect(imp).toMatch(/nome: 'TESTE DE IMPRESSÃO',\s*teste: true,/);
    const ep = ler('../../components/EtiquetaPrint.jsx');
    // nem relatório, nem Impressas, nem responsável lembrado: tudo mora em aoImprimir
    expect(ep).toMatch(/const lista = \(soEstes \|\| itens\)\.filter\(i => !i\.teste\);\s*if \(!lista\.length\) return;/);
    // não exige responsável e não pergunta se saiu no papel
    expect(ep).toMatch(/const faltaResponsavel = !soTeste && config\.exigirResponsavel === true/);
    expect(ep).toMatch(/if \(!soTeste\) setPerguntaPara\(etiquetaState\);/);
  });

  it('a faixa fica na tela Etiquetar e o cartão na aba Impressora', () => {
    const src = ler('../../pages/Etiquetas.jsx');
    expect(src).toMatch(/<FaixaImpressora \/>/);
    expect(src).toMatch(/<CartaoImpressora \/>/);
  });

  it('diagnóstico: o que o suporte precisa, e nada de dado pessoal', () => {
    const t = textoDoDiagnostico({
      quando: '23/09/2026 10:00', conta: 'Casa X', plano: 'Aurum Etiquetas', unidade: 'Centro',
      versao: '2026-09-23 12:00 UTC', navegador: 'Android Chrome', tela: '800x1280', online: true,
      pendencias: 2, mortos: 1, caminho: 'Bluetooth direto', bleNoNavegador: true, bleLigado: false,
      impressora: { conectada: true, nome: 'MDK-022', modo: 'comConfirmacao' },
      autorizados: ['MDK-022'], ultimoErro: { quando: 'ontem', tela: '/etiquetas', mensagem: 'x is null' },
    });
    expect(t).toMatch(/Conta: Casa X \(Aurum Etiquetas\)/);
    expect(t).toMatch(/Unidade: Centro/);
    expect(t).toMatch(/Versão do app: 2026-09-23 12:00 UTC/);
    expect(t).toMatch(/Envios pendentes: 2 \(com erro: 1\)/);
    expect(t).toMatch(/Bluetooth ligado: não/);
    expect(t).toMatch(/Impressora: conectada \(MDK-022\) · envio comConfirmacao/);
    expect(t).toMatch(/Último travamento de tela: ontem em \/etiquetas — x is null/);
    expect(t).not.toMatch(/@/);
  });

  it('diagnóstico no computador não fala de Bluetooth que não é usado', () => {
    const t = textoDoDiagnostico({ conta: 'Casa', bleNoNavegador: false, caminho: 'janela de impressão do navegador' });
    expect(t).toMatch(/Bluetooth no navegador: não/);
    expect(t).not.toMatch(/Bluetooth ligado|Impressora:/);
    expect(t).toMatch(/Versão do app: desconhecida/);
  });

  it('as mensagens de erro da impressora continuam em português, agora num lugar só', () => {
    expect(erroEmPortugues({ name: 'NotAllowedError', message: 'x' })).toMatch(/bloqueou o acesso ao Bluetooth/);
    expect(erroEmPortugues({ message: 'GATT operation failed' })).toMatch(/Perdeu a conexão/);
    expect(erroEmPortugues({ emPortugues: true, message: 'Frase nossa.' })).toBe('Frase nossa.');
    expect(ler('../../components/EtiquetaPrint.jsx')).toMatch(/import \{ erroEmPortugues \} from '\.\.\/utils\/erros';/);
  });

  it('a versão do app é carimbada na publicação', () => {
    expect(ler('../../../vite.config.js')).toMatch(/'import\.meta\.env\.VITE_VERSAO_APP': JSON\.stringify\(VERSAO_APP\)/);
  });
});

describe('janela de imprimir com o botão sempre visível', () => {
  const ep = ler('../../components/EtiquetaPrint.jsx');

  it('o rodapé com o resumo e os botões fica grudado no fim da tela', () => {
    expect(ep).toMatch(/<div className="sticky -bottom-4 -mx-5 -mb-5 px-5 pb-5 pt-3 bg-white border-t/);
    const rodape = ep.slice(ep.indexOf('<div className="sticky -bottom-4'));
    // dentro do rodapé: o resumo, o botão direto, a pergunta do computador e os botões do diálogo
    expect(rodape.indexOf('resumoDoRodape.partes.join')).toBeGreaterThan(-1);
    expect(rodape.indexOf('onClick={imprimirDireto}')).toBeGreaterThan(-1);
    expect(rodape.indexOf('Etiqueta foi impressa?')).toBeGreaterThan(-1);
    expect(rodape.indexOf('onClick={imprimir}')).toBeGreaterThan(-1);
  });

  it('o resumo diz armazenamento, vencimento e quantas etiquetas — e avisa quando sai sem vencimento', () => {
    expect(ep).toMatch(/partes: \[c\.armazenamentoLabel, c\.validadeFmt \? `vence \$\{c\.validadeFmt\}` : null, nEtiquetas\]/);
    expect(ep).toMatch(/semVencimento: !c\.validadeFmt && !soTeste/);
    expect(ep).toMatch(/Sai sem vencimento — só identificação\./);
    expect(ep).toMatch(/partes: \[`\$\{aSair\.length\} itens`, nEtiquetas\]/);
  });
});
