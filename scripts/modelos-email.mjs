// Traduz e marca os e-mails que o Supabase manda ao cliente.
//
// Por que existe: os modelos de fábrica vêm em INGLÊS e sem remetente
// reconhecível — "Reset your password", assinado por ninguém. Para um
// cozinheiro em Jaboatão isso parece golpe, e e-mail de recuperação que parece
// golpe não é clicado. O canal funcionar tecnicamente não adianta se a pessoa
// não confia no que chegou.
//
// ⚠️ AS VARIÁVEIS SÃO DO SUPABASE, não nossas: {{ .ConfirmationURL }} é o link
// assinado, e trocar o nome dela por qualquer outra coisa manda um e-mail com
// um botão que não leva a lugar nenhum — sem erro em lugar nenhum.
//
// Uso:
//   node scripts/modelos-email.mjs            # mostra o que fará
//   node scripts/modelos-email.mjs --aplicar

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '');
if (!TOKEN) { console.error('❌ Falta SUPABASE_ACCESS_TOKEN em .env.local.'); process.exit(1); }

const NAVY = '#1B2A41';
const GOLD = '#C9A24B';
const BEGE = '#F3EFE6';

/**
 * ⚠️ TUDO EM TABELA E COM ESTILO NA PRÓPRIA TAG. Cliente de e-mail não é
 * navegador: Outlook e Gmail descartam <style> no topo, flexbox e grid. O que
 * sobrevive em todos é tabela com `style` inline — feio de escrever, e é o que
 * chega inteiro no celular de quem vai clicar.
 */
const molde = ({ titulo, texto, botao, url, rodape }) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BEGE};padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
      <tr>
        <td style="background:${NAVY};padding:20px 24px">
          <div style="color:${GOLD};font-size:19px;font-weight:bold;letter-spacing:.5px">AURUM COZINHA</div>
          <div style="color:#ffffff;opacity:.75;font-size:12px;margin-top:2px">Etiquetas de validade e controle de cozinha</div>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 24px 8px">
          <h1 style="margin:0 0 10px;color:${NAVY};font-size:19px">${titulo}</h1>
          <p style="margin:0;color:#3f4650;font-size:15px;line-height:1.6">${texto}</p>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:22px 24px 6px">
          <a href="${url}" style="display:inline-block;background:${NAVY};color:${GOLD};font-size:15px;font-weight:bold;text-decoration:none;padding:14px 30px;border-radius:10px">${botao}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px 24px">
          <p style="margin:0 0 14px;color:#6b7280;font-size:12px;line-height:1.6">
            Se o botão não abrir, copie e cole este endereço no navegador:<br>
            <span style="color:${NAVY};word-break:break-all">${url}</span>
          </p>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6">${rodape}</p>
        </td>
      </tr>
      <tr>
        <td style="background:${BEGE};padding:14px 24px">
          <p style="margin:0;color:#6b7280;font-size:11px;line-height:1.5">
            Este e-mail foi enviado automaticamente pelo sistema Aurum Cozinha. Não responda a
            esta mensagem — para falar com a gente, use o botão <strong>Ajuda</strong> dentro do app.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;

