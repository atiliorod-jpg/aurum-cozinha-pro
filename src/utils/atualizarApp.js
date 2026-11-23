// =====================================================================
//  VERSÃO NOVA DO APP: o aparelho da cozinha se atualiza sozinho
//  (23/11/2026, no jeito do Magurō)
//
//  • Procura versão nova a cada 30 min e quando o app volta para a frente.
//    ⚠️ O tablet fica aberto dias, e o navegador sozinho só procura quando a
//    página é aberta de novo — sem isto, a cozinha ficava semanas na versão
//    velha.
//  • A versão nova é baixada em segundo plano e assume sozinha
//    (registerType 'autoUpdate' no vite.config.js).
//  • A TELA só recarrega na tela dos nomes ("Quem vai imprimir?"), depois de
//    30 s sem ninguém tocar e sem janela aberta — nunca no meio de uma
//    senha, de uma etiqueta ou de um lançamento. Nas outras telas aparece o
//    aviso com o botão Recarregar (PwaUpdatePrompt).
//  Recarregar não perde nada: o login da conta, a fila sem internet e o
//  cache ficam no aparelho; e na tela dos nomes ninguém está imprimindo.
// =====================================================================
import { useEffect, useSyncExternalStore } from 'react';

export const PROCURAR_A_CADA_MS = 30 * 60 * 1000;
export const PARADO_PARA_ATUALIZAR_MS = 30 * 1000;

let pronta = false; // a versão nova já assumiu; falta só recarregar a tela
let ligada = false;
const ouvintes = new Set();

/** A versão nova assumiu (o service worker trocou). Também usado pelos testes. */
export function marcarVersaoNovaPronta() {
  pronta = true;
  ouvintes.forEach(f => f());
}

/** Ligado uma vez, pelo PwaUpdatePrompt: ouve a troca de versão e procura versão nova de tempos em tempos. */
export function ligarAtualizacao() {
  if (ligada || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  ligada = true;
  // ⚠️ a 1ª instalação também troca o controlador: só é versão NOVA se já
  // havia um antes (senão, quem abre o app pela primeira vez veria o aviso)
  let controlador = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlador) marcarVersaoNovaPronta();
    controlador = navigator.serviceWorker.controller;
  });
  const procurar = () => {
    if (navigator.onLine === false) return;
    navigator.serviceWorker.getRegistration().then(reg => reg?.update()).catch(() => {});
  };
  setInterval(procurar, PROCURAR_A_CADA_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') procurar(); });
}

const assinar = (f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const ler = () => pronta;

/** true quando há versão nova esperando a tela recarregar. */
export const useVersaoNovaPronta = () => useSyncExternalStore(assinar, ler, () => false);

/**
 * Na tela dos nomes: com versão nova pronta e 30 s sem toque, recarrega.
 * `ativo` = a tela dos nomes está aberta, sem ninguém digitando senha, e não
 * é a demonstração (a sessão dela vive só na memória: recarregar mandaria o
 * visitante de volta para o começo).
 */
export function useAtualizarQuandoParado(ativo) {
  const temNova = useVersaoNovaPronta();
  useEffect(() => {
    if (!ativo || !temNova) return undefined;
    let t;
    const armar = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        // ⚠️ janela aberta (confirmação, ajuda, imprimir): espera mais um pouco
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) armar();
        else window.location.reload();
      }, PARADO_PARA_ATUALIZAR_MS);
    };
    armar();
    // fase de CAPTURA: um botão que para a propagação não esconde o toque
    window.addEventListener('pointerdown', armar, true);
    window.addEventListener('keydown', armar, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', armar, true);
      window.removeEventListener('keydown', armar, true);
    };
  }, [ativo, temNova]);
}
