// backup_tribbu.js — ejecutar con: node backup_tribbu.js
const https = require('https');
const fs    = require('fs');

// CONFIGURAR ESTAS DOS VARIABLES
const SUPABASE_URL = 'https://gctymjhblvocvaenmdhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjdHltamhibHZvY3ZhZW5tZGhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE1MDQ4MSwiZXhwIjoyMDg4NzI2NDgxfQ.1zMREgpJ9jgD-WjtpaqL9tV-1qz0Wjb33NqlTZByvfg';

const TABLES = [
  'usuarios','cursos','hijos','maestros','maestro_cursos',
  'usuario_hijos','usuario_cursos','cumples','eventos',
  'evento_asistencia','recordatorios','recordatorio_leidos',
  'colectas','colecta_pagos','menu','utiles','util_adquirido',
  'libros','libro_adquirido','uniformes','uniforme_items',
  'uniforme_cursos','uniforme_adquirido','horarios',
  'colegio','contactos','alertas'
];

function get(table) {
  return new Promise((resolve, reject) => {
    const url = new URL('/rest/v1/' + table + '?select=*', SUPABASE_URL);
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'GET',
      headers:  {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Accept':        'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: [] }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  if(SUPABASE_KEY === 'PEGAR_SERVICE_ROLE_KEY_AQUI') {
    console.error('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjdHltamhibHZvY3ZhZW5tZGhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE1MDQ4MSwiZXhwIjoyMDg4NzI2NDgxfQ.1zMREgpJ9jgD-WjtpaqL9tV-1qz0Wjb33NqlTZByvfg');
    process.exit(1);
  }
  console.log('Iniciando backup...\n');
  const backup = { timestamp: new Date().toISOString(), tables: {} };
  for(const table of TABLES) {
    try {
      const { status, data } = await get(table);
      if(status === 200) {
        backup.tables[table] = data;
        console.log('  OK  ' + table + ': ' + data.length + ' filas');
      } else {
        backup.tables[table] = [];
        console.log('  --  ' + table + ': status ' + status);
      }
    } catch(e) {
      backup.tables[table] = [];
      console.log('  ERR ' + table + ': ' + e.message);
    }
  }
  const filename = 'tribbu_backup_' + new Date().toISOString().slice(0,10) + '.json';
  fs.writeFileSync(filename, JSON.stringify(backup, null, 2));
  console.log('\nBackup guardado: ' + filename);
  console.log('Tamano: ' + (fs.statSync(filename).size / 1024).toFixed(1) + ' KB');
}

main();
