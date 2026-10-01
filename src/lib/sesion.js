// Consulta y armado del usuario de la sesión, compartidos por el login web
// (features/auth), la sesión restaurada (App.jsx) y mobile (context/Session,
// vía @shared/sesion). Puro: sin supabase.
//
// Trae en el mismo viaje los hijos con su curso (para "Mi acceso"): antes
// App.jsx los pedía después con otra consulta a usuario_hijos, una espera más
// (~400 ms a us-east-1) en cada ingreso.

export const SELECT_USUARIO_SESION =
  "*, usuario_hijos(hijo_id, hijos(*, cursos(nombre,color,avatar,colegio_id))), usuario_cursos(curso_id, rol)";

export const armarUsuario = (data) => ({
  ...data,
  hijos:  [...new Set((data.usuario_hijos||[]).map(r=>r.hijo_id))],
  cursos: (data.usuario_cursos||[]).map(r=>r.curso_id),
  cursosConRol: (data.usuario_cursos||[]).map(r=>({curso_id:r.curso_id, rol:r.rol||"padre"})),
});