const config = {
  // ⚠️ Assunto sem "!" e sem promessa: e-mail de senha com tom de propaganda é
  // o que os filtros de spam procuram, e o que o leitor desconfia.
  mailer_subjects_recovery: 'Criar uma nova senha — Aurum Cozinha',
  mailer_templates_recovery_content: molde({
    titulo: 'Criar uma nova senha',
    texto: 'Alguém pediu uma nova senha para esta conta. Se foi você, toque no botão abaixo. O link vale por 1 hora.',
    botao: 'Criar nova senha',
    url: '{{ .ConfirmationURL }}',
    // ⚠️ Diz o que fazer se NÃO foi ele. Sem esta linha, quem recebe sem ter
    // pedido fica sem saber se a conta foi invadida.
    rodape: 'Se não foi você que pediu, ignore este e-mail — sua senha atual continua valendo e nada muda.',
  }),

  mailer_subjects_confirmation: 'Confirme seu e-mail — Aurum Cozinha',
  mailer_templates_confirmation_content: molde({
    titulo: 'Confirme seu e-mail',
    texto: 'Falta um toque para o cadastro do seu restaurante ficar pronto. Confirmando, você entra direto no sistema.',
    botao: 'Confirmar e entrar',
    url: '{{ .ConfirmationURL }}',
    rodape: 'Se você não se cadastrou no Aurum Cozinha, pode ignorar este e-mail.',
  }),

  // Existem mesmo sem uso hoje: um dia alguém liga o link mágico ou troca de
  // e-mail, e o modelo em inglês volta pela porta dos fundos.
  mailer_subjects_magic_link: 'Seu link de acesso — Aurum Cozinha',
  mailer_templates_magic_link_content: molde({
    titulo: 'Entrar no sistema',
    texto: 'Use o botão abaixo para entrar sem digitar senha. O link vale por 1 hora e só funciona uma vez.',
    botao: 'Entrar',
    url: '{{ .ConfirmationURL }}',
    rodape: 'Se não foi você que pediu, ignore este e-mail.',
  }),

  mailer_subjects_email_change: 'Confirme o novo e-mail — Aurum Cozinha',
  mailer_templates_email_change_content: molde({
    titulo: 'Confirme o novo e-mail',
    texto: 'Pedimos esta confirmação porque o e-mail desta conta foi alterado. Confirme para o novo endereço passar a valer.',
    botao: 'Confirmar novo e-mail',
    url: '{{ .ConfirmationURL }}',
    rodape: 'Se você não pediu esta troca, fale com o suporte Aurum antes de confirmar.',
  }),

  mailer_subjects_invite: 'Convite para o Aurum Cozinha',
  mailer_templates_invite_content: molde({
    titulo: 'Você foi convidado',
    texto: 'Sua conta de acesso ao Aurum Cozinha está pronta. Toque no botão para definir sua senha e entrar.',
    botao: 'Definir senha e entrar',
    url: '{{ .ConfirmationURL }}',
    rodape: 'Se você não esperava este convite, ignore este e-mail.',
  }),
};

console.log(`projeto: ${REF}\n`);
for (const [k, v] of Object.entries(config)) {
  console.log(k.startsWith('mailer_subjects') ? `  ${k}\n    ${v}` : `  ${k}\n    (${v.length} caracteres de HTML)`);
}

if (!process.argv.includes('--aplicar')) {
  console.log('\n(nada foi alterado — rode com --aplicar)\n');
  process.exit(0);
}

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(config),
});
const txt = await r.text();
if (!r.ok) { console.error(`\n❌ FALHOU (${r.status}): ${txt.slice(0, 600)}\n`); process.exit(1); }
const fim = JSON.parse(txt);
console.log('\n✅ aplicado');
console.log('  recuperação :', fim.mailer_subjects_recovery);
console.log('  confirmação :', fim.mailer_subjects_confirmation);
// ⚠️ Confere que o LINK sobreviveu: um modelo salvo sem {{ .ConfirmationURL }}
// manda um e-mail bonito com um botão que não leva a lugar nenhum.
// ⚠️ Só os modelos QUE ESTE SCRIPT ESCREVE. A primeira versão varria todos e
// acusava os de aviso (senha alterada, MFA ligado), que não têm link nenhum por
// natureza — alarme que sempre toca é alarme que ninguém escuta.
const semLink = Object.keys(config)
  .filter(k => k.endsWith('_content'))
  .filter(k => !String(fim[k] || '').includes('ConfirmationURL'));
console.log(semLink.length ? `\n⚠️ SEM O LINK: ${semLink.join(', ')}` : '  link do Supabase presente em todos');
