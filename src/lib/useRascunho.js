import { useEffect, useRef, useState } from 'react';
import { cacheGet, cacheSet } from './cache';

/**
 * Guarda o que está sendo digitado, para trabalho longo não evaporar.
 *
 * ⚠️ O problema que isto resolve é real e caro: uma contagem de 80 itens leva
 * ~25 minutos, e o estado vivia só na memória do componente. Qualquer toque na
 * barra, o Voltar do tablet, um refresh do service worker do PWA ou a aba
 * sendo reciclada por falta de memória desmontavam a tela e apagavam tudo —
 * sem uma única pergunta.
 *
 * Regras que a chave precisa respeitar:
 *  - prefixo `pe::<rid>::` como todo o resto do app, para o rascunho sumir
 *    junto no logout (que limpa `pe::<rid>::*`) e não vazar entre contas num
 *    tablet compartilhado;
 *  - `<modulo>` no fim, porque o rascunho é POR ESTOQUE: contar o Seco não
 *    pode atropelar a contagem que ficou pela metade na Produção.
 *
 * `limpar()` só deve ser chamado DEPOIS que a gravação deu certo. Limpar antes
 * é trocar "perdeu por acidente" por "perdeu por decisão nossa".
 */
export function useRascunho(rid, chave, inicial) {
  const [valor, setValor] = useState(() => {
    const salvo = cacheGet(rid, chave, null);
    return salvo == null ? inicial : salvo;
  });

  // Depois de gravar, o efeito não pode regravar o rascunho recém-zerado.
  const ignorar = useRef(false);

  useEffect(() => {
    if (ignorar.current) return;
    // debounce: digitar não pode escrever no localStorage a cada tecla
    const t = setTimeout(() => cacheSet(rid, chave, valor), 500);
    return () => clearTimeout(t);
  }, [valor, rid, chave]);

  const limpar = (novo = inicial) => {
    ignorar.current = true;
    setValor(novo);
    cacheSet(rid, chave, null);
    setTimeout(() => { ignorar.current = false; }, 600);
  };

  const temRascunho = valor != null
    && (Array.isArray(valor) ? valor.length > 0 : Object.keys(valor || {}).length > 0);

  return [valor, setValor, limpar, temRascunho];
}
