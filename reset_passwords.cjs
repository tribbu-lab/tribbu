// reset_passwords.cjs
// Resetea contraseña de todos los usuarios excepto admin y super
// Ejecutar: node reset_passwords.cjs

const https  = require('https');
const bcrypt = require('bcryptjs');

const SUPABASE_URL = 'https://gctymjhblvocvaenmdhr.supabase.co';
// Nunca hardcodear la key acá — pasarla por variable de entorno al ejecutar:
//   SUPABASE_SERVICE_ROLE_KEY=tu_key node reset_passwords.cjs
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'PEGAR_SERVICE_ROLE_KEY_AQUI';
// Misma idea que la key: nunca hardcodear la contraseña temporal acá.
//   NUEVA_PASS=... SUPABASE_SERVICE_ROLE_KEY=... node reset_passwords.cjs
const NUEVA_PASS   = process.env.NUEVA_PASS || 'PEGAR_PASSWORD_TEMPORAL_AQUI';
const EXCLUIR      = ['admin@mail.com', 'super@mail.com'];

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
  if(NUEVA_PASS === 'PEGAR_PASSWORD_TEMPORAL_AQUI') { console.error('ERROR: definí NUEVA_PASS'); process.exit(1); }

  const { data: usuarios } = await request('GET', '/rest/v1/usuarios?select=id,email,auth_id&activo=eq.true');
  const hash = await bcrypt.hash(NUEVA_PASS, 10);
  let ok = 0, skip = 0;

  for(const u of usuarios) {
    if(EXCLUIR.includes(u.email)) { console.log(`  SKIP ${u.email} (excluido)`); skip++; continue; }
    if(!u.auth_id) { console.log(`  SKIP ${u.email} (sin auth_id)`); skip++; continue; }

    // Actualizar en Supabase Auth
    await request('PATCH', `/auth/v1/admin/users/${u.auth_id}`, { password: NUEVA_PASS });
    // Actualizar hash en nuestra tabla
    await request('PATCH', `/rest/v1/usuarios?id=eq.${u.id}`, { pass: hash });
    console.log(`  OK   ${u.email}`);
    ok++;
  }
  console.log(`\nResultado: ${ok} actualizados, ${skip} saltados`);
  console.log(`Contraseña temporal: ${NUEVA_PASS}`);
}

main();
