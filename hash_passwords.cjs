// hash_passwords.cjs — hashea todas las contraseñas existentes
// Ejecutar UNA SOLA VEZ con: node hash_passwords.cjs
const https    = require('https');
const bcrypt   = require('bcryptjs');

const SUPABASE_URL = 'https://gctymjhblvocvaenmdhr.supabase.co';
// Nunca hardcodear la key acá — pasarla por variable de entorno al ejecutar:
//   SUPABASE_SERVICE_ROLE_KEY=tu_key node hash_passwords.cjs
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'PEGAR_SERVICE_ROLE_KEY_AQUI';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if(data) req.write(data);
    req.end();
  });
}

async function main() {
  if(SUPABASE_KEY === 'PEGAR_SERVICE_ROLE_KEY_AQUI') {
    console.error('ERROR: pega tu service_role key antes de ejecutar');
    process.exit(1);
  }

  // Traer todos los usuarios
  const { data: usuarios } = await request('GET', '/rest/v1/usuarios?select=id,email,pass');
  console.log(`Encontrados ${usuarios.length} usuarios\n`);

  let ok = 0, skip = 0, err = 0;

  for(const u of usuarios) {
    // Si ya está hasheado (empieza con $2b$) lo saltea
    if(u.pass && u.pass.startsWith('$2b$')) {
      console.log(`  SKIP ${u.email} (ya hasheado)`);
      skip++;
      continue;
    }
    if(!u.pass) {
      console.log(`  SKIP ${u.email} (sin contraseña)`);
      skip++;
      continue;
    }
    try {
      const hash = await bcrypt.hash(u.pass, 10);
      const res = await request('PATCH', `/rest/v1/usuarios?id=eq.${u.id}`,{ pass: hash });
      if(res.status >= 200 && res.status < 300) {
        console.log(`  OK   ${u.email}`);
        ok++;
      } else {
        console.log(`  ERR  ${u.email}: status ${res.status}`);
        err++;
      }
    } catch(e) {
      console.log(`  ERR  ${u.email}: ${e.message}`);
      err++;
    }
  }

  console.log(`\nResultado: ${ok} hasheados, ${skip} saltados, ${err} errores`);
}

main();
