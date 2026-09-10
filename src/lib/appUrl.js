// URL del SPA en producción. Un solo lugar: la usan el link del mail de reseteo
// de contraseña (web y mobile — RN no tiene window.location) y cualquier
// redirect que deba caer en un origin conocido en vez del actual.
//
// Debe estar en la allow-list de Supabase (Authentication → URL Configuration →
// Redirect URLs): `https://www.tribbu.ar/app` y `https://www.tribbu.ar/app/**`,
// y como Site URL. Sin eso, Supabase ignora el `redirectTo` y cae al Site URL
// viejo (era `http://localhost:3000` → link muerto).
//
// Puro / cross-platform: solo un string, sin APIs de browser. Se consume desde
// mobile como `@shared/appUrl`.
export const WEB_APP_URL = "https://www.tribbu.ar/app";
