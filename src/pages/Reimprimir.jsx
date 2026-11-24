import Layout from '../components/Layout';
import { ListaDeImpressas } from './etiquetas/Impressas';
import { useAuth } from '../store/AuthContext';
import { produtoAtivo, soEtiquetas as ehSoEtiquetas } from '../utils/produto';

// =====================================================================
//  REIMPRIMIR (23/11/2026, pedido do dono): a lista do que já saiu no rolo,
//  LIVRE — sem a senha da Administração. A etiqueta rasga na mão de quem
//  está no turno, e reimprimir só repete o que já saiu: as mesmas datas, o
//  mesmo nome de quem assinou.
//  A porta é o botão "Reimprimir" ao lado de "Imprimindo como Maria", na
//  tela Imprimir. O Relatório de etiquetas (os totais e o Apagar) fica na
//  Administração, com a senha.
// =====================================================================
export default function Reimprimir() {
  const { sessao, impersonando } = useAuth();
  const soEtiq = ehSoEtiquetas(produtoAtivo(sessao, impersonando));
  return (
    <Layout title="Reimprimir etiqueta" voltar={soEtiq ? '/' : '/etiquetas'}>
      <p className="text-sm text-gray-600 px-1 mb-3">
        Toque em Reimprimir na etiqueta que rasgou: ela sai igual à original, com as mesmas datas.
      </p>
      <ListaDeImpressas comTotais={false} />
    </Layout>
  );
}
