import { createClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from './lib/runtimeConfig';

const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

if(!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase (URL / anon key). Llamá a setRuntimeConfig(...) antes de importar este módulo.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
