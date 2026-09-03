import { Component } from 'react';
import { CHAVE_ULTIMO_ERRO } from '../utils/erros';

// =====================================================================
//  Barreira de erro — o que aparece quando uma tela quebra
//
//  ⚠️ SEM ISTO, QUALQUER EXCEÇÃO AO DESENHAR UMA TELA APAGA O APP INTEIRO e
//  deixa o tablet BRANCO. Não é hipótese de laboratório: é o comportamento
//  padrão do React desde sempre, e acontece no meio do serviço, com o pote na
//  mão. Tela branca não tem botão, não tem explicação e não ensina a pessoa a
//  recarregar — ela só conclui que o app que ela pagou parou de funcionar.
//
//  ⚠️ CLASSE, e não componente de função: `componentDidCatch` não tem
//  equivalente em hook. É a única parte do app que precisa ser classe, e é por
//  isso que ela é.
//
//  ⚠️ O QUE ELA NÃO FAZ. Não conserta o erro nem tenta seguir com a tela meio
//  desenhada — dado de cozinha errado na tela é pior que tela nenhuma. Ela
//  para, explica e devolve o caminho de volta.
//
//  ⚠️ E NÃO ENGOLE O ERRO EM SILÊNCIO: joga no console, que é onde o suporte
//  procura, e guarda o último no aparelho para a pessoa poder copiar e mandar
//  pelo botão Ajuda. Quando o Sentry entrar, é aqui que ele é chamado.
// =====================================================================

export default class BarreiraDeErro extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    // console.error de propósito: é o que o suporte pede para a pessoa abrir.
    console.error('[Aurum] tela quebrou:', erro, info?.componentStack);
    try {
      localStorage.setItem(CHAVE_ULTIMO_ERRO, JSON.stringify({
        mensagem: String(erro?.message || erro).slice(0, 300),
        onde: String(info?.componentStack || '').split('\n').slice(0, 4).join(' | ').slice(0, 400),
        quando: new Date().toISOString(),
        tela: window.location.hash || window.location.pathname,
      }));
    } catch { /* aparelho sem storage — o console já tem o erro */ }
  }

  render() {
    if (!this.state.erro) return this.props.children;

    // ⚠️ Recarrega DE VERDADE (location.reload) em vez de só limpar o estado:
    // o que quebrou pode estar no meio de um contexto, e voltar a desenhar por
    // cima do mesmo estado quebrado dá a mesma tela branca de novo — agora sem
    // nem o aviso, porque a barreira já teria sido usada.
    return (
      <div className="min-h-screen bg-polo-navy flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-4xl" aria-hidden="true">😕</p>
        <p className="text-polo-gold font-bold text-lg">Esta tela travou</p>
        <p className="text-white/85 text-sm max-w-xs">
          Seus dados estão salvos. Toque abaixo para abrir o app de novo.
        </p>
        <button onClick={() => window.location.reload()}
          className="bg-polo-gold text-polo-navy font-bold px-6 py-3 rounded-xl min-h-11">
          Abrir de novo
        </button>
        <p className="text-white/60 text-[11px] max-w-xs">
          Se travar outra vez, mande um recado pelo botão Ajuda, no rodapé, contando
          o que você estava fazendo — o app guardou o detalhe do erro.
        </p>
      </div>
    );
  }
}
