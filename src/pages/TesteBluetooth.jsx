import { useState } from 'react';
import Layout from '../components/Layout';
import Botao from '../components/Botao';

/**
 * Teste EXPERIMENTAL e temporário — não é feature do app, é diagnóstico.
 *
 * Pergunta que decide se dá pra imprimir etiqueta direto do celular (sem
 * driver, sem instalar nada): a MDK-022 fala Bluetooth Low Energy (o
 * navegador consegue conversar) ou só Bluetooth clássico/SPP (o navegador
 * NUNCA vai conseguir, é bloqueio de segurança do próprio Chrome/Android,
 * sem contorno por código)?
 *
 * Se a impressora aparecer na lista do requestDevice, é BLE — o caminho
 * existe. Se não aparecer (mesmo pareada no Android), é clássico e a ideia
 * de "app conversa direto com a impressora" morre aí, sem gastar mais
 * tempo tentando.
 */
export default function TesteBluetooth() {
  const [estado, setEstado] = useState('parado'); // parado | procurando | achou | cancelado | erro | semSuporte
  const [dispositivo, setDispositivo] = useState(null);
  const [erro, setErro] = useState('');

  const testar = async () => {
    if (!navigator.bluetooth) {
      setEstado('semSuporte');
      return;
    }
    setEstado('procurando');
    setErro('');
    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      setDispositivo({ nome: device.name || '(sem nome)', id: device.id });
      setEstado('achou');
    } catch (e) {
      // Cancelar a lista de dispositivos cai aqui como NotFoundError — não é erro de verdade
      if (e?.name === 'NotFoundError') {
        setEstado('cancelado');
      } else {
        setErro(e?.message || String(e));
        setEstado('erro');
      }
    }
  };

  return (
    <Layout title="Teste — Bluetooth da impressora">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-900">🧪 Teste experimental, não é uma função do app</p>
          <p className="text-xs text-amber-800 mt-1">
            Serve só para descobrir se a impressora MDK-022 dá pra ser usada direto do
            celular, sem instalar nada. Funciona no <strong>Chrome do Android</strong> — no
            iPhone o Safari nem mostra o botão, isso já é esperado.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-gray-700">
            Liga a impressora, deixa o Bluetooth do celular ligado, e toca no botão. Vai abrir
            uma lista de dispositivos do próprio Android — é o navegador perguntando, não este app.
          </p>
          <Botao onClick={testar} largura="cheia" disabled={estado === 'procurando'}>
            {estado === 'procurando' ? 'Procurando…' : '🔍 Procurar impressora Bluetooth'}
          </Botao>

          {estado === 'semSuporte' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <p className="font-bold">Este navegador não suporta.</p>
              <p className="text-xs mt-1">
                Abre esta mesma página no <strong>Chrome do Android</strong> pra testar de verdade
                (Safari do iPhone e navegadores de app embutido — Instagram, WhatsApp — não têm essa função).
              </p>
            </div>
          )}

          {estado === 'achou' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <p className="font-bold">✅ Apareceu! O caminho existe.</p>
              <p className="text-xs mt-1">
                Dispositivo selecionado: <strong>{dispositivo.nome}</strong>
              </p>
              <p className="text-xs mt-1">
                Isso confirma que a impressora fala Bluetooth Low Energy — dá pra continuar e o
                app pode imprimir direto do celular no futuro. Me avisa que eu sigo com o próximo passo.
              </p>
            </div>
          )}

          {estado === 'cancelado' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
              <p className="font-bold">Nenhum dispositivo selecionado.</p>
              <p className="text-xs mt-1">
                Se você cancelou a lista sem querer, tenta de novo. Mas se a <strong>MDK-022 nem
                apareceu</strong> na lista (mesmo já pareada no Android), é sinal de Bluetooth
                clássico — nesse caso não tem contorno por código, e a impressão direta do
                celular não vai ser possível com essa impressora.
              </p>
            </div>
          )}

          {estado === 'erro' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <p className="font-bold">Deu erro:</p>
              <p className="text-xs mt-1 break-words">{erro}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
