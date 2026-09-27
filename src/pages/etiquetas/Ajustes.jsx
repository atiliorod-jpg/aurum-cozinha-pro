import { useState } from 'react';
import Layout from '../../components/Layout';
import Botao from '../../components/Botao';
import { useApp } from '../../store/AppContext';
import { useAuth, CARGOS } from '../../store/AuthContext';
import { useUI } from '../../store/UIContext';
import { CartaoArmazenamentos, CartaoEtiquetas, CartaoSuporteRemoto, CartaoContas, CartaoCargos,
         CartaoMeusDados, CartaoUnidades, CartaoEquipeDasUnidades } from '../../components/config/CartoesConfig';
import CartaoMinhaSenha from '../../components/config/CartaoMinhaSenha';
import { ResumoDoPlano } from '../../components/PlanoExtras';

/**
 * Administração do plano Aurum Etiquetas.
 *
 * ⚠️ SÓ A CONTA DONA abre (rota protegida em App.jsx com Restrito
 * cargo="diretoria"). Aqui se muda temperatura, prazo, tamanho de etiqueta,
 * suporte remoto e assinatura — decisões do responsável pelo estabelecimento,
 * não de quem está de plantão. Ficou aberto por engano até 29/08/2026.
 *
 * Reúne SÓ o que este produto tem: como a etiqueta sai, como os itens são
 * armazenados, quem assina, e a conta. Não monta destinos de saída, mín/máx
 * automático, planilha de produtos nem limpar tudo — são todos de estoque.
 *
 * Esta tela existe porque no plano etiquetas NÃO EXISTE Administração. Sem ela
 * as Configurações ficariam sem porta nenhuma.
 */
