// Crea en Auth los 6 usuarios restantes y guarda auth_id
const https  = require('https');
const SUPABASE_URL = 'https://gctymjhblvocvaenmdhr.supabase.co';
// Nunca hardcodear la key acá — pasarla por variable de entorno al ejecutar:
//   SUPABASE_SERVICE_ROLE_KEY=tu_key node migrate_remaining.cjs
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'PEGAR_SERVICE_ROLE_KEY_AQUI';
const NUEVA_PASS   = 'Tribbu2026!';

const USUARIOS = [
  'martin@mail.com',
  'romi@mail.com',
  'lucmotta@mail.com',
  'martina@mail.com',
  'mili@mail.com',
  'nico@mail.com',
];

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(path, SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json', 'Accept': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, data: raw }); } });
    });
    req.on('error', reject);
    if(data) req.write(data);
    req.end();
  });
}

async function main() {
  if(SUPABASE_KEY === 'PEGAR_SERVICE_ROLE_KEY_AQUI') { console.error('ERROR: pega tu service_role key'); process.exit(1); }

  // Traer IDs de nuestra tabla
  const { data: usuarios } = await request('GET', '/rest/v1/usuarios?select=id,email&activo=eq.true');

  for(const email of USUARIOS) {
    const u = usuarios.find(x => x.email === email);
    if(!u) { console.log(`  SKIP ${email} (no existe en tabla)`); continue; }

    // Crear en Supabase Auth
    const { status, data: authData } = await request('POST', '/auth/v1/admin/users', {
      email, password: NUEVA_PASS, email_confirm: true
    });

    let authId = null;
    if(status === 200 || status === 201) {
      authId = authData.id;
      console.log(`  OK   ${email} → ${authId}`);
    } else if(authData?.msg?.includes('already') || authData?.code === 'email_exists') {
      // Ya existe — obtener el auth_id buscando por email
      const { data: existing } = await request('GET', `/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
      authId = existing?.users?.[0]?.id;
      console.log(`  EXISTE ${email} → ${authId}`);
    } else {
      console.log(`  ERR  ${email}: ${JSON.stringify(authData)}`);
      continue;
    }

    if(authId) {
      // Guardar auth_id en nuestra tabla
      const res = await request('PATCH', `/rest/v1/usuarios?id=eq.${u.id}`, { auth_id: authId });
      console.log(`    → auth_id guardado (status ${res.status})`);
    }
  }
  console.log('\nListo. Volvé a ejecutar reset_passwords.cjs');
}

main();
