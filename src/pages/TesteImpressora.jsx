import { useState } from 'react';
import Layout from '../components/Layout';
import Botao from '../components/Botao';

/**
 * DIAGNÓSTICO TEMPORÁRIO — imprimir direto do celular, sem diálogo do navegador.
 *
 * ⚠️ O QUE ESTA PÁGINA RESPONDE, e por que ela existe de novo:
 * o dono descobriu, usando o app OpenLabel, que a MDK-022 fala **TSPL** — a
 * linguagem nativa dela. Com TSPL a etiqueta sai exata: nada de driver, escala
 * ou paginação no meio, que é a origem de TODOS os problemas de impressão que
 * enfrentamos (folhas em branco, tamanho errado, conteúdo na serrilha).
 *
 * Falta uma coisa para o app poder falar TSPL sozinho: a impressora precisa
 * expor **BLE**. No Windows ela aparece como porta serial (SPP clássico), e eu
 * cheguei a concluir daí que Web Bluetooth estava descartado — foi
 * generalização além da evidência. Muitas dessas impressoras fazem SPP E BLE
 * ao mesmo tempo, e o Windows usaria o SPP de qualquer forma.
 *
 * Esta página resolve a dúvida em três passos, e cada um vale sozinho:
 *   1. a impressora APARECE no seletor do navegador?  → tem BLE
 *   2. dá para CONECTAR e listar os serviços?         → o canal abre
 *   3. dá para ESCREVER TSPL e sair etiqueta?         → o caminho existe
 *
 * Sai do app assim que a resposta for conclusiva.
 */

// Serviços BLE que impressoras térmicas costumam expor. O Web Bluetooth só
// entrega um serviço que tenha sido DECLARADO aqui — descobrir depois de
// conectar não funciona. Por isso a lista é larga: é mais barato pedir demais
// do que descobrir que o serviço certo ficou de fora.
const SERVICOS_CONHECIDOS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // impressora térmica (muito comum)
  '0000ff00-0000-1000-8000-00805f9b34fb', // genérico chinês
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / serial sobre BLE
  '0000ff80-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip UART transparente
  '0000180a-0000-1000-8000-00805f9b34fb', // informações do dispositivo
];

// Etiqueta de teste em TSPL. Tamanho e espaçamento batem com o rolo 60x50.
// ⚠️ TSPL exige CRLF entre comandos — só \n alguns firmwares ignoram a linha.
const tsplTeste = () => [
  'SIZE 60 mm,50 mm',
  'GAP 2 mm,0 mm',
  'DIRECTION 1',
  'CLS',
  'TEXT 20,20,"3",0,1,1,"AURUM - TESTE"',
  'TEXT 20,70,"2",0,1,1,"Se voce esta lendo isto,"',
  'TEXT 20,110,"2",0,1,1,"o app falou direto com"',
  'TEXT 20,150,"2",0,1,1,"a impressora."',
  'TEXT 20,220,"2",0,1,1,"TSPL via Bluetooth BLE"',
  'PRINT 1,1',
].join('\r\n') + '\r\n';

