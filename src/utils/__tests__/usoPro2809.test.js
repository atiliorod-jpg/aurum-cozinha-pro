// =====================================================================
//  LOTE D — USO NO PRO (28/09/2026)
// =====================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { linkSuporte, WHATSAPP_SUPORTE } from '../suporte';

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

describe('perda e validades', () => {
  const perdas = ler('../../pages/AparasPerdas.jsx');

  it('perda do estoque só na unidade do item (e g quando ele é em kg)', () => {
    expect(perdas).toMatch(/\(prodPerda\.unidade === 'kg' \? \['kg', 'g'\] : \[prodPerda\.unidade\]\)/);
    expect(perdas).toMatch(/if \(prodDaPerda\?\.unidade && unidPerda !== prodDaPerda\.unidade\)/);
  });

  it('Validades dá baixa pela mesma folha da leitura do QR, que já lança a perda no estoque (30/09/2026)', () => {
    const v = ler('../../pages/Validades.jsx');
    expect(v).toMatch(/<BaixaEtiqueta etq=\{baixando\}/);
    expect(v).not.toMatch(/Marcar consumida/);
    // o atalho de outras telas para a perda já preenchida continua existindo
    expect(perdas).toMatch(/const perdaSugerida = useLocation\(\)\.state\?\.perda \|\| null;/);
  });

  it('o botão Registrar apagado diz o que falta', () => {
    expect(perdas).toMatch(/const faltaPerda = /);
    expect(ler('../../pages/Entradas.jsx')).toMatch(/Para registrar, digite a quantidade de pelo menos um item abaixo\./);
    expect(ler('../../pages/Saidas.jsx')).toMatch(/Para registrar, digite a quantidade de pelo menos um item abaixo\./);
  });
});

describe('janela de imprimir e suporte', () => {
  it('quem assina: cadastra ali mesmo (a janela não fecha com o link)', () => {
    const r = ler('../../components/ResponsavelSelect.jsx');
    expect(r).not.toMatch(/<Link/);
    expect(r).toMatch(/addPessoa\(n\);/);
    expect(r).toMatch(/pode\(sessao, permissoes, 'configurarSistema'\)/);
  });

  it('"Não saiu" orienta e oferece o suporte', () => {
    expect(ler('../../components/EtiquetaPrint.jsx')).toMatch(/if \(!saiu\) \{ setNaoSaiuPara\(etiquetaState\); return; \}/);
  });

  it('o WhatsApp do suporte tem link de verdade, com a mensagem pronta', () => {
    expect(linkSuporte('Olá! Quero refil')).toBe(`https://wa.me/${WHATSAPP_SUPORTE}?text=Ol%C3%A1!%20Quero%20refil`);
    expect(ler('../../pages/Etiquetas.jsx')).toMatch(/linkSuporte\('Olá! Quero refil de etiquetas 60 × 50 mm\.'\)/);
    expect(ler('../../components/Impressora.jsx')).toMatch(/Enviar ao suporte pelo WhatsApp/);
  });

  it('a Ajuda leva a tela e a versão junto', () => {
    expect(ler('../../components/BotaoFeedback.jsx')).toMatch(/· tela \$\{tela\} · versão \$\{versao\}/);
  });
});

describe('inventário e painel', () => {
  it('inventário abre em "Todos", com busca, só com as categorias que têm item', () => {
    const i = ler('../../pages/Inventario.jsx');
    expect(i).toMatch(/const \[catAtiva, setCatAtiva\] = useState\(''\);/);
    expect(i).toMatch(/casaBusca\(buscaCont, p\.nome\)/);
    expect(i).toMatch(/categorias\.filter\(c => produtosAtivos\.some\(p => p\.categoria === c\)\)/);
  });

  it('painel: encurtar o teste pede confirmação', () => {
    expect(ler('../../pages/Admin.jsx')).toMatch(/titulo: 'Encurtar o teste\?'/);
  });
});
