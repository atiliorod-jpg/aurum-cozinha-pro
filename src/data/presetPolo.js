// Modelo "Polo" — a montagem completa do restaurante Polo (produtos, fichas,
// categorias, equipe, destinos). É importável com 1 clique em Configurações,
// para entregar o sistema já preenchido sem deixar isso na base de fábrica.
import { PRODUTOS_INICIAIS, CATEGORIAS, PESSOAS_INICIAIS, DESTINOS_APARA } from './produtos';
import { FICHAS_INICIAIS } from './fichas';

export const POLO_PRESET = {
  versao: 3,
  produtos:   PRODUTOS_INICIAIS,
  categorias: CATEGORIAS,
  pessoas:    PESSOAS_INICIAIS,
  destinos:   DESTINOS_APARA,
  fichas:     FICHAS_INICIAIS,
  producoes:  [],
  locais:     [{ id: 'polo_central', nome: 'Polo Central' }, { id: 'polo_beer', nome: 'Polo Beer' }],
};