export default function Ajustes() {
  const { prefs, setPref, setPrefs, pessoas, addPessoa, removePessoa,
          permissoes, setPermissoes, exportarBackup, importarBackup } = useApp();
  // ⚠️ A ADMINISTRAÇÃO ABRE PARA QUEM O DONO LIBERAR (capacidade
  // `configurarSistema`), mas nem tudo aqui dentro é delegável. Assinatura,
  // contas da equipe, matriz de acessos e suporte remoto continuam SÓ da conta
  // dona: são o contrato e a chave da casa. A matriz em especial — quem
  // pudesse editá-la se daria qualquer outra permissão, e a restrição não
  // valeria nada.
  const { sessao, logout, usuarios, criarConta, trocarSenhaDe, removerConta,
          desativarUsuario, reativarUsuario, definirApelido, temPermissao } = useAuth();
  const ehDono = temPermissao('diretoria');
  const { toast, confirm } = useUI();
  const [novaPessoa, setNovaPessoa] = useState('');

  const adicionarPessoa = () => {
    const n = novaPessoa.trim();
    if (!n) return;
    if (pessoas.some(p => p.toLowerCase() === n.toLowerCase())) {
      toast('Essa pessoa já está na lista.', 'aviso'); return;
    }
    addPessoa(n);
    setNovaPessoa('');
    toast(`${n} adicionado(a).`, 'sucesso');
  };

  const tirarPessoa = async (p) => {
    const ok = await confirm({
      titulo: `Remover ${p}?`,
      mensagem: 'As etiquetas já impressas com esse nome continuam como estão.',
      perigo: true, confirmar: 'Remover',
    });
    if (ok) { removePessoa(p); toast('Pessoa removida.', 'sucesso'); }
  };

  return (
    <Layout title="Administração">
      {/* uma linha: plano, situação e o caminho para Planos e pagamento */}
      {ehDono && <ResumoDoPlano />}

      {/* Armazenamento vem primeiro: define o que a etiqueta imprime */}
      <CartaoArmazenamentos prefs={prefs} setPref={setPref} toast={toast} confirm={confirm} />

      <CartaoEtiquetas prefs={prefs} setPref={setPref} toast={toast} mostrarQR={false} nomeRestaurante={sessao?.restauranteNome} cnpjDaConta={sessao?.cnpj} />

      {/* Responsáveis — é o nome que sai assinado na etiqueta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-polo-navy">Responsáveis</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Quem pode assinar a etiqueta. O nome escolhido sai impresso no campo RESP.
          </p>
        </div>
        {pessoas.length === 0 ? (
          <p className="text-xs text-gray-600 italic">Ninguém cadastrado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pessoas.map(p => (
              <span key={p} className="inline-flex items-center gap-1.5 bg-polo-beige text-polo-navy text-xs font-semibold rounded-full pl-3 pr-1.5 py-1.5">
                {p}
                <button onClick={() => tirarPessoa(p)} aria-label={`Remover ${p}`}
                  className="w-5 h-5 rounded-full bg-white/70 text-gray-600 leading-none">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <input type="text" value={novaPessoa} onChange={e => setNovaPessoa(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') adicionarPessoa(); }}
            placeholder="Nome de quem assina" aria-label="Nome do novo responsável"
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
          <Botao onClick={adicionarPessoa} tamanho="sm" largura="auto">Adicionar</Botao>
        </div>
      </div>

      {/* ⚠️ A CONTA E O DINHEIRO MORAM EM "PLANOS E PAGAMENTO" (pedido do dono,
          27/09/2026: "tem muita informação"). Aqui ficou só a senha e, para
          quem já tem mais de uma casa, as unidades — assunto do dia a dia.
          Plano, unidade nova, contas a mais e o Pro: ResumoDoPlano (no topo)
          leva para lá. */}
      {ehDono && (<>
      {/* ⚠️ Logo abaixo da conta: a conta entregue pela Aurum chega com a senha
          que a Aurum sorteou, e trocar é a primeira coisa que o dono faz. */}
      <CartaoMinhaSenha toast={toast} />

      {/* Só aparece com mais de uma unidade (M46): qual CNPJ cada aparelho usa */}
      <CartaoUnidades />
      <CartaoEquipeDasUnidades />
      </>)}

      {/* ⚠️ O plano Etiquetas não tinha COMO colocar ninguém para dentro: a
          tela de acessos morava só no plano completo, e a conta dona era a
          única que conseguia entrar. Quem etiqueta no dia a dia não é quem
          assina o contrato. */}
      {ehDono && (
      <CartaoContas sessao={sessao} usuarios={usuarios} cargos={CARGOS}
        criarConta={criarConta} trocarSenhaDe={trocarSenhaDe} removerConta={removerConta}
        desativarUsuario={desativarUsuario} reativarUsuario={reativarUsuario}
        definirApelido={definirApelido} toast={toast} confirm={confirm} />
      )}

      {/* ⚠️ Vem logo depois das contas de propósito: criar o acesso e decidir o
          que ele alcança são a mesma tarefa, e separá-las fazia o dono criar
          uma conta e sair da tela sem nunca ver as permissões. */}
      {/* ⚠️ A MATRIZ DE ACESSOS NUNCA É DELEGADA. Quem pudesse editá-la se
          daria qualquer outra permissão — inclusive as que ficaram de fora —
          e a restrição inteira não valeria nada. */}
      {ehDono && (
      <CartaoCargos permissoes={permissoes} setPermissoes={setPermissoes}
        usuarios={usuarios} soEtiquetas toast={toast} confirm={confirm} />
      )}

      {/* ⚠️ ANTES do suporte remoto e depois da conta: é assunto do dono, não
          da operação do dia. Os Termos prometem esta exportação (cláusula 15) e
          o plano Etiquetas não tinha botão nenhum. */}
      <CartaoMeusDados exportarBackup={exportarBackup} importarBackup={importarBackup}
        toast={toast} confirm={confirm} />

      {/* ⚠️ Autorizar a Aurum a ver os dados da casa é decisão de quem assina o
          contrato, não de quem opera. */}
      {ehDono && <CartaoSuporteRemoto prefs={prefs} setPrefs={setPrefs} toast={toast} />}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <Botao variante="secundario" onClick={async () => {
          const ok = await confirm({ titulo: 'Sair da conta', mensagem: 'Você vai precisar entrar de novo.', confirmar: 'Sair' });
          if (ok) logout();
        }}>Sair da conta</Botao>
      </div>
    </Layout>
  );
}