export default function TesteImpressora() {
  const [passo, setPasso] = useState('inicio');
  const [erro, setErro] = useState('');
  const [dispositivo, setDispositivo] = useState(null);
  const [servicos, setServicos] = useState([]);
  const [canal, setCanal] = useState(null); // característica que aceita escrita
  const [log, setLog] = useState([]);

  const anota = (t) => setLog(l => [...l, t]);
  const temSuporte = typeof navigator !== 'undefined' && !!navigator.bluetooth;

  // ── Passo 1 e 2: achar e conectar ──────────────────────────
  const procurar = async () => {
    setErro(''); setLog([]); setServicos([]); setCanal(null);
    setPasso('procurando');
    try {
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SERVICOS_CONHECIDOS,
      });
      setDispositivo({ nome: dev.name || '(sem nome)', id: dev.id });
      anota(`Achou: ${dev.name || '(sem nome)'}`);

      anota('Conectando…');
      const server = await dev.gatt.connect();
      anota('Conectado. Lendo serviços…');

      const svcs = await server.getPrimaryServices();
      const achados = [];
      let escrita = null;

      for (const s of svcs) {
        const chars = await s.getCharacteristics().catch(() => []);
        const lista = chars.map(c => ({
          uuid: c.uuid,
          escreve: c.properties.write || c.properties.writeWithoutResponse,
        }));
        achados.push({ uuid: s.uuid, chars: lista });
        // A primeira característica que aceita escrita é o canal de comandos.
        if (!escrita) {
          const c = chars.find(x => x.properties.write || x.properties.writeWithoutResponse);
          if (c) escrita = c;
        }
      }

      setServicos(achados);
      setCanal(escrita);
      anota(`${achados.length} serviço(s), ${escrita ? 'com' : 'SEM'} canal de escrita.`);
      setPasso(escrita ? 'pronto' : 'semCanal');
    } catch (e) {
      if (e?.name === 'NotFoundError') {
        setPasso('cancelado');
      } else {
        setErro(e?.message || String(e));
        setPasso('erro');
      }
    }
  };

  // ── Passo 3: mandar TSPL ───────────────────────────────────
  const imprimirTeste = async () => {
    if (!canal) return;
    setErro(''); setPasso('imprimindo');
    try {
      const bytes = new TextEncoder().encode(tsplTeste());
      // ⚠️ EM PEDAÇOS DE 100 BYTES. BLE tem MTU pequeno (~20 a 512 bytes por
      // escrita conforme o aparelho) e mandar tudo de uma vez estoura em
      // silêncio na maioria dos casos — a impressora recebe metade do comando
      // e não imprime nada, o que parece "não funcionou" sem ser.
      const pedaco = 100;
      for (let i = 0; i < bytes.length; i += pedaco) {
        const parte = bytes.slice(i, i + pedaco);
        if (canal.properties.writeWithoutResponse) await canal.writeValueWithoutResponse(parte);
        else await canal.writeValue(parte);
        await new Promise(r => setTimeout(r, 30)); // respiro entre pedaços
      }
      anota(`Enviados ${bytes.length} bytes de TSPL.`);
      setPasso('enviado');
    } catch (e) {
      setErro(e?.message || String(e));
      setPasso('erro');
    }
  };

  return (
    <Layout title="Teste: imprimir do celular">
      <div className="space-y-4">

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-900">Teste técnico, não é função do app</p>
          <p className="text-xs text-amber-800 mt-1">
            Descobre se a impressora aceita comandos direto do navegador. Abra no{' '}
            <strong>Chrome do Android</strong>, com a impressora ligada e por perto.
          </p>
        </div>

        {!temSuporte ? (
          <div className="bg-white rounded-xl p-4">
            <p className="text-sm font-bold text-polo-navy">Este navegador não serve</p>
            <p className="text-xs text-gray-600 mt-1">
              Use o <strong>Chrome do Android</strong>. Safari do iPhone e navegadores dentro de
              outros apps (WhatsApp, Instagram) não têm essa função.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4 space-y-3">
            <Botao onClick={procurar} disabled={passo === 'procurando'}>
              {passo === 'procurando' ? 'Procurando…' : '1 · Procurar a impressora'}
            </Botao>

            {dispositivo && (
              <p className="text-xs text-gray-700">
                Dispositivo: <strong>{dispositivo.nome}</strong>
              </p>
            )}

            {passo === 'pronto' && (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-bold text-green-800">Conectou e tem canal de escrita</p>
                  <p className="text-xs text-green-700 mt-1">
                    O caminho existe. Agora o teste que decide: mandar uma etiqueta em TSPL.
                  </p>
                </div>
                <Botao onClick={imprimirTeste}>2 · Imprimir etiqueta de teste</Botao>
              </>
            )}

            {passo === 'imprimindo' && <p className="text-xs text-gray-600">Enviando…</p>}

            {passo === 'enviado' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-bold text-green-800">Comandos enviados</p>
                <p className="text-xs text-green-700 mt-1">
                  Saiu etiqueta? Se sim, o app pode imprimir direto do celular. Se não saiu nada,
                  me diga — a linguagem pode precisar de ajuste.
                </p>
              </div>
            )}

            {passo === 'semCanal' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-bold text-amber-900">Conectou, mas sem canal de escrita</p>
                <p className="text-xs text-amber-800 mt-1">
                  O navegador vê a impressora mas não achou por onde mandar comando. Me mande a
                  lista de serviços abaixo.
                </p>
              </div>
            )}

            {passo === 'cancelado' && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-bold text-gray-800">Nenhum dispositivo escolhido</p>
                <p className="text-xs text-gray-700 mt-1">
                  Se você cancelou sem querer, tente de novo. Mas se a <strong>MDK-022 não
                  apareceu na lista</strong>, mesmo ligada e por perto, ela não tem BLE — e aí o
                  navegador nunca vai alcançá-la.
                </p>
              </div>
            )}

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-bold text-red-800">Erro</p>
                <p className="text-xs text-red-700 mt-1 break-words">{erro}</p>
              </div>
            )}
          </div>
        )}

        {log.length > 0 && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs font-bold text-polo-navy mb-1.5">O que aconteceu</p>
            {log.map((l, i) => <p key={i} className="text-[11px] text-gray-600">· {l}</p>)}
          </div>
        )}

        {servicos.length > 0 && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs font-bold text-polo-navy mb-1.5">Serviços encontrados</p>
            <p className="text-[11px] text-gray-600 mb-2">
              Mande isto para o suporte se o teste não imprimir.
            </p>
            {servicos.map(s => (
              <div key={s.uuid} className="mb-2">
                <p className="text-[11px] font-mono text-gray-800 break-all">{s.uuid}</p>
                {s.chars.map(c => (
                  <p key={c.uuid} className="text-[11px] font-mono text-gray-500 break-all pl-3">
                    {c.uuid} {c.escreve ? '· escreve' : ''}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
