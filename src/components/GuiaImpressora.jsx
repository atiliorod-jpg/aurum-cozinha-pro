import { useState } from 'react';
import { CartaoImpressora } from './Impressora';
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
      'Lista vazia: impressora desligada, longe, ou conectada em outro aparelho — ela atende um por vez.',
    ],
  },
  {
    id: 'computador',
    titulo: 'Computador com Windows',
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
    <div className="space-y-3">
      {/* status, trocar, etiqueta de teste e diagnóstico — fora do PDF do guia */}
      <div className="print:hidden"><CartaoImpressora /></div>
      <div className="bg-polo-navy text-white rounded-xl p-4">
        <p className="text-sm font-bold text-polo-gold">Impressora e rolo</p>
        <p className="text-xs mt-1 text-white/90">
          O sistema trabalha com a <strong>Tomate MDK-022</strong> e o rolo de{' '}
          <strong>60 × 50 mm</strong>, já acertados um com o outro. A Aurum fornece a impressora
          e os refis.
        </p>
        <a href={linkSuporte('Olá! Quero refil de etiquetas 60 × 50 mm.')} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 min-h-11 px-4 rounded-lg bg-polo-gold text-polo-navy text-xs font-bold">
          <Icon name="suporte" size={16} /> Pedir refil pelo WhatsApp
        </a>
        <p className="text-xs mt-2 text-white/80">
          Comprando por fora, peça 60 × 50 mm em BOPP: o adesivo comum solta na câmara fria e
          borra na umidade.
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-gray-600">Escolha a sua situação para ver o passo a passo.</p>
        <button onClick={() => window.print()}
          className="bg-gray-100 text-gray-600 font-semibold text-xs px-3 py-2 rounded-lg whitespace-nowrap">
          Salvar guia em PDF
        </button>
      </div>
      {TIPOS_IMPRESSORA.map(t => (
        <div key={t.id} className="bg-white rounded-xl overflow-hidden">
          <button onClick={() => setAberto(aberto === t.id ? '' : t.id)}
            className="w-full text-left px-4 py-3 print:hidden">
            <p className="font-bold text-sm text-polo-navy">{t.titulo} {aberto === t.id ? '▾' : '▸'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.resumo}</p>
          </button>
          {/* na impressão, TODOS os blocos saem abertos */}
          <div className={`px-4 pb-4 ${aberto === t.id ? '' : 'hidden'} print:block`}>
            <p className="hidden print:block font-bold text-sm text-polo-navy mb-1">{t.titulo}</p>
            <div className="bg-polo-beige rounded-lg p-3 mb-3">
              <p className="text-xs font-bold text-polo-navy uppercase tracking-wide mb-0.5">Como fica a impressão</p>
              <p className="text-xs text-gray-700">{t.comoFica}</p>
            </div>
            <ol className="space-y-2">
              {t.passos.map((p, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-700">
                  <span className="w-5 h-5 rounded-full bg-polo-navy text-polo-gold font-bold flex items-center justify-center flex-shrink-0 text-xs">{i + 1}</span>
                  <span className="pt-0.5">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ))}
      {/* ⚠️ O iPhone tinha um bloco só para ele, com quatro passos que eram
          quatro maneiras de dizer "não dá". Uma linha resolve, e ela fica no
          fim porque só interessa a quem tem iPhone. */}
      <p className="text-xs text-gray-600 px-1">
        <strong>iPhone e iPad</strong> não imprimem direto — a Apple não libera o Bluetooth para
        aplicativos como o Aurum. Use um Android na cozinha, ou o computador. O resto do app
        funciona normalmente neles.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        <p className="font-bold mb-0.5">Precisa de ajuda para configurar?</p>
        <p>Configuramos junto com você na instalação.</p>
        <a href={linkSuporte('Olá! Preciso de ajuda para configurar a impressora de etiquetas.')} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 min-h-11 px-4 rounded-lg bg-blue-700 text-white font-bold">
          <Icon name="suporte" size={16} /> Falar com o suporte no WhatsApp
        </a>
      </div>
    </div>
  );
}
