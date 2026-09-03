// Simula o cenário que o dono teme: cliente que parou de pagar e continua usando.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const EMAIL='caloteiro.teste@example.invalid', SENHA='TesteCalote2026!';
const anon=createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const admin=createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

// limpa
const { data: l } = await admin.auth.admin.listUsers();
for (const u of l.users.filter(u=>u.email===EMAIL)) {
  const { data:p } = await admin.from('perfis').select('restaurante_id').eq('id',u.id).maybeSingle();
  if (p?.restaurante_id) { await admin.from('documentos_historico').delete().eq('restaurante_id',p.restaurante_id);
    await admin.from('feedback').delete().eq('restaurante_id',p.restaurante_id);
    await admin.from('restaurantes').delete().eq('id',p.restaurante_id); }
  await admin.auth.admin.deleteUser(u.id);
}
const { data:novo } = await anon.auth.signUp({ email:EMAIL, password:SENHA });
await admin.auth.admin.updateUserById(novo.user.id,{email_confirm:true});
await anon.auth.signInWithPassword({email:EMAIL,password:SENHA});
await anon.rpc('criar_restaurante',{p_nome_restaurante:'Caloteiro Teste',p_nome_admin:'Teste',p_produto:'etiquetas'});
const { data:perfil } = await anon.from('perfis').select('restaurante_id').eq('id',novo.user.id).single();
const rid = perfil.restaurante_id;

// ENVELHECE a conta: teste vencido há muito tempo, sem assinatura
await admin.from('restaurantes').update({ created_at:'2026-01-01', assinatura_ate:null }).eq('id',rid);

console.log('CENÁRIO: conta criada em 01/01, teste vencido, sem assinatura, sem bloqueio manual.\n');
const { data:pode } = await admin.rpc('restaurante_pode_escrever',{rid});
console.log('1) O banco deixa ESCREVER?', pode ? '❌ SIM' : '✅ NÃO');

// tenta gravar um documento COMO O CLIENTE (é o que o app faz ao salvar item)
const { error: eDoc } = await anon.from('documentos').upsert({ restaurante_id:rid, chave:'produtos', dados:[{id:'x',nome:'Item do caloteiro'}] });
console.log('2) O cliente consegue SALVAR um item?', eDoc ? '✅ NÃO — '+eDoc.message.slice(0,70) : '❌ SIM, salvou');

// tenta LER
const { data: leu, error: eLer } = await anon.from('documentos').select('chave').eq('restaurante_id',rid);
console.log('3) O cliente consegue LER os dados dele?', eLer ? 'não ('+eLer.message.slice(0,40)+')' : 'sim — '+(leu?.length||0)+' documento(s)');

console.log('\nrid para o teste no navegador:', rid);
console.log('login:', EMAIL, '/', SENHA);
