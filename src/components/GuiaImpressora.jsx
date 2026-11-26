import { useState } from 'react';
import { CartaoImpressora } from './Impressora';
import Abas from './ui/Abas';
import { PILULA } from './QuemImprime';
import { linkSuporte } from '../utils/suporte';
import Icon from './Icons';

// =====================================================================
//  A ABA IMPRESSORA — mora em MEUS ITENS desde 23/11/2026 (pedido do dono)
//
//  Era a segunda aba da tela Imprimir. O dono quer a tela de imprimir só
//  para etiquetar: conectar, trocar e testar a impressora é coisa de quem
//  cuida do cadastro, uma vez — não de quem está com o pote na mão. A faixa
//  "Impressora conectada / Conectar" continua no topo da tela Imprimir
//  (FaixaImpressora), porque é ela que a cozinha usa no dia a dia.
//  O cartão "Impressora e rolo" da Administração → Etiqueta saiu junto.
// =====================================================================

// Guia da impressora — duas situações, passo a passo curto. Imprimível.
//
// ⚠️ ESTA ABA JÁ FOI GRANDE DEMAIS e o dono cortou: tinha um bloco só para
// iPhone, dois blocos para computador (USB e Bluetooth, quase iguais) e um
// teste em folha A4. Guia de impressora é lido em pé, com a impressora na
// frente, uma vez. Cada passo a mais é um passo que ninguém lê.
//
// ⚠️ CUIDADO COM O TEXTO DO ROLO: a Aurum VENDE a impressora e as etiquetas.
// Isso não vira propaganda no meio de um guia técnico, mas também não se
// escreve "compre em qualquer lugar" como se não fosse conosco. Diz o que o
// sistema usa, diz que fornecemos, e não fecha a porta de comprar fora.
//
// ⚠️ Vale para OS DOIS produtos (Etiquetas e Cozinha Pro) — nada aqui pode
// supor que a pessoa só tem etiquetas.
const TIPOS_IMPRESSORA = [
  {
    id: 'celular',
    titulo: 'Celular Android',
    resumo: 'Imprime direto, sem cabo e sem instalar nada.',
    comoFica: 'A etiqueta sai em segundos, no tamanho certo. Não abre janela de impressão.',
    passos: [
      'Ligue a impressora. Não precisa parear no Android — quem conecta é o app.',
      'Abra o Aurum no Chrome. Dentro do WhatsApp ou do Instagram não funciona.',
      'Monte a etiqueta e toque em "Conectar impressora e imprimir". Escolha a impressora na lista.',
      'Nas próximas vezes ele já conecta sozinho.',
    ],
    // o problema mais comum, num quadro vermelho (redesign, 26/11/2026)
    aviso: 'A lista veio vazia? A impressora está desligada, longe, ou conectada em outro aparelho — ela atende um por vez.',
  },
  {
    id: 'computador',
    titulo: 'Computador com Windows',
    aba: 'Windows',
    resumo: 'Por cabo ou por Bluetooth. O cabo dá menos trabalho.',
    comoFica: 'Abre a janela de impressão do Windows e a etiqueta sai pela fila da impressora.',
    passos: [
      'CABO: ligue no USB e espere instalar. Se o Windows não achar, baixe o driver do modelo no site do fabricante.',
      'BLUETOOTH: pareie em Configurações → Bluetooth e dispositivos → Adicionar dispositivo.',
      'Nos dois casos, abra Impressoras e scanners → sua impressora → Preferências de impressão e deixe o papel em 60 × 50 mm. Se não estiver na lista, crie em "Novo" e confira que ficou selecionado — criar e não selecionar é o erro mais comum.',
      'SÓ NO BLUETOOTH: se você já usou a impressora por cabo, a fila antiga não funciona sem fio, e o trabalho fica parado sem erro na tela. Apague a fila antiga e use a que nasceu com o pareamento. Trocar a porta não resolve. Depois de recriar, refaça o tamanho do papel.',
      'No app, toque em "Imprimir pelo computador" e escolha a impressora.',
    ],
  },
];

