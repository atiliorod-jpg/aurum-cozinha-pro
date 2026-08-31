import { useNavigate } from 'react-router-dom';

/**
 * Termos de uso — página inteira, imprimível, em formato de contrato.
 *
 * ⚠️ Por que página e não modal: os termos anteriores eram um resumo
 * explicativo dentro de um modal do login. Não falavam de propriedade
 * intelectual, cópia, rescisão nem responsabilidade, e não dava para guardar
 * nem imprimir. Um cliente que assina uma mensalidade espera poder salvar o que
 * aceitou.
 *
 * ⚠️ "Como se fosse PDF" NÃO gera PDF. Usa `window.print()` + o `@media print`
 * global (`src/index.css`), e o navegador oferece "Salvar como PDF". É o mesmo
 * mecanismo do guia de impressora, já testado — sem biblioteca nova, sem peso
 * a mais no bundle do tablet.
 */

// ⚠️ VERSÃO E DATA. O aceite é gravado junto com a versão (`termosVersao` no
// cadastro): aceite sem versão registrada não vale nada no dia em que o texto
// mudar, porque não há como dizer o que a pessoa aceitou.
export const TERMOS_VERSAO = '1.1';
export const TERMOS_VIGENCIA = '29 de agosto de 2026';

function Clausula({ n, titulo, children }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h2 className="font-bold text-polo-navy text-sm mb-1.5">{n}. {titulo}</h2>
      <div className="space-y-2 text-sm text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

export default function Termos() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-polo-beige">
      <div className="max-w-3xl mx-auto p-5 print:p-0 print:max-w-none">

        <div className="flex items-center justify-between gap-3 mb-5 print:hidden">
          <button onClick={() => navigate(-1)}
            className="text-sm font-semibold text-polo-navy flex items-center gap-1 min-h-11">
            <span aria-hidden="true" className="text-lg leading-none">‹</span> Voltar
          </button>
          <button onClick={() => window.print()}
            className="bg-polo-navy text-polo-gold font-bold text-xs px-4 py-2.5 rounded-lg">
            Salvar em PDF
          </button>
        </div>

        <div className="bg-white rounded-2xl p-6 print:p-0 print:rounded-none">
          <header className="border-b border-gray-200 pb-4 mb-5">
            <p className="text-[11px] font-bold text-polo-navy uppercase tracking-wide">
              Aurum Serviços Gastronômicos
            </p>
            <h1 className="text-xl font-bold text-polo-navy mt-1">
              Termos de Uso, Licença de Software e Política de Privacidade
            </h1>
            <p className="text-xs text-gray-600 mt-1">
              Versão {TERMOS_VERSAO} · em vigor desde {TERMOS_VIGENCIA}
            </p>
          </header>

          {/* A base normativa vem no começo: é o que explica por que o produto
              existe, e é o argumento mais forte que ele tem. */}
          <div className="bg-polo-beige rounded-lg p-4 mb-6 break-inside-avoid">
            <p className="font-bold text-polo-navy text-sm mb-1.5">Base normativa</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              A <strong>RDC nº 216/2004 da ANVISA</strong>, que regula os serviços de alimentação
              em todo o país, determina no item <strong>4.8.18</strong> que o alimento preparado e
              conservado sob refrigeração ou congelamento traga na embalagem, no mínimo:{' '}
              <strong>designação do produto, data de preparo e prazo de validade</strong>. Estados e
              municípios podem exigir mais — em São Paulo, a Portaria CVS 3/2026 substitui a CVS
              5/2013 a partir de 04/10/2026 e passa a determinar que se observe o prazo indicado
              pelo fabricante no rótulo.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed mt-2">
              O Aurum imprime a etiqueta com esses campos. <strong>O cumprimento da norma, porém,
              é do estabelecimento</strong> — ver cláusula 7.
            </p>
          </div>

          <Clausula n="1" titulo="Objeto e partes">
            <p>
              Este instrumento regula o uso do software <strong>Aurum</strong> ("o sistema"),
              fornecido pela <strong>Aurum Serviços Gastronômicos</strong> ("a contratada"), pelo
              estabelecimento que realiza o cadastro ("o contratante").
            </p>
            <p>
              O cadastro e o uso do sistema implicam aceitação integral destes termos. O aceite é
              registrado com data e versão.
            </p>
          </Clausula>

          <Clausula n="2" titulo="Produtos, preços e pagamento">
            <p>
              O sistema é oferecido em dois produtos, contratados separadamente:{' '}
              <strong>Aurum Etiquetas</strong>, restrito ao cadastro de itens e à impressão de
              etiquetas de validade; e <strong>Aurum Cozinha Pro</strong>, que acrescenta estoque,
              recebimento, produção, relatórios e demais funções.
            </p>
            <p>
              Os valores vigentes são apresentados no momento da contratação e na tela de
              assinatura. O pagamento é feito por Pix, com ativação manual pela contratada após a
              confirmação. A contratada pode reajustar os valores mediante aviso prévio de 30 dias,
              sem efeito sobre período já pago.
            </p>
          </Clausula>

          <Clausula n="3" titulo="Período de teste">
            <p>
              Cada estabelecimento tem direito a <strong>um único período de teste gratuito</strong>,
              contado da criação da conta. O teste é vinculado ao <strong>CNPJ</strong> informado no
              cadastro: um mesmo CNPJ não obtém novo período de teste mediante criação de nova conta.
            </p>
            <p>
              Encerrado o teste sem contratação, o acesso é suspenso e{' '}
              <strong>os dados são preservados</strong>, ficando disponíveis caso o contratante
              assine posteriormente.
            </p>
          </Clausula>

          <Clausula n="4" titulo="Propriedade intelectual">
            <p>
              O sistema, seu código-fonte, sua interface, seus textos, o layout das etiquetas, a
              biblioteca de itens e as tabelas de referência são de{' '}
              <strong>propriedade exclusiva da contratada</strong> e protegidos pela Lei nº
              9.610/1998 (direitos autorais) e pela Lei nº 9.609/1998 (software).
            </p>
            <p><strong>É expressamente vedado ao contratante:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>copiar, reproduzir ou distribuir o sistema, no todo ou em parte;</li>
              <li>revender, sublicenciar, ceder, alugar ou emprestar o acesso a terceiros;</li>
              <li>fazer engenharia reversa, descompilar ou tentar obter o código-fonte;</li>
              <li>
                extrair a biblioteca de itens, as tabelas de validade ou o layout das etiquetas
                para uso fora do sistema;
              </li>
              <li>
                utilizar o sistema, seu conteúdo ou sua estrutura para desenvolver, direta ou
                indiretamente, <strong>produto ou serviço concorrente</strong>;
              </li>
              <li>remover ou alterar marcas, avisos de titularidade ou identificação da contratada.</li>
            </ul>
            <p>
              O descumprimento autoriza a <strong>suspensão imediata do acesso</strong>, sem
              devolução de valores, e sujeita o infrator às sanções civis e penais cabíveis.
            </p>
            <p>
              <strong>Os dados operacionais lançados pelo contratante</strong> (itens, prazos,
              registros, etiquetas emitidas) <strong>são dele</strong>, e podem ser exportados a
              qualquer momento.
            </p>
          </Clausula>

          <Clausula n="5" titulo="Licença de uso">
            <p>
              A contratada concede licença <strong>não exclusiva, intransferível e revogável</strong>,
              limitada ao estabelecimento identificado no cadastro e válida enquanto durar a
              assinatura ou o período de teste. A licença não transfere propriedade sobre o sistema.
            </p>
          </Clausula>

          <Clausula n="6" titulo="Obrigações do contratante">
            <ul className="list-disc pl-5 space-y-1">
              <li>fornecer dados cadastrais verdadeiros, incluindo CNPJ próprio e válido;</li>
              <li>manter a guarda das credenciais, respondendo pelo uso feito com elas;</li>
              <li>conceder acesso apenas a pessoal autorizado do estabelecimento;</li>
              <li>
                <strong>conferir e definir os prazos de validade</strong> aplicáveis aos seus
                produtos, conforme a cláusula 7.
              </li>
            </ul>
          </Clausula>

          {/* ⚠️ A cláusula que mais protege o dono. Não prometer conformidade
              seria omissão perigosa: quem responde pela validade é o RT do
              estabelecimento, e o app não tem como validar processo nenhum. */}
          <Clausula n="7" titulo="Limitação de responsabilidade e responsabilidade sanitária">
            <p>
              O sistema é uma <strong>ferramenta de registro e impressão</strong>. Ele imprime a
              etiqueta com os dados que o contratante cadastra.
            </p>
            <p>
              <strong>
                O sistema não valida processos produtivos, não realiza análise laboratorial e não
                garante conformidade sanitária.
              </strong>{' '}
              Os prazos e as faixas de temperatura oferecidos na biblioteca de itens são{' '}
              <strong>sugestões de partida</strong>, baseadas em referências públicas do setor, e
              devem ser conferidos e ajustados ao processo, à embalagem e aos equipamentos de cada
              cozinha.
            </p>
            <p>
              <strong>
                A definição da validade de cada preparo e o cumprimento da legislação sanitária são
                de responsabilidade exclusiva do contratante e do seu responsável técnico.
              </strong>
            </p>
            <p>
              A contratada não responde por perdas decorrentes de prazo cadastrado incorretamente,
              de uso indevido do sistema, de falha de equipamento de impressão ou de indisponibilidade
              temporária de conexão. A responsabilidade da contratada, em qualquer hipótese, fica
              limitada ao total pago nos 3 meses anteriores ao problema.
            </p>
          </Clausula>

          <Clausula n="8" titulo="Disponibilidade e suporte">
            <p>
              O sistema funciona também <strong>sem conexão</strong>, sincronizando quando a
              internet retorna. A contratada empenha-se em manter o serviço disponível, sem garantia
              de operação ininterrupta, podendo haver paradas para manutenção.
            </p>
            <p>
              O suporte é prestado por WhatsApp em horário comercial. A equipe pode acessar os dados
              da conta para prestar suporte, e{' '}
              <strong>todo acesso fica registrado no histórico do próprio contratante</strong>.
              Para <em>editar</em> qualquer dado, depende de autorização expressa, limitada a 24
              horas e revogável.
            </p>
          </Clausula>

          <Clausula n="9" titulo="Dados pessoais (LGPD)">
            <p>
              O tratamento de dados pessoais observa a Lei nº 13.709/2018 e está detalhado na{' '}
              <strong>Parte II — Política de Privacidade</strong>, ao final deste documento.
            </p>
          </Clausula>

          <Clausula n="10" titulo="Vigência, rescisão e devolução de dados">
            <p>
              A contratação vigora por prazo indeterminado e pode ser encerrada por qualquer das
              partes, a qualquer tempo, sem multa. Não há reembolso proporcional de período já pago.
            </p>
            <p>
              Encerrada a relação, o contratante pode <strong>exportar seus dados</strong> pelo
              próprio sistema. A contratada mantém os dados por 90 dias após o encerramento e, em
              seguida, pode eliminá-los definitivamente. A exclusão imediata pode ser solicitada
              pelo canal de atendimento.
            </p>
            <p>
              A contratada pode suspender o acesso em caso de inadimplência ou de violação da
              cláusula 4, mediante aviso.
            </p>
          </Clausula>

          <Clausula n="11" titulo="Foro">
            <p>
              Fica eleito o foro da comarca de <strong>Recife, Pernambuco</strong>, para dirimir
              questões oriundas destes termos, com renúncia a qualquer outro.
            </p>
          </Clausula>

          {/* ── PARTE II ─────────────────────────────────────────────
              A política de privacidade estava num modal separado, com link
              próprio. O dono pediu um documento só — mas ela continua como
              SEÇÃO identificável, e não diluída entre as cláusulas: se um
              cliente ou fiscal pedir "a política de dados", tem que dar para
              apontar. O texto veio do modal, já revisado. */}
          <div className="border-t-2 border-polo-navy/20 pt-5 mt-7">
            <h2 className="font-bold text-polo-navy text-base mb-1">Parte II — Política de Privacidade</h2>
            <p className="text-xs text-gray-600 mb-4">Tratamento de dados pessoais, conforme a Lei nº 13.709/2018 (LGPD).</p>
          </div>

          <Clausula n="12" titulo="Dados tratados">
            <p>
              Nome e e-mail dos usuários vinculados à conta, os dados cadastrais do estabelecimento
              (razão social, CNPJ, WhatsApp, cidade) e os registros operacionais — itens, prazos,
              etiquetas emitidas e, no plano completo, estoque, produção e movimentações.
            </p>
          </Clausula>

          <Clausula n="13" titulo="Finalidade">
            <p>
              Os dados são tratados exclusivamente para a prestação do serviço contratado.
              <strong> Não há venda, cessão ou compartilhamento com terceiros para fins comerciais.</strong>
            </p>
          </Clausula>

          <Clausula n="14" titulo="Armazenamento e segurança">
            <p>
              Os dados residem em infraestrutura de nuvem, com criptografia em trânsito e isolamento
              por estabelecimento aplicado na camada do banco de dados — cada conta acessa somente os
              próprios registros.
            </p>
            {/* ⚠️ Este parágrafo já dizia que o acesso do suporte "ocorre apenas
                mediante autorização expressa". Não era verdade: só a EDIÇÃO
                exige autorização; a leitura sempre foi livre. Desde a migração
                25 todo acesso fica registrado, e o texto descreve o que de fato
                acontece. Não reescrever para soar melhor. */}
            <p>
              A equipe Aurum pode acessar os dados da conta para prestar suporte, e
              <strong> todo acesso fica registrado no Histórico de mudanças do próprio contratante</strong>,
              identificado como “Suporte Aurum”. Para <em>editar</em> qualquer dado, a equipe depende de
              autorização expressa do contratante, limitada a 24 horas e revogável a qualquer momento.
            </p>
          </Clausula>

          <Clausula n="15" titulo="Direitos do titular">
            <p>
              A conta permite exportar a íntegra dos dados a qualquer momento. Pedidos de correção ou
              de exclusão definitiva da conta e dos dados podem ser feitos pelo canal oficial de
              atendimento (WhatsApp da Aurum) e são atendidos em até <strong>4 dias úteis</strong>.
            </p>
          </Clausula>

          <footer className="border-t border-gray-200 pt-4 mt-6 text-[11px] text-gray-600">
            <p>Aurum Serviços Gastronômicos · Recife/PE · atendimento por WhatsApp</p>
            <p className="mt-0.5">
              Termos de Uso e Política de Privacidade versão {TERMOS_VERSAO}, em vigor desde {TERMOS_VIGENCIA}.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
