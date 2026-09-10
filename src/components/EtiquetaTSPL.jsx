import { useMemo } from 'react';
import { interpretarTSPL, larguraDoTexto, alturaDoTexto, papelEmPontos } from '../utils/tsplPreview';

/**
 * A prévia do que a IMPRESSORA vai desenhar — lida do próprio TSPL.
 *
 * ⚠️ NÃO É UMA SEGUNDA VERSÃO DA ETIQUETA. É o mesmo texto TSPL que sai pelo
 * Bluetooth, interpretado (ver utils/tsplPreview.js). Nada aqui decide
 * conteúdo, posição, quebra de linha ou corte — tudo isso já veio decidido
 * pelo gerador. Se um campo novo entrar em `utils/tspl.js`, ele aparece aqui
 * sozinho.
 *
 * ⚠️ SÓ APARECE ONDE A IMPRESSÃO É POR TSPL (celular com Bluetooth). No
 * computador quem imprime é o diálogo do navegador, e o que sai no papel lá é
 * o HTML do `EtiquetaLabel` — mostrar este SVG ali seria trocar uma prévia
 * mentirosa por outra.
 */
export default function EtiquetaTSPL({ tspl, nomeImagem = null }) {
  const { larguraMm, alturaMm, desenho } = useMemo(() => interpretarTSPL(tspl), [tspl]);
  const papel = papelEmPontos({ larguraMm, alturaMm });

  return (
    <svg
      viewBox={`0 0 ${papel.largura} ${papel.altura}`}
      width={`${larguraMm}mm`} height={`${alturaMm}mm`}
      role="img" aria-label="Prévia da etiqueta como a impressora vai desenhar"
      style={{ display: 'block', background: '#fff' }}>
      {/* ⚠️ O NOME EM IMAGEM ENTRA AQUI, e não é uma recriação dele: é o MESMO
          pixel que vai para a impressora (o canvas que gerou o BITMAP do TSPL,
          exportado em PNG). O interpretador lê o cabeçalho do BITMAP e PULA os
          dados, que são binários — quem desenha o nome é esta imagem. */}
      {nomeImagem && (
        <image href={nomeImagem.imagem}
          x={nomeImagem.caixa.x} y={nomeImagem.caixa.y}
          width={nomeImagem.caixa.largura} height={nomeImagem.caixa.altura} />
      )}
      {desenho.map((d, i) => {
        // Já desenhado pela imagem acima; os dados dele não passam por aqui.
        if (d.tipo === 'bitmap') return null;
        if (d.tipo === 'barra') {
          return <rect key={i} x={d.x} y={d.y} width={d.largura} height={d.altura} fill="#000" />;
        }
        const largura = larguraDoTexto(d);
        if (!largura) return null;
        return (
          <text
            key={i}
            x={d.x} y={d.y}
            fill="#000"
            // Monoespaçada porque a fonte interna da impressora é de largura
            // fixa: cada caractere ocupa exatamente LARGURA_FONTE pontos.
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            fontSize={alturaDoTexto(d)}
            // ⚠️ `textLength` + `spacingAndGlyphs` é o que torna o desenho
            // EXATO: força o texto a ocupar precisamente a largura que ele
            // ocupa no papel, em vez de depender da métrica da fonte da tela.
            // É por isso que a prévia passa a errar só no desenho da letra, e
            // nunca mais em quanto espaço ela come.
            textLength={largura}
            lengthAdjust="spacingAndGlyphs"
            dominantBaseline="text-before-edge"
            style={{ whiteSpace: 'pre' }}>
            {d.conteudo}
          </text>
        );
      })}
    </svg>
  );
}
