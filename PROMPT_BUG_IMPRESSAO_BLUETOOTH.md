# Bug: impressão de etiquetas não sai pela impressora Bluetooth MDK-022

Cole esta mensagem inteira na conversa que está desenvolvendo o **Aurum Cozinha Pro**.

---

## O pedido

A impressão de etiquetas do app não está saindo quando a impressora térmica
**MDK-022** está conectada por **Bluetooth** (sem cabo USB). Preciso que você
investigue o lado do app e corrija.

**Importante:** o lado do Windows já foi diagnosticado e está comprovadamente
funcionando. Não repita esse trabalho — leia os fatos abaixo antes de propor
qualquer coisa. Em particular, **não me mande reinstalar driver, reparear a
impressora ou "verificar se está ligada"**: tudo isso já foi medido.

---

## O que JÁ FOI PROVADO no Windows (não reinvestigue)

Máquina: Windows 11 Home Single Language 10.0.26200, usuário `atili`.

| Fato | Como foi medido | Resultado |
|---|---|---|
| Driver instalado | `Get-PrinterDriver` | `MDK-022 Printer` (fabricante "Label") presente |
| Pareamento Bluetooth | `Get-PnpDevice -Class Bluetooth` | `MDK-022`, MAC `DC:0D:30:18:A4:E7`, status OK |
| Porta serial do BT | `Get-PnpDevice -Class Ports` | `Serial Padrão por link Bluetooth (COM8)` |
| Link RFCOMM sobe | `CreateFileW("\.\COM8")` + `WriteFile` de 4 bytes ESC/POS | Escrita OK, propriedade `Device_IsConnected` virou `True` |
| Imprime SEM cabo | Job de teste pela fila em COM8 | Log 307: "documento 7 ... impresso em MDK-022 Bluetooth pela porta COM8:, 1 página" |
| Cabo USB fora | `Get-PnpDevice USB\VID_36FC*` | `Present: False` — confirmado desconectado |

**Conclusão: hardware, driver, pareamento, porta e fila de impressão do Windows
estão todos funcionando. O Windows imprime pela Bluetooth sem cabo nenhum.**

---

## A causa que foi encontrada e corrigida (do lado do Windows)

O log `Microsoft-Windows-PrintService/Operational` mostrou os trabalhos do app:

- Job 3 (01:18:55) — 172.472 bytes → fila `MDK-022 Printer`, porta **USB002**, impresso, 1 página
- Job 4 (01:19:30) — 345.000 bytes → fila `MDK-022 Printer`, porta **USB002**, impresso, 2 páginas
- Job 5 (01:20:09) — 172.548 bytes → **spool feito, nunca concluiu** (ficou travado)

Os jobs 3 e 4 são o app imprimindo com o cabo ainda ligado. O job 5 é a
tentativa depois de tirar o cabo: entrou no spool e travou, porque a fila
`MDK-022 Printer` apontava para a porta `USB002`, que deixou de existir.

**Correção aplicada:** a fila `MDK-022 Printer` foi repontada de `USB002` para
`COM8:` com `Set-Printer`. O job travado foi removido. A configuração de papel
por usuário dessa fila (`HKCU:\Printers\DevModes2`) foi preservada.

### Estado atual das filas

```
Nome                 Porta     Driver            Papel (DevMode)
MDK-022 Printer      COM8:     MDK-022 Printer   60 x 50 mm  (config por usuário, HKCU)
MDK-022 Bluetooth    COM8:     MDK-022 Printer   101,6 x 152,4 mm (padrão de fábrica)
MDK-022 Printer (1)  USB002    MDK-022 Printer   101,6 x 152,4 mm (padrão de fábrica)
```

`MDK-022 Bluetooth` e `MDK-022 Printer (1)` são redundantes; a fila boa é
**`MDK-022 Printer`**.

---

## O sintoma que CONTINUA

Depois de tudo isso, **a impressão pelo app ainda não sai**. Não sei ainda em
que ponto ela falha. Antes de mudar código, sua primeira tarefa é descobrir
qual destes é o caso — me pergunte se não der para determinar sozinho:

