# Auditoria — Etiquetas e Desperdício (24/11/2026)

Pedido do dono: gramas no desperdício, motivo por voz, voz que entende o item
com a quantidade ("bolinho de costela 10 gramas"), botão de alterar depois de
registrar, conferir relatório e planilha, e auditar etiquetas + desperdício.

## 1. O que ficou pronto (no ar no commit 9cb3b81)

| Pedido | Como ficou |
|---|---|
| Gramas | Botões **kg · g · unid** na janela. O relatório soma g com kg (abaixo de 1 kg aparece em g: "350 g"); o "Um por um" mostra como foi registrado. Item cadastrado em g (ou mL) já abre em g. |
| Voz na busca | Entende item, quanto e motivo numa frase só, em qualquer ordem: "bolinho de costela 10 gramas", "10kg de frango vencido", "meio quilo de arroz porque queimou", "um quilo e duzentos de carne" (1,2 kg), "uma dúzia de pão de queijo" (12 unid). Item que não está na lista: aparece o botão "Registrar 'Lasanha bolonhesa' fora da lista", já com a quantidade. |
| Motivo por voz | Microfone ao lado de "Outro motivo". "Venceu" marca o botão **Vencido**; "derrubou" marca **Caiu no chão**; o que não é botão fica escrito ("Cheiro estranho"). |
| Alterar | Botão **"Alterar o registro"** no "Registrar outro desperdício?" e um cartão "Registrado: … [Alterar]" no topo por **15 minutos**. Muda quantidade, unidade, motivo e até o item ("Trocar item"). Só no mesmo aparelho, só para quem registrou (outra pessoa não vê; se a mesma pessoa voltar pelo nome, o botão continua lá). Depois de 15 min, ou depois que a Administração corrigiu, só a Administração muda. No relatório fica a marca **"Alterado na hora"** com como estava antes. |
| Relatório e planilha | Conferidos pelo robô: ele **baixa a planilha e abre** (4 abas do desperdício; 5 abas do relatório de etiquetas — que até hoje não era testada) e confere os números contra a tela; o botão Imprimir também. |

## 2. Defeitos achados e já corrigidos

1. **"Descarte registrado" mentiroso.** Se o banco recusasse o registro sem dar
   erro (conta sem liberação, ou relógio do aparelho muito atrasado), a tela
   dizia "registrado" e nada ficava gravado. Agora a janela avisa e não fecha.
2. **Fila sem internet esperando à toa.** O que era salvo bem no meio de uma
   subida da fila só subia na próxima volta da internet (ou ao abrir o app de
   novo). Agora sobe logo em seguida. Vale para tudo da fila, não só desperdício.
3. **Turno que sumia.** Em Administração → Desperdício, apagar o horário de um
   turno e salvar fazia o turno desaparecer sem jeito de pôr de volta. Agora
   pede para preencher.
4. **Teste de segurança falhando depois das 21h.** O teste do banco usava o dia
   de Londres; depois das 21h de Recife o "hoje" virava amanhã. Corrigido.
5. **Campo da quantidade apertado no celular** (98 px com os três botões de
   unidade; "1,250" não cabia). Agora 132 px num celular de 375 e 117 px num de
   360 — e a janela inteira cabe sem rolar nos dois.

## 3. Melhorias e simplificações — para você decidir

Nada disto foi aplicado. Diga quais quer.

1. **Pesar leva mais de 1 minuto.** Com a janela do desperdício aberta, 1 minuto
   sem tocar na tela volta para os nomes e perde o que foi digitado (quem foi
   pesar volta e não acha). *Sugestão:* com a janela do desperdício aberta,
   esperar 3 minutos. **Recomendo.**
2. **Sem equipe cadastrada, o desperdício sai sem responsável.** A etiqueta pede
   o nome; o desperdício não. *Sugestão:* campo "Responsável" na janela só para
   quem não usa equipe (lembrando o último, como na etiqueta). **Recomendo.**
3. **Simplificar a tela do desperdício:** tirar o botão dourado "Item fora da
   lista" do topo — a busca ("Registrar 'X' assim mesmo") e a voz já fazem isso.
   Uma coisa a menos na tela.
4. **Tirar a linha "Data · Hora · Turno · Responsável" da janela** (sai sozinho;
   o nome já está na faixa de cima). Menos texto; a janela fica mais baixa.
5. **"Mais descartados" no topo** (como o "Mais usados" das etiquetas), guardado
   no aparelho: os itens que mais vão para o lixo ficam a um toque.
6. **Relatório: ver por turno (Manhã × Noite) e por pessoa.** O turno e a pessoa
   já são gravados, mas o relatório não soma por eles. A comparação com o
   período anterior (▲▼ %), que o relatório de etiquetas tem, também caberia.
7. **Menos motivos de fábrica** (hoje 8 botões, 4 linhas): depois de algumas
   semanas de uso real, deixar só os que a casa usa. Dá para fazer hoje mesmo
   em Administração → Desperdício, sem programar.

## 4. Observações (sem ação agora)

- **Fuso:** o banco grava dia e hora no horário de Recife. Para um cliente fora
  do horário de Brasília (Manaus, Cuiabá…), a hora no relatório sairia 1 h
  diferente. Rever só se aparecer cliente assim.
- **Crescimento do banco:** cada conta pode registrar até 2.000 descartes por
  dia (trava contra abuso). No plano grátis do Supabase isso cabe por muito
  tempo; quando houver muitas contas, vale guardar só os últimos 12 meses.
- **Etiquetas:** a tela Imprimir, a janela de impressão e o Reimprimir foram
  revistos (já passaram por 4 auditorias); nenhum defeito novo encontrado.
- **Código:** a janela "Corrigir" da Administração e a "Alterar" da cozinha
  fazem quase a mesma coisa; um dia podem virar uma só (não muda nada para
  quem usa).

## 5. Como foi testado

- Testes das regras: 1.211 (inclusive 16 frases faladas de verdade e o jeito
  que o GitHub roda, sem as chaves do banco).
- Robô (Playwright): 96 cenários. Novos hoje: 4 do desperdício (gramas +
  Alterar, só quem registrou vê o Alterar, voz, planilha baixada e aberta) e 1
  do relatório de etiquetas (planilha baixada e aberta).
- Banco de verdade: teste de segurança do desperdício **35/35** (outro aparelho
  da mesma conta não altera; passou de 15 min não altera; depois da correção da
  Administração não altera; outra conta não vê nem altera) e auditoria do
  Supabase **63/63**. Contas de teste apagadas.
- Tela conferida no celular de 375 e de 360 px: a janela cabe sem rolar.
