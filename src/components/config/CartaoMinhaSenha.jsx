import { useState } from 'react';
import Botao from '../Botao';
import { useAuth } from '../../store/AuthContext';

const MIN = 8; // o mesmo mínimo do projeto (C3, scripts/travas-de-senha.mjs)

/**
 * Trocar a PRÓPRIA senha, de dentro do app.
 *
 * ⚠️ POR QUE EXISTE (10/09/2026). A conta aberta pelo painel da Aurum passou a
 * nascer com uma senha sorteada que a AURUM vê — o dono monta a conta, entra,
 * deixa pronta e só então entrega. A promessa dessa entrega é "o cliente troca
 * a senha quando quiser", e até aqui o app não tinha onde: a única troca de
 * senha era a tela do link de recuperação por e-mail. Sem este cartão, a
 * senha que a Aurum conhece ficaria sendo a senha do cliente para sempre.
 *
 * ⚠️ SÓ A CONTA DONA. A conta de equipe tem a senha trocada pelo dono, em
 * Contas da equipe — é assim que ele tira alguém que saiu. E o super-admin no
 * modo suporte não vê o cartão: ali a sessão é a DELE, e o cartão trocaria a
 * senha da Aurum a partir da tela do cliente.
 */
export default function CartaoMinhaSenha({ toast }) {
  const { sessao, atualizarSenha } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  if (!sessao || sessao.demo || sessao.eSuperAdmin || sessao.cargo !== 'diretoria') return null;

  const fechar = () => { setAberto(false); setSenha(''); setRepetir(''); setVer(false); };

  const salvar = async () => {
    if (senha.length < MIN) { toast(`A senha precisa de ao menos ${MIN} caracteres.`, 'aviso'); return; }
    // ⚠️ DIGITADA DUAS VEZES: não existe "senha antiga" para conferir depois.
    // Um erro de digitação aqui tranca o dono fora da própria conta.
    if (senha !== repetir) { toast('As duas senhas não são iguais.', 'aviso'); return; }
    setOcupado(true);
    const erro = await atualizarSenha(senha);
    setOcupado(false);
    if (erro) { toast(`A senha não foi trocada: ${erro}`, 'erro'); return; }
    fechar();
    toast('Senha trocada. Use a nova no próximo acesso.', 'sucesso', { duracao: 7000 });
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-polo-navy">Trocar minha senha</p>
        <p className="text-xs text-gray-500 mt-0.5">
          A senha desta conta, a que entra com o seu e-mail. Se a conta foi entregue pela Aurum, troque aqui.
        </p>
      </div>
      {!aberto ? (
        <Botao variante="secundario" tamanho="sm" largura="auto" onClick={() => setAberto(true)}>
          Trocar senha
        </Botao>
      ) : (
        <div className="space-y-2">
          <input type={ver ? 'text' : 'password'} autoComplete="new-password" value={senha}
            onChange={e => setSenha(e.target.value)} placeholder={`Nova senha (mínimo ${MIN})`}
            aria-label="Nova senha" className={inputCls} />
          <input type={ver ? 'text' : 'password'} autoComplete="new-password" value={repetir}
            onChange={e => setRepetir(e.target.value)} placeholder="Repita a nova senha"
            aria-label="Repita a nova senha" className={inputCls} />
          <label className="flex items-center gap-2 text-xs text-gray-600 min-h-11">
            <input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} />
            Mostrar o que estou digitando
          </label>
          <div className="flex gap-2">
            <Botao variante="secundario" tamanho="sm" onClick={fechar} disabled={ocupado}>Cancelar</Botao>
            <Botao tamanho="sm" onClick={salvar} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar senha'}</Botao>
          </div>
        </div>
      )}
    </div>
  );
}
