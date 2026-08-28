# Impressora Tomate MDK-022 por Bluetooth — o que foi descoberto

Registro do diagnóstico de 27–28/08/2026. **Resolvido e funcionando.**
Guardado aqui porque metade disto não é óbvio e a outra metade custou horas.

> Parte deste conteúdo vai virar texto de ajuda dentro do app, na aba
> **Imprimir → Impressora** (`src/pages/Etiquetas.jsx`, `TIPOS_IMPRESSORA`).
> Ainda **não** foi feito — é tarefa combinada com o dono para depois.

---

## O sintoma

Com o cabo USB ligado, o app imprimia. Tirando o cabo e usando só Bluetooth, a
impressão **parava de sair** — sem erro nenhum na tela, sem aviso, nada.

## A causa (e por que enganava)

O Windows cria a fila de impressão **amarrada ao tipo de porta em que ela
nasceu**:

| Porta | Monitor usado |
|---|---|
| `USB002` | Dynamic Print Monitor |
| `COM8:` (Bluetooth SPP) | Local Monitor |

A fila `MDK-022 Printer` tinha nascido em USB002. Trocar o nome da porta para
`COM8:` com `Set-Printer` **não muda essa amarração**: a fila continua
entregando o trabalho ao monitor de USB, que não existe mais sem o cabo.

Resultado: todo trabalho entrava no spool e **morava lá para sempre**. Sem
mensagem de erro, porque do ponto de vista do Windows nada falhou — só nunca
terminou.

### Como isso foi provado

O log `Microsoft-Windows-PrintService/Operational` mostra o ciclo completo de
um trabalho como quatro eventos: `800` (spool) → `801` (impressão) → `842`
(processador) → `307` (impresso).

| Fila | Trabalhos | Eventos |
|---|---|---|
| `MDK-022 Printer` (nascida em USB) | 5, 8, 9, 10 | **só 800.** Nunca 801/842/307 |
| `MDK-022 Bluetooth` (nascida em COM8) | 6, 7, 11 | 800 → 801 → 842 → **307 impresso** |

Mesma porta. Mesma driver. Uma funciona, a outra não. É essa comparação que
fecha o diagnóstico — sem ela, a suspeita natural (driver, pareamento, papel)
consome o dia inteiro.

Comando para reproduzir a leitura:

```powershell
Get-WinEvent -LogName "Microsoft-Windows-PrintService/Operational" -MaxEvents 25 |
  Select-Object TimeCreated, Id, @{n='Msg';e={($_.Message -split "`n")[0]}} |
  Format-Table -AutoSize -Wrap
```

## A correção

Repontar não resolve. **Recriar resolve** — e recriar com o mesmo nome não
muda nada para quem usa:

```powershell
Remove-Printer -Name "MDK-022 Printer"
Add-Printer -Name "MDK-022 Printer" -DriverName "MDK-022 Printer" -PortName "COM8:"
```

Também foram apagadas as filas redundantes (`MDK-022 Printer (1)` em USB002 e
`MDK-022 Bluetooth`), que só serviam para alguém escolher a errada. Ficou
**uma** fila, definida como padrão do Windows.

## ⚠️ A armadilha: recriar a fila APAGA o tamanho do papel

O tamanho `60 × 50 mm` **não é** uma configuração de usuário. Ele vive em duas
camadas, e as duas se perdem quando a fila é apagada:

1. O formulário **"custom" da própria driver** — a MDK-022 só oferece cinco
   tamanhos fixos (`custom`, `2_x_4`, `3_x_4`, `4_x_4`, `4_x_6`), e o "custom"
   é o único editável. De fábrica ele vem 101,6 × 152,4 mm (4×6 polegadas,
   etiqueta de remessa americana).
2. O **Default DevMode** da fila, em
   `HKLM\SYSTEM\CurrentControlSet\Control\Print\Printers\<fila>` — chave de
   **máquina**, exige administrador.

Anatomia do DevMode (blob de 1400 bytes nesta driver):

| Offset | Campo | Valor com 60×50 |
|---|---|---|
| 0–63 | `dmDeviceName` | `MDK-022 Printer` |
| 72 | `dmFields` | `0x0581EF43` |
| 78 | `dmPaperSize` | `128` (o "custom" da driver) |
| 80 | `dmPaperLength` | `500` (= 50,0 mm) |
| 82 | `dmPaperWidth` | `600` (= 60,0 mm) |

⚠️ `dmFields` **não** trazia os bits `DM_PAPERLENGTH` (0x4) e `DM_PAPERWIDTH`
(0x8) ligados — as medidas estavam no blob mas não eram autoritativas; quem
mandava era o formulário 128 da driver. Ligá-los torna o 60×50 explícito.

**Antes de apagar qualquer fila, salve o DevMode:**

```powershell
$p = Get-ItemProperty -Path 'HKCU:\Printers\DevModes2'
[IO.File]::WriteAllBytes("devmode-backup.bin", $p.'MDK-022 Printer')
reg export "HKCU\Printers" "HKCU-Printers.reg" /y
```

Backup desta sessão: `Downloads\backup-impressora-aurum-20260828-014855\`.

**Como o dono restaurou:** pela tela da própria driver — Impressoras e
scanners → MDK-022 Printer → Preferências de impressão → Configuração de
página → Papel → Editar/Novo → 60 × 50 → **e selecionar o tamanho no campo
"Nome"** (criar sem selecionar não faz efeito). Esse caminho funciona **sem
administrador**; escrever o DevMode direto no registro, não.

## O que NÃO era o problema (já medido — não reinvestigar)

- Driver: `MDK-022 Printer` (fabricante "Label"), instalado e correto.
- Pareamento: MAC `DC:0D:30:18:A4:E7`, status OK.
- Porta serial: `Serial Padrão por link Bluetooth (COM8)`, presente.
- Link RFCOMM: sobe e aceita escrita (`CreateFileW` + `WriteFile` de 4 bytes).
- Cabo USB: comprovadamente desconectado (`VID_36FC` ausente).

## Web Bluetooth está descartado para este modelo

A MDK-022 fala **Bluetooth clássico**, perfil SPP
(`00001101-0000-1000-8000-00805F9B34FB`). A API Web Bluetooth só alcança
**BLE** — em navegador nenhum, em sistema nenhum. Não existe caminho de "o app
conversa direto com a impressora pelo navegador" para este equipamento.

A página `src/pages/TesteBluetooth.jsx`, criada só para responder isso, foi
**removida** (commit `6ef05b3`).

## Estado final

| | |
|---|---|
| Fila | `MDK-022 Printer` |
| Porta | `COM8:` (Bluetooth) |
| Papel | 60 × 50 mm |
| Padrão do Windows | sim |
| Filas redundantes | removidas |

⚠️ **Os dois lados precisam dizer o mesmo tamanho.** A driver em 60×50 e o app
em **Ajustes → Etiquetas** também em 60×50. O padrão do código
(`ETIQUETA_CONFIG_PADRAO`, `src/utils/etiquetas.js`) ainda é **60×40** — vale
conferir em cada cliente novo.
