import ResponsavelSelect from './ResponsavelSelect';
import QuemImprime from './QuemImprime';
import { useOperador } from '../store/OperadorContext';

// =====================================================================
//  QUEM ESTÁ REGISTRANDO (Lote 2 da auditoria, decisão do dono, 14/10/2026)
//
//  Uma pessoa por vez no aparelho. A etiqueta já pedia o nome (e a senha de 4
//  números, se tiver) em "Quem vai imprimir?"; os formulários de lançamento
//  tinham um seletor "Responsável" LIVRE — qualquer um registrava no nome de
//  qualquer outro, e o "quem fez" do histórico não valia nada. Agora vale a
//  MESMA pessoa nos dois: quem entrou pelo nome assina a etiqueta e os
//  lançamentos, até "Trocar" ou 5 minutos sem uso (ver OperadorContext).
//
//  O nome é pedido NA HORA de registrar (decisão do dono), não ao abrir o app:
//  se ninguém entrou, o próprio formulário mostra a grade de nomes, e o botão
//  de registrar espera.
//
//  Equipe vazia: o seletor de sempre (ResponsavelSelect), como antes.
// =====================================================================

// (o nome que vai no lançamento sai de `useQuemRegistra`, no OperadorContext)

export default function QuemRegistra({ manual, aoManual, rotulo = 'Responsável' }) {
  const { operador, comEquipe, trocar } = useOperador();
  if (!comEquipe) return <ResponsavelSelect value={manual} onChange={aoManual} label={rotulo} />;
  if (operador) {
    return (
      <div className="flex items-center justify-between gap-2 bg-polo-beige rounded-lg pl-3 pr-1 py-1">
        <p className="text-sm text-gray-700 min-w-0 truncate">
          Registrando como <strong className="text-polo-navy">{operador}</strong>
        </p>
        <button type="button" onClick={trocar}
          className="min-h-11 px-3 rounded-lg text-xs font-bold text-polo-navy flex-shrink-0">
          Trocar
        </button>
      </div>
    );
  }
  return (
    <QuemImprime dentroDaJanela titulo="Quem está registrando?"
      texto="Toque no seu nome. O lançamento fica no seu nome." />
  );
}
