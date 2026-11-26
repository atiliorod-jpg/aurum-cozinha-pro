# Análise da proposta de redesign (25/11/2026)

Material: `Downloads/aurum-redesign-prompt.zip` — um `PROMPT.md` (instruções de
redesign escritas por outra IA) + 16 capturas do app atual (tiradas no
computador, em 24/11 à noite, já com kg/unid) + 7 desenhos do "depois" + 5
comparativos. Só aparência: não mexe em regras, banco, rotas, senhas nem na
etiqueta impressa. (O outro zip, de fotos do WhatsApp, veio por engano.)

**Veredito:** boa e coerente com a marca; a maior parte dá para aplicar. Mas foi
pensada olhando a tela larga do computador e não conhece algumas decisões do
dono — os pontos da seção 2 precisam de ajuste.

## 1. Vale aplicar (melhora clara, risco baixo)

1. Barra de baixo: a aba ativa vira um bloco dourado (hoje é um círculo apagado).
2. Cabeçalho: sai a pílula "Aurum Etiquetas" do meio — no plano Etiquetas ela só
   repete o título. ⚠️ No Pro ela é o botão de trocar de área: lá fica.
3. Marca d'água "Aurum" sai de trás das listas e cartões; só em tela vazia, bem clara.
4. "Reimprimir" vira pílula na mesma linha do "Imprimindo como" (continua discreto;
   economiza uma linha).
5. Validade em destaque na janela de imprimir (faixa verde-clara, letra grande).
6. "Descartar" da lista em contorno vermelho (o bloco vinho cheio parece desligado);
   vermelho só para descartar e erro.
7. Botão que diz o que falta ("Informe a quantidade para registrar") em vez de dar
   erro depois do toque.
8. Meus itens: "+ Novo item" ao lado da busca; Planilha e Organizar grupos como
   botões secundários; "kg · 1kg" (confuso) vira "1 kg"; grupo com contagem.
9. Administração: cartões em 2 colunas no computador; teclado de senha maior.
10. Botão de suporte do WhatsApp (azul fora da marca) em azul-marinho e dourado.
11. "Agora não" vira "Cancelar"; foco visível para teclado; contraste medido.

## 2. Aplicar com ajuste

1. **Tamanhos 72/64 px**: no celular as janelas de imprimir e de desperdício
   deixariam de caber sem rolar (a do desperdício, sem equipe, já sobra 5 px num
   celular de 360×740). → 56 px no celular, 72 px só em tela maior.
2. **Motivos em grade 4×2**: só em tela larga; no celular, 2 colunas.
3. **Bolinhas da senha da Administração**: a proposta desenha 4 fixas, mas a senha
   tem de 4 a 8 números. → as bolinhas acompanham o que foi digitado.
4. **"Fecha em 2:41" sempre no topo**: o tempo volta a 3:00 a cada toque e ficaria
   mudando o tempo todo. → aparece só no último minuto.
5. **"Prévia em tamanho real"**: no celular não é tamanho real (a tela não sabe o
   milímetro). → fica "Como vai sair — 60×50 mm" e a regra já aprovada: a prévia
   depois dos campos, encolhendo para a janela caber sem rolar.
6. **"Assina" sem o "Trocar" na janela de imprimir**: a proposta tira o "Trocar". →
   manter um "Trocar" pequeno ao lado do "Assina Fulano".

## 3. Não aplicar

1. **Método de conservação em cartões** na janela de imprimir — decisão do dono
   (25/11): fica como está; a caixa em destaque evita erro entre congelado e resfriado.

## 4. Aplicado em 25–26/11/2026 (decisão do dono: tudo de uma vez)

Tudo das seções 1 e 2, com: faixa "Imprimindo como" no jeito da proposta (texto +
pílula Trocar + Reimprimir na mesma linha); prazos da LISTA como etiquetas coloridas
com cor própria por armazenamento (os da casa ganham cores de uma paleta, o estado
ganha moldura) — `utils/coresDeConservacao.js` + `components/PrazosDoItem.jsx`; a
caixa do método na janela de imprimir FICOU como estava. Tamanhos grandes (72 px,
teclas de 56) só em tela alta (`alto:` = altura ≥ 1000 px): no celular e no notebook
de 720 px as janelas de imprimir e de desperdício voltavam a rolar. A validade fica
numa linha no celular e empilhada em tela alta.

## 5. Esperando o dono (antes da aplicação)

- Aplicar em 4 lotes (base visual · Imprimir + Desperdício · Meus itens · Administração
  e telas restantes), um por vez, com print do celular antes do próximo?
- Faixa "Imprimindo como Fulano": manter a faixa azul (jeito do Magurō, aprovado em
  23/11) ou texto simples com "Trocar" e "Reimprimir" na mesma linha (proposta)?
- Prazos na LISTA de itens: etiquetas coloridas ("Congelado 30 dias" azul,
  "Refrigerado 2 dias" verde) ou manter o texto cinza de hoje?
