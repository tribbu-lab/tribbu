// Config de runtime inyectada por cada plataforma.
//
// `lib/` ya NO lee `import.meta.env` directamente: la web (Vite) y el mobile
// (Expo) llaman a `setRuntimeConfig(...)` en el arranque con sus propias fuentes
// de entorno. Así los módulos compartidos (supabase, push, authAdmin) son
// agnósticos de plataforma y se pueden consumir desde ambos proyectos.

let _cfg = {
  supabaseUrl: null,
  supabaseAnonKey: null,
};

export const setRuntimeConfig = (cfg) => {
  _cfg = { ..._cfg, ...cfg };
};

export const getRuntimeConfig = () => _cfg;
