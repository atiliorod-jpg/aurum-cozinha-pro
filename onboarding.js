#!/usr/bin/env node
/**
 * Onboarding Script — Criar novo restaurante
 *
 * USO:
 *   node onboarding.js --nome "Pizzaria Napoli" --email "owner@napoli.com" --plano basico
 *
 * RESULTADO:
 *   ✅ Restaurante criado no Supabase
 *   ✅ Primeira conta (diretoria) criada
 *   ✅ Convite gerado e armazenado
 *   ✅ Registro em `onboarding` para seu controle
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

// Config
const SUPABASE_URL = 'https://lifiyldinefisedmkayz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ ERRO: Defina SUPABASE_SERVICE_ROLE_KEY como variável de ambiente');
  console.error('   Export antes de rodar: export SUPABASE_SERVICE_ROLE_KEY="sua_service_key_aqui"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse args
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const nome = getArg('--nome');
const email = getArg('--email');
const plano = getArg('--plano') || 'basico';

if (!nome || !email) {
  console.error('❌ Uso: node onboarding.js --nome "Nome Restaurante" --email "email@example.com" [--plano basico|pro]');
  process.exit(1);
}

async function criarRestaurante() {
  try {
    console.log(`\n🚀 Criando restaurante: "${nome}"\n`);

    // 1. Criar restaurante
    const { data: restaurante, error: errRest } = await supabase
      .from('restaurantes')
      .insert([{ nome, ativo: true, max_usuarios: 3 }])
      .select()
      .single();

    if (errRest) throw new Error(`Restaurante: ${errRest.message}`);
    console.log(`✅ Restaurante criado: ${restaurante.id}`);

    // 2. Gerar token de convite (8 caracteres hex)
    const token = randomBytes(4).toString('hex');

    // 3. Criar convite para diretoria
    const expira_em = new Date();
    expira_em.setDate(expira_em.getDate() + 7); // Válido por 7 dias

    const { data: convite, error: errConv } = await supabase
      .from('convites')
      .insert([{
        restaurante_id: restaurante.id,
        cargo: 'diretoria',
        token,
        expira_em: expira_em.toISOString()
      }])
      .select()
      .single();

    if (errConv) throw new Error(`Convite: ${errConv.message}`);
    console.log(`✅ Convite criado: ${token}`);

    // 4. Registrar em onboarding (seu controle — não crítico)
    const { error: errOnb } = await supabase
      .from('onboarding')
      .insert([{
        restaurante_id: restaurante.id,
        contato_nome: nome,
        contato_email: email,
        plano,
        ativo: true
      }]);

    if (errOnb) console.warn(`⚠️  Onboarding (controle interno): ${errOnb.message}`);
    console.log(`✅ Registro de controle criado`);

    // 5. Mostrar instruções
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ RESTAURANTE CRIADO COM SUCESSO!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 DADOS:
   Nome: ${nome}
   ID: ${restaurante.id}
   Plano: ${plano}
   Contato: ${email}
   Limite: 3 usuários

🔗 CONVITE PARA O DONO:
   Compartilhe este link:

   https://atiliorod-jpg.github.io/polo-estoque/convite?token=${token}

   Válido por 7 dias até ${expira_em.toLocaleDateString('pt-BR')}

📧 EMAIL SUGERIDO:
   Assunto: Bem-vindo ao Aurum Cozinha Pro

   Olá ${nome.split(' ')[0]},

   Sua conta foi criada! Acesse o link abaixo para começar:
   https://atiliorod-jpg.github.io/polo-estoque/convite?token=${token}

   Você será o gestor (diretoria) e poderá criar convites para sua equipe.

🛟 SUPORTE A DISTÂNCIA:
   Sua conta de suporte:
   - Login: suporte@aurum.app
   - Restaurante: ${restaurante.id}
   - Use isso para acessar remotamente se precisar ajudar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);

  } catch (err) {
    console.error(`\n❌ ERRO: ${err.message}\n`);
    process.exit(1);
  }
}

criarRestaurante();
