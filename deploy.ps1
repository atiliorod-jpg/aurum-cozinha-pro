# Deploy para GitHub Pages (repo aurum-cozinha-teste)
# Uso: .\deploy.ps1

$env:VITE_BASE = '/aurum-cozinha-teste/'
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build falhou"; exit 1 }

npx gh-pages -d dist `
  -u "atiliorod-jpg <atiliopinpolho@gmail.com>" `
  -r "https://github.com/atiliorod-jpg/aurum-cozinha-teste.git"
