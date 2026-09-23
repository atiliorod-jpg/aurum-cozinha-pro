// =====================================================================
//  UNIDADES — vários CNPJs na mesma conta (M46, 22/09/2026)
//
//  Dois níveis:
//    • UNIDADE  → o estabelecimento: nome, CNPJ, endereço. É o que sai
//                 impresso na etiqueta e o que separa o relatório.
//    • COZINHA  → o que o app chama de estoque (Produção, Seco, Finalização).
//                 Cada cozinha pertence a uma unidade.
//
//  ⚠️ A UNIDADE PRINCIPAL É A PRÓPRIA CONTA, e o id dela é `null`. Ela não
//  existe na tabela `unidades`: nome, CNPJ e endereço continuam vindo de onde
//  sempre vieram (sessão e `prefs.estabelecimento`). Conta sem unidade extra
//  se comporta exatamente como antes — há teste para isso.
//
//  Funções PURAS: sem React, sem rede (o projeto não tem jsdom).
// =====================================================================

import { MODULO_PADRAO, catalogoDe } from './modulos';
import { estabelecimentoDe } from './instancias';
import { formatarCEP } from './documentos';

const texto = (v) => String(v ?? '').trim();

/** As extras que valem hoje (arquivada sai de vista, não some do histórico). */
export const unidadesAtivas = (unidades) => (unidades || []).filter(u => u && !u.arquivada_em);

/** A conta tem mais de uma casa? É isso que liga seletor, rótulos e filtros. */
export const temUnidadesExtras = (unidades) => unidadesAtivas(unidades).length > 0;

/** A linha de uma unidade extra; `null` para a principal ou id desconhecido. */
export function acharUnidade(unidades, id) {
  if (!id) return null;
  return (unidades || []).find(u => u && u.id === id) || null;
}

/** A unidade de uma cozinha: id da extra, ou `null` (principal). */
export function unidadeDaCozinha(estoques, cozinhaId) {
  const e = (estoques || []).find(x => x.id === cozinhaId);
  return e?.unidade || null;
}

/**
 * A cozinha "de etiquetas" de uma unidade: a Produção principal dela.
 *
 * ⚠️ Unidade arquivada, ou que o aparelho ainda não conhece, cai na Produção
 * raiz — o destino de queda de sempre, onde moram os dados da principal.
 */
export function cozinhaPrincipalDa(estoques, unidadeId) {
  if (!unidadeId) return MODULO_PADRAO;
  const e = (estoques || []).find(x => x.unidade === unidadeId && x.principalDaUnidade && !x.arquivado);
  return e ? e.id : MODULO_PADRAO;
}

/**
 * No plano Etiquetas: qual cozinha o aparelho usa.
 *
 * ⚠️ PRESERVA A CORREÇÃO DO 'seco' GUARDADO. O plano Etiquetas era cravado na
 * Produção porque um aparelho que já tinha aberto o Estoque Seco no app
 * completo guardava 'seco' — e o Seco não tem armazenamento: a etiqueta saía
 * sem a linha de congelado/resfriado, em silêncio. Aqui qualquer cozinha
 * guardada vira a Produção PRINCIPAL da unidade dela: 'seco' é da principal e
 * cai em 'producao', como antes; a cozinha de uma unidade extra cai na
 * Produção daquela unidade.
 */
export function cozinhaDeEtiquetas(estoques, modulo) {
  return cozinhaPrincipalDa(estoques, unidadeDaCozinha(estoques, modulo));
}

/** O nome que o dono reconhece: o da unidade extra, ou o da conta. */
export function nomeDaUnidade(unidades, id, nomeConta) {
  if (!id) return texto(nomeConta) || 'Unidade principal';
  return texto(acharUnidade(unidades, id)?.nome) || 'Unidade';
}

/** A principal primeiro, depois as extras ativas — é a ordem do seletor. */
export function opcoesDeUnidade(unidades, nomeConta) {
  return [
    { id: null, nome: nomeDaUnidade(unidades, null, nomeConta), principal: true },
    ...unidadesAtivas(unidades).map(u => ({ id: u.id, nome: texto(u.nome), cnpj: u.cnpj, principal: false })),
  ];
}

/** "Recife - PE", no mesmo formato do campo da unidade principal. */
export const cidadeUf = (cidade, uf) => [texto(cidade), texto(uf)].filter(Boolean).join(' - ');