1. O diálogo de impressão do Chrome nem abre ao clicar em "Imprimir" no modal.
2. O diálogo abre, mas `MDK-022 Printer` não aparece na lista de impressoras.
3. O diálogo abre, a impressora é selecionada, mas a pré-visualização sai em branco.
4. Imprime, mas sai em branco / com lixo / deslocado no papel.
5. O trabalho nem chega a aparecer no spool do Windows.

Comando para checar o item 5 (roda no PowerShell, não precisa de admin):

```powershell
Get-WinEvent -LogName "Microsoft-Windows-PrintService/Operational" -MaxEvents 20 | Select-Object TimeCreated, Id, @{n='Msg';e={($_.Message -split "`n")[0]}} | Format-Table -AutoSize -Wrap
```

---

## O que já se sabe do código do app

Pasta: `C:\Users\atili\Downloads\Code\polo-estoque` (repo `atiliorod-jpg/aurum-cozinha-pro`).
Último commit: `4041320 Corrige dois bugs do plano Etiquetas e trava a biblioteca com testes`.

Arquivos relevantes:

- `src/components/EtiquetaPrint.jsx` — modal de impressão. Dispara `window.print()`
  na linha ~362, dentro da função `imprimir()`. Renderiza a área de impressão via
  `createPortal` direto no `<body>`. Liga a classe `imprimindo-etiqueta` no `<body>`
  em `useEffect` (linhas 205-206). Injeta `@media print { @page { size: ${config.larguraMm}mm ${config.alturaMm}mm; margin: 0; } }` na linha ~497.
- `src/index.css` linhas 57-110 — regras `@media print`. Esconde `#root` com
  `display: none` quando `body.imprimindo-etiqueta`, e revela `.etiqueta-print-area`.
- `src/utils/etiquetas.js` — `ETIQUETA_CONFIG_PADRAO` = **60 x 40 mm**, `incluirQR: false`.
  Sobrescrito por `prefs.etiquetaConfig` (Config → Sistema).

### Descompasso de tamanho que eu quero que você avalie

O app pede `@page { size: 60mm 40mm }` (padrão) mas a driver da fila boa está
configurada para **60 x 50 mm**. Não sei qual é o tamanho real do meu rolo —
vou medir e te informo. Considere que esse descompasso pode ser parte do
problema (o Chrome pode recusar ou reescalar quando o `@page` não bate com
nenhum formulário oferecido pela driver).

### Histórico relevante que está nos comentários do código

- Já houve um bug de **páginas em branco em excesso** (933px de documento ÷ 151px
  de etiqueta = 7 folhas, 6 em branco). Foi corrigido trocando `visibility: hidden`
  por `display: none` no `#root` + portal para o `<body>`. Não regrida isso.
- Já se tentou **girar a etiqueta 90° por CSS** (24/08) e foi revertido: o rolo
  físico não respondeu, a orientação é decidida pela driver.
- Existe `src/pages/TesteBluetooth.jsx`, uma página experimental que testa se a
  MDK-022 fala **BLE** (Web Bluetooth) em vez de Bluetooth clássico/SPP.
  **Resultado agora conhecido:** no Windows ela conecta por **SPP clássico**
  (perfil `00001101-0000-1000-8000-00805F9B34FB`, porta COM8). Web Bluetooth
  **não** alcança SPP clássico — então o caminho "app conversa direto com a
  impressora pelo navegador" está descartado no desktop. Considere se essa
  página ainda faz sentido ou se deve ser removida.

---

## O que eu quero de você

1. Determine o ponto exato da falha (a lista de 5 itens acima).
2. Corrija no app o que for do app. Se a causa for de configuração do Windows,
   diga isso claramente em vez de mexer no código à toa.
3. Avalie o descompasso 60x40 vs 60x50 e proponha o lado certo a ajustar.
4. Não faça alterações grandes sem me perguntar antes. Bug e segurança pode
   corrigir direto.
