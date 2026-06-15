# Gerar APK grátis para o tablet (PWABuilder)

O tablet Positivo (Android 14 **Go**) muitas vezes não instala PWA pelo navegador.
A solução é empacotar o app num **APK** e instalar como app normal. É **grátis**.

## Caminho recomendado: PWABuilder (site da Microsoft, gratuito)

1. No PC, abra **https://www.pwabuilder.com**
2. Cole a URL do app: `https://atiliorod-jpg.github.io/aurum-cozinha-pro/`
3. Clique em **Start** / **Analyze**. Ele lê o manifesto e mostra uma nota (pode ignorar avisos menores).
4. Clique em **Package For Stores** → aba **Android**.
5. Em opções:
   - **Package ID**: `io.github.atiliorod.aurum` (ou outro, mas guarde — não pode mudar depois)
   - Deixe **"Signing key" = Create new** (o PWABuilder gera e te entrega a chave — **guarde o arquivo .keystore e a senha**, são necessários para futuras atualizações)
6. Clique em **Download Package**. Vem um `.zip` com:
   - `app-release-signed.apk`  ← é este que instala no tablet
   - a chave de assinatura + instruções

## Instalar no tablet

1. Passe o `.apk` para o tablet (cabo USB, Google Drive, ou WhatsApp Web → você mesmo).
2. No tablet, toque no arquivo. Vai pedir para permitir **"Instalar apps de fontes desconhecidas"** — aceite só para esse app.
3. Pronto: o ícone da Aurum fica na tela inicial e abre em tela cheia, igual app de loja.

## Observações

- **Atualizações do app**: como o conteúdo vem do site, **toda vez que eu faço deploy, o app no tablet atualiza sozinho** (ele carrega o site por dentro). Você só precisa gerar um novo APK se mudar ícone/nome/Package ID.
- **TWA**: o APK gerado é uma "Trusted Web Activity" — uma casca fina que abre o seu PWA. Por isso login, dados e offline continuam funcionando igual.
- Alternativa por linha de comando (mais técnica): **Bubblewrap** (`npx @bubblewrap/cli init --manifest https://atiliorod-jpg.github.io/aurum-cozinha-pro/manifest.webmanifest`). O PWABuilder é mais simples e faz o mesmo.

> Eu não consigo gerar/assinar o APK por aqui (precisa de chave de assinatura e SDK
> Android no seu lado), mas com os passos acima leva ~5 minutos. Se travar em alguma
> etapa, me manda o print que eu te oriento.