/**
 * O que sai impresso: o nome no topo e o rodapé (CNPJ, endereço, cidade, CEP).
 *
 * ⚠️ É AQUI QUE A ETIQUETA DEIXA DE MENTIR SOBRE A CASA. Sem unidade extra, o
 * resultado é idêntico ao de antes: nome do estoque (o texto antigo) ou da
 * conta, CNPJ da conta e o endereço de `prefs`. Na unidade extra, tudo vem da
 * linha dela — inclusive o CNPJ, que o cliente não edita.
 */
export function dadosDaEtiqueta({ unidade, estoque, nomeConta, cnpjConta, estabelecimentoConta }) {
  if (unidade) {
    return {
      nome: texto(unidade.nome),
      estabelecimento: {
        cnpj: texto(unidade.cnpj),
        endereco: texto(unidade.endereco),
        cidade: cidadeUf(unidade.cidade, unidade.uf),
        // o banco guarda 8 números; no papel sai como se escreve (00000-000)
        cep: formatarCEP(unidade.cep),
      },
    };
  }
  const est = estabelecimentoConta && typeof estabelecimentoConta === 'object' ? estabelecimentoConta : {};
  return {
    nome: estabelecimentoDe(estoque, nomeConta),
    estabelecimento: { ...est, cnpj: texto(cnpjConta) || texto(est.cnpj) },
  };
}

// ── Segunda fase (M48, 23/09/2026) ────────────────────────────────────

/**
 * De onde a cozinha lê a LISTA DE ITENS (produtos, categorias, fichas).
 *
 * Sem lista própria é o de sempre, por tipo (`catalogoDe`): toda Produção
 * (e toda Finalização) lê 'produtos', todo Seco lê 'seco::produtos'. Numa
 * unidade com `catalogo_proprio`, a base é a Produção principal DELA
 * ('producao#ab12' → 'producao#ab12::produtos') e, para o Seco, o mesmo
 * sufixo ('seco#ab12::produtos') — as chaves que a M48 copia ao ligar.
 *
 * ⚠️ Unidade ARQUIVADA mantém a base própria: o histórico dela continua
 * legível com os itens dela.
 */
export function baseDoCatalogo(estoques, unidades, cozinhaId) {
  const padrao = catalogoDe(cozinhaId);
  const u = acharUnidade(unidades, unidadeDaCozinha(estoques, cozinhaId));
  if (!u || !u.catalogo_proprio || !u.cozinha) return padrao;
  const sufixo = String(u.cozinha).split('#')[1];
  if (!sufixo) return padrao;
  return padrao === MODULO_PADRAO ? u.cozinha : `${padrao}#${sufixo}`;
}

/**
 * A conta presa a uma unidade (M48): `null` = livre (todas as unidades);
 * `{ id }` = presa, com `id` nulo para a principal.
 */
export const unidadeFixaDe = (perfil) => (perfil?.unidade_fixa ? { id: perfil.unidade_id || null } : null);

/** As cozinhas que uma conta presa enxerga: só as da unidade dela. */
export function cozinhasDaFixa(estoques, fixa) {
  if (!fixa) return estoques || [];
  return (estoques || []).filter(e => (e.unidade || null) === (fixa.id || null));
}

/**
 * A cozinha em que a conta presa trabalha: a guardada no aparelho, se for da
 * unidade dela e estiver ativa; senão a Produção principal da unidade.
 */
export function cozinhaDaFixa(estoques, fixa, guardada) {
  const e = (estoques || []).find(x => x.id === guardada);
  if (e && !e.arquivado && (e.unidade || null) === (fixa?.id || null)) return e.id;
  return cozinhaPrincipalDa(estoques, fixa?.id || null);
}

/**
 * A etiqueta de uma conta presa só pode sair quando o aparelho JÁ SABE qual é
 * a unidade dela. Sem isto, no primeiro segundo (unidades ainda chegando) —
 * ou com a unidade arquivada — a etiqueta sairia com o CNPJ da principal.
 * Devolve '' (pode imprimir) ou o motivo.
 */
export function bloqueioDaFixa(fixa, unidades, unidadeAtualId) {
  if (!fixa || !fixa.id) return '';
  const u = acharUnidade(unidades, fixa.id);
  if (!u) return 'Carregando os dados da unidade desta conta…';
  if (u.arquivada_em) return 'A unidade desta conta foi arquivada. Peça à conta dona para escolher outra unidade para esta conta.';
  return unidadeAtualId === fixa.id ? '' : 'Carregando os dados da unidade desta conta…';
}
