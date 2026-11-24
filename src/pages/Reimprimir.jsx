import Layout from '../components/Layout';
import { ListaDeImpressas } from './etiquetas/Impressas';
import { useAuth } from '../store/AuthContext';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';

// =====================================================================
//  REIMPRIMIR (23/11/2026, pedido do dono): a lista do que já saiu no rolo,
//  LIVRE — sem a senha da Administração. A etiqueta rasga na mão de quem
//  está no turno, e reimprimir só repete o que já saiu: as mesmas datas, o
//  mesmo nome de quem assinou.
//  A porta é o link discreto "Reimprimir" da tela Imprimir. Os totais ficam
//  no Relatório de etiquetas, na Administração; o Apagar aparece aqui só com
//  a Administração aberta.
// =====================================================================
export default function Reimprimir() {
  const { sessao, impersonando } = useAuth();
  const soEtiq = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  return (
    <Layout title="Reimprimir etiqueta" voltar={soEtiq ? '/' : '/etiquetas'}>
      {/* ⚠️ SÓ AS DE HOJE (24/11/2026, pedido do dono): etiqueta de outro dia
          não se reimprime — imprime uma nova */}
      <p className="text-sm text-gray-600 px-1 mb-3">Só as de hoje. De outro dia, imprima uma nova.</p>
      <ListaDeImpressas />
    </Layout>
  );
}
