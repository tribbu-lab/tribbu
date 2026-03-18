// migrate_to_auth.cjs
// Crea los usuarios existentes en Supabase Auth y linkea con tabla usuarios
// Ejecutar UNA SOLA VEZ: node migrate_to_auth.cjs

const https  = require('https');
const bcrypt = require('bcryptjs');

const SUPABASE_URL = 'https://gctymjhblvocvaenmdhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjdHltamhibHZvY3ZhZW5tZGhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE1MDQ4MSwiZXhwIjoyMDg4NzI2NDgxfQ.1zMREgpJ9jgD-WjtpaqL9tV-1qz0Wjb33NqlTZByvfg';

// Contraseñas originales — completar antes de ejecutar
// (las necesitamos porque bcrypt no es reversible)
const PASSWORDS = {
  'yanina@mail.com':  'yan1234',
  'luciana@mail.com': 'luc122',
  'dam@mail.com':     'dam1234',
  'diego@mail.com':   'admin',
  'admin@mail.com':   'super',
  'super@mail.com':   'super',
  'martin@mail.com':  'Tribbu2026!',
  'romi@mail.com':    'Tribbu2026!',
  'lucmotta@mail.com':'Tribbu2026!',
  'martina@mail.com': 'Tribbu2026!',
  'mili@mail.com':    'Tribbu2026!',
  'nico@mail.com':    'Tribbu2026!',
};

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'apikey':          SUPABASE_KEY,
        'Authorization':   'Bearer ' + SUPABASE_KEY,
        'Content-Type':    'application/json',
        'Accept':          'application/json',
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
    console.error('ERROR: pega tu service_role key'); process.exit(1);
  }

  // 1. Traer usuarios de nuestra tabla
  const { data: usuarios } = await request('GET', '/rest/v1/usuarios?select=id,email,nombre,apellido,activo');
  console.log(`Encontrados ${usuarios.length} usuarios\n`);

  const resultados = [];

  for(const u of usuarios) {
    const pass = PASSWORDS[u.email];
    if(!pass) {
      console.log(`  SKIP ${u.email} (sin contraseña en el mapa)`);
      continue;
    }

    // 2. Crear en Supabase Auth
    const { status, data: authData } = await request('POST', '/auth/v1/admin/users', {
      email:          u.email,
      password:       pass,
      email_confirm:  true,
      user_metadata:  { nombre: u.nombre, apellido: u.apellido },
    });

    if(status === 200 || status === 201) {
      const authId = authData.id;
      console.log(`  OK   ${u.email} → auth_id: ${authId}`);

      // 3. Guardar auth_id en nuestra tabla usuarios
      await request('PATCH', `/rest/v1/usuarios?id=eq.${u.id}`, { auth_id: authId });
      resultados.push({ email: u.email, tribbu_id: u.id, auth_id: authId });

    } else if(status === 422 && authData?.msg?.includes('already')) {
      console.log(`  SKIP ${u.email} (ya existe en Auth)`);
    } else {
      console.log(`  ERR  ${u.email}: ${JSON.stringify(authData)}`);
    }
  }

  console.log(`\nMigración completada: ${resultados.length} usuarios creados en Auth`);
  console.log('\nResumen:');
  resultados.forEach(r => console.log(`  ${r.email}: ${r.auth_id}`));
}

main();