export default function GuiaImpressora() {
  // Abre no celular: é o caminho recomendado e o que mais gente usa na cozinha.
  const [aberto, setAberto] = useState('celular');
  return (
    <div className="space-y-4">
      {/* ⚠️ REDESIGN (26/11/2026): os dois cartões lado a lado no computador; o
          passo a passo com as três situações em abas (o iPhone é uma linha só,
          como o dono quis: não imprime direto) */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* status, trocar, etiqueta de teste e diagnóstico — fora do PDF do guia */}
        <div className="print:hidden"><CartaoImpressora /></div>
        <div className="bg-white border-2 border-polo-linha rounded-2xl p-4 space-y-3">
          <p className="titulo-secao">Impressora e rolo</p>
          <ul className="flex flex-wrap gap-2" aria-label="O que o sistema usa">
            {['Tomate MDK-022', 'Rolo 60 × 50 mm', 'BOPP'].map(t => (
              <li key={t} className="rounded-full border-2 border-polo-linha px-3 py-1 text-xs font-bold text-polo-navy">{t}</li>
            ))}
          </ul>
          <p className="text-sm text-polo-tinta">
            Já acertados um com o outro. A Aurum fornece a impressora e os refis.
          </p>
          <a href={linkSuporte('Olá! Quero refil de etiquetas 60 × 50 mm.')} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 min-h-12 px-4 rounded-xl bg-polo-gold text-polo-navy text-sm font-bold print:hidden">
            <Icon name="suporte" size={16} /> Pedir refil pelo WhatsApp
          </a>
          <p className="flex gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <Icon name="info" size={16} />
            <span>Comprando por fora, peça 60 × 50 mm em BOPP: o adesivo comum solta na câmara fria e borra na umidade.</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="titulo-secao">Passo a passo</p>
        <button onClick={() => window.print()} className={`${PILULA} print:hidden`}>
          <Icon name="relatorio" size={16} />Salvar guia em PDF
        </button>
      </div>
      <Abas className="print:hidden" rotulo="Sua situação" valor={aberto} aoTrocar={setAberto}
        opcoes={[...TIPOS_IMPRESSORA.map(t => [t.id, t.aba || t.titulo]), ['iphone', 'iPhone e iPad']]} />
      {TIPOS_IMPRESSORA.map(t => (
        // na impressão, TODOS os blocos saem abertos
        <div key={t.id} className={`bg-white border-2 border-polo-linha rounded-2xl p-4 space-y-3 ${aberto === t.id ? '' : 'hidden'} print:block`}>
          <p className="hidden print:block font-bold text-sm text-polo-navy">{t.titulo}</p>
          <div className="bg-polo-gold-100 rounded-xl px-3 py-2">
            <p className="text-sm font-bold text-polo-navy">{t.resumo}</p>
            <p className="text-xs text-polo-tinta">{t.comoFica}</p>
          </div>
          <ol className="space-y-2.5">
            {t.passos.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-gray-800">
                <span className="w-6 h-6 rounded-full bg-polo-navy text-polo-gold font-bold flex items-center justify-center flex-shrink-0 text-xs">{i + 1}</span>
                <span className="pt-0.5">{p}</span>
              </li>
            ))}
          </ol>
          {t.aviso && (
            <p className="flex gap-2 text-sm text-perigo-tinta bg-perigo-suave border border-perigo/30 rounded-xl px-3 py-2">
              <Icon name="alerta" size={18} /><span>{t.aviso}</span>
            </p>
          )}
        </div>
      ))}
      {/* ⚠️ O iPhone tinha um bloco só para ele, com quatro passos que eram
          quatro maneiras de dizer "não dá". Uma linha resolve. */}
      <div className={`bg-white border-2 border-polo-linha rounded-2xl p-4 ${aberto === 'iphone' ? '' : 'hidden'} print:block`}>
        <p className="text-sm text-gray-800">
          <strong>iPhone e iPad</strong> não imprimem direto — a Apple não libera o Bluetooth para
          aplicativos como o Aurum. Use um Android na cozinha, ou o computador. O resto do app
          funciona normalmente neles.
        </p>
      </div>

      {/* o suporte, em azul-marinho com o botão dourado (redesign) */}
      <div className="bg-polo-navy text-white rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <p className="font-bold text-polo-gold">Precisa de ajuda para configurar?</p>
          <p className="text-sm text-white/90">Configuramos junto com você na instalação.</p>
        </div>
        <a href={linkSuporte('Olá! Preciso de ajuda para configurar a impressora de etiquetas.')} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 min-h-12 px-4 rounded-xl bg-polo-gold text-polo-navy font-bold">
          <Icon name="suporte" size={16} /> Falar com o suporte
        </a>
      </div>
    </div>
  );
}
