// Contexto de sesión — equivalente RN del bootstrap + modelo "Mi acceso" que
// vive en src/App.jsx de la web.
//
// Carga la sesión de Supabase (persistida en AsyncStorage), arma el `usuario`,
// deriva `items` = hijos del usuario + cursos donde es Room Parent, y expone el
// `cursoIdx` activo con su `rolEfectivo` ("padre" | "room"). El Super Admin
// (usuario.rol === "super") se maneja como flujo aparte en la navegación.

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase, crearClienteTemporal } from "../lib/supabase";
import { getHijoColor, setHijoColor } from "@shared/helpers";
import { HIJO_COLOR_DEFAULT } from "@shared/theme";
import { SELECT_USUARIO_SESION, armarUsuario, itemsDeDocente } from "@shared/sesion";
import { etiquetaDeCuenta, otrasCuentas, rolAdmiteMulticuenta } from "@shared/cuentas";
import { registerForPush, savePushToken, borrarPushToken } from "../push/register";
import { leerCuentas, guardarCuenta, quitarCuenta } from "../lib/cuentasGuardadas";

const SessionContext = createContext(null);


export function SessionProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [cursoIdx, setCursoIdx] = useState(0);
  const [colegiosPorId, setColegiosPorId] = useState({});
  const [hijoColorsVer, setHijoColorsVer] = useState(0); // fuerza recálculo al cambiar color
  // Foto de perfil cambiada en esta sesión (undefined = la del usuario cargado).
  // Aparte de `usuario`: actualizarlo recargaría "Mi acceso" y volvería al primer hijo.
  const [fotoLocal, setFotoLocal] = useState(undefined);
  // Perfil multicuenta (specs/perfil-multicuenta.md).
  const [cuentas, setCuentas] = useState([]);
  const [authId, setAuthId] = useState(null);
  const [cambiandoCuenta, setCambiandoCuenta] = useState(false);
  const pushTokenRef = useRef(null);
  // Mientras se cambia de cuenta, la carga la hace pasarASesion (no el evento).
  const cambiandoRef = useRef(false);

  const cargarUsuario = useCallback(async (authUser) => {
    const { data } = await supabase
      .from("usuarios")
      // Trae también los hijos con su curso: "Mi acceso" se arma sin otro viaje.
      .select(SELECT_USUARIO_SESION)
      .eq("auth_id", authUser.id)
      .eq("activo", true)
      .single();
    if (data) setUsuario(armarUsuario(data));
    else setUsuario(null);
  }, []);

  // Bootstrap + suscripción a cambios de auth.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await cargarUsuario(session.user);
      if (mounted) {
        setAuthId(session?.user?.id ?? null);
        setAuthLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthId(session?.user?.id ?? null);
      // Los tokens rotan: la cuenta guardada siempre tiene que tener los últimos.
      if (session?.user && session.refresh_token) {
        guardarCuenta({ auth_id: session.user.id, access_token: session.access_token, refresh_token: session.refresh_token }).then(setCuentas);
      }
      if (cambiandoRef.current) return;
      // INITIAL_SESSION ya lo resolvió getSession() de arriba, y TOKEN_REFRESHED
      // (cada hora) no cambia quién es el usuario: recargarlo en esos dos
      // casos repetía el usuario y "Mi acceso" enteros en cada arranque.
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      if (session?.user) cargarUsuario(session.user);
      else setUsuario(null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [cargarUsuario]);

  // Cargar "items" (hijos + cursos admin) cuando hay usuario no-super.
  // super y colegio_admin no tienen "Mi acceso" — van directo a su panel.
  useEffect(() => {
    if (!usuario || ["super", "colegio_admin", "nivel_admin"].includes(usuario.rol)) {
      setItems([]);
      return;
    }
    let cancel = false;
    (async () => {
      // Docente: "Mi acceso" = sus cursos (de sus clases, ya en la sesión).
      if (usuario.rol === "docente") {
        setItems(itemsDeDocente(usuario.cursosDocente));
        setCursoIdx(0);
        const ids = [...new Set((usuario.cursosDocente || []).map((c) => c.colegio_id).filter(Boolean))];
        if (ids.length) {
          const { data: cols } = await supabase.from("colegios").select("id,nombre,logo_url,color_primario").in("id", ids);
          if (!cancel) setColegiosPorId(Object.fromEntries((cols || []).map((c) => [c.id, c])));
        }
        return;
      }
      // Hijos y cursos de Room Parent ya vienen con el usuario
      // (SELECT_USUARIO_SESION): sin otro viaje a usuario_hijos/usuario_cursos.
      const cursosAdmin = new Set((usuario.cursosConRol || []).filter((r) => r.rol === "room").map((r) => r.curso_id));
      const next = (usuario.usuario_hijos || [])
        .map((r) => r.hijos)
        .filter(Boolean)
        .map((h) => ({
          ...h,
          _tipo: "hijo",
          rolEfectivo: cursosAdmin.has(h.curso_id) ? "room" : "padre",
        }));
      // Con hijos en más de un curso, "Todos" es un acceso más (el primero y el
      // default): la vista unificada domina todas las pantallas vía cursoIds.
      const cursosDistintos = new Set(next.map((h) => h.curso_id).filter(Boolean));
      setItems(cursosDistintos.size > 1 ? [{ _tipo: "todos", id: "__todos__", nombre: "Todos" }, ...next] : next);
      setCursoIdx(0);

      // Logo del colegio para el header (ver App.jsx de la web, mismo patrón) —
      // un query chico, solo los colegios realmente en juego.
      const colegioIds = [...new Set(next.map((h) => h.cursos?.colegio_id).filter(Boolean))];
      if (colegioIds.length) {
        const { data: cols } = await supabase.from("colegios").select("id,nombre,logo_url,color_primario").in("id", colegioIds);
        if (!cancel) setColegiosPorId(Object.fromEntries((cols || []).map((c) => [c.id, c])));
      } else if (!cancel) {
        setColegiosPorId({});
      }
    })();
    return () => {
      cancel = true;
    };
  }, [usuario]);

  // Registrar el push token de Expo cuando hay usuario logueado.
  useEffect(() => {
    if (!usuario?.id) return;
    let cancel = false;
    (async () => {
      const token = await registerForPush();
      if (cancel || !token) return;
      pushTokenRef.current = token;
      const guardadas = await leerCuentas();
      const mantener = guardadas.map((c) => c.usuario_id).filter((id) => id && id !== usuario.id);
      if (!cancel) await savePushToken(token, mantener);
    })();
    return () => {
      cancel = true;
    };
  }, [usuario?.id]);

  // Mantiene al día los datos de la cuenta abierta en la lista del celular. Las
  // cuentas del panel del colegio no entran en el selector.
  useEffect(() => {
    if (!usuario?.id || !authId) return undefined;
    if (!rolAdmiteMulticuenta(usuario.rol)) {
      quitarCuenta(authId).then(setCuentas);
      return undefined;
    }
    let cancel = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancel || session?.user?.id !== authId) return;
      const hijos = (items || []).filter((i) => i._tipo === "hijo").map((i) => i.nombre);
      guardarCuenta({
        auth_id: authId,
        usuario_id: usuario.id,
        email: usuario.email,
        nombre: [usuario.nombre, usuario.apellido].filter(Boolean).join(" "),
        etiqueta: etiquetaDeCuenta(Object.values(colegiosPorId).map((c) => c.nombre), hijos),
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).then(setCuentas);
    });
    return () => {
      cancel = true;
    };
  }, [usuario, authId, items, colegiosPorId]);

  // Valida los tokens guardados sin tocar la sesión abierta. Devuelve
  // { session } o { error, vencida }.
  const validarCuenta = useCallback(async (cuenta) => {
    const temporal = crearClienteTemporal();
    const { data, error } = await temporal.auth.setSession({ access_token: cuenta.access_token, refresh_token: cuenta.refresh_token });
    if (error || !data?.session) return { error: error?.message || "sin sesión", vencida: true };
    const { data: fila } = await temporal.from("usuarios").select("id,activo").eq("auth_id", data.session.user.id).maybeSingle();
    if (!fila?.activo) return { error: "Esa cuenta ya no está activa." };
    return { session: data.session };
  }, []);

  // Deja abierta la sesión ya validada y carga su usuario.
  const pasarASesion = useCallback(async (session) => {
    cambiandoRef.current = true;
    setCambiandoCuenta(true);
    try {
      const { data, error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      if (error || !data?.user) throw error || new Error("No se pudo abrir la cuenta");
      setFotoLocal(undefined);
      setAuthId(data.user.id);
      await cargarUsuario(data.user);
    } finally {
      cambiandoRef.current = false;
      setCambiandoCuenta(false);
    }
  }, [cargarUsuario]);

  /** Pasa a otra cuenta guardada. { ok } o { error, vencida } (vencida = hay que poner la contraseña). */
  const cambiarCuenta = useCallback(async (destinoAuthId) => {
    const cuenta = (await leerCuentas()).find((c) => c.auth_id === destinoAuthId);
    if (!cuenta) return { error: "Esa cuenta ya no está en este celular." };
    const res = await validarCuenta(cuenta);
    if (res.error) return res;
    try {
      await guardarCuenta({ auth_id: destinoAuthId, access_token: res.session.access_token, refresh_token: res.session.refresh_token });
      await pasarASesion(res.session);
      return { ok: true };
    } catch (e) {
      return { error: e?.message || "No se pudo abrir la cuenta" };
    }
  }, [validarCuenta, pasarASesion]);

  /** Agrega una cuenta con mail y contraseña (la contraseña no se guarda) y pasa a ella. */
  const agregarCuenta = useCallback(async (email, password) => {
    const temporal = crearClienteTemporal();
    const { data, error } = await temporal.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return { error: /invalid login/i.test(error.message) ? "Correo o contraseña incorrectos" : `No se pudo conectar: ${error.message}` };
    if (data.user.id === authId) return { error: "Ya estás usando esa cuenta." };
    const { data: fila } = await temporal.from("usuarios").select("id,nombre,apellido,email,rol,activo").eq("auth_id", data.user.id).maybeSingle();
    if (!fila?.activo) return { error: "Esa cuenta no está activa. Consultá con el colegio." };
    if (!rolAdmiteMulticuenta(fila.rol)) return { error: "Esa cuenta es del panel del colegio: entrá con ella cerrando esta sesión." };
    try {
      await guardarCuenta({
        auth_id: data.user.id,
        usuario_id: fila.id,
        email: fila.email,
        nombre: [fila.nombre, fila.apellido].filter(Boolean).join(" "),
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      await pasarASesion(data.session);
      return { ok: true };
    } catch (e) {
      return { error: e?.message || "No se pudo abrir la cuenta" };
    }
  }, [authId, pasarASesion]);

  // Corta en el servidor la sesión guardada de una cuenta. Si ya venció no hay
  // nada que cortar.
  const revocarCuenta = useCallback(async (cuenta) => {
    try {
      const temporal = crearClienteTemporal();
      const { error } = await temporal.auth.setSession({ access_token: cuenta.access_token, refresh_token: cuenta.refresh_token });
      if (!error) await temporal.auth.signOut({ scope: "local" });
    } catch {
      // sin conexión o sesión vencida: igual se saca del celular
    }
  }, []);

  /** Saca del celular una cuenta que no es la abierta: deja de recibir sus avisos acá. */
  const quitarOtraCuenta = useCallback(async (destinoAuthId) => {
    const cuenta = (await leerCuentas()).find((c) => c.auth_id === destinoAuthId);
    const lista = await quitarCuenta(destinoAuthId);
    setCuentas(lista);
    if (pushTokenRef.current) {
      await savePushToken(pushTokenRef.current, otrasCuentas(lista, authId).map((c) => c.usuario_id).filter(Boolean));
    }
    if (cuenta) await revocarCuenta(cuenta);
  }, [authId, revocarCuenta]);

  const logout = useCallback(async () => {
    // Con la sesión todavía abierta: después la RLS ya no lo deja borrar.
    try {
      await borrarPushToken(pushTokenRef.current);
    } catch {
      // sin conexión: registrar_push_token lo limpia en el próximo inicio de sesión
    }
    pushTokenRef.current = null;
    const { data: { session } } = await supabase.auth.getSession();
    const actual = session?.user?.id;
    const lista = actual ? await quitarCuenta(actual) : await leerCuentas();
    setCuentas(lista);
    // Si quedan otras cuentas, pasa a la siguiente que siga válida.
    for (const cuenta of lista) {
      const res = await validarCuenta(cuenta);
      if (res.error) continue;
      if (session) await revocarCuenta({ access_token: session.access_token, refresh_token: session.refresh_token });
      try {
        await pasarASesion(res.session);
        return;
      } catch {
        break;
      }
    }
    await supabase.auth.signOut();
    setUsuario(null);
    setFotoLocal(undefined);
    setItems([]);
    setCursoIdx(0);
  }, [validarCuenta, revocarCuenta, pasarASesion]);

  const setColorHijo = useCallback(
    (item, color) => {
      if (!item || !usuario?.id) return;
      if (color === null) {
        // restablecer = guardar el default (el shim no expone delete por clave aquí)
        setHijoColor(usuario.id, item.id, HIJO_COLOR_DEFAULT);
      } else {
        setHijoColor(usuario.id, item.id, color);
      }
      setHijoColorsVer((v) => v + 1);
    },
    [usuario?.id]
  );

  const colorDeItem = useCallback(
    (item) => {
      if (!item || item._tipo !== "hijo") return "#3B82F6";
      const saved = getHijoColor(usuario?.id, item.id);
      return saved && saved !== HIJO_COLOR_DEFAULT ? saved : item.color || "#3B82F6";
      // hijoColorsVer en deps fuerza recálculo tras setColorHijo
    },
    [usuario?.id, hijoColorsVer] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Solo el color personalizado (null si no eligió uno): tiñe el header,
  // igual que headerBg en la web (src/App.jsx).
  const colorCustomDeItem = useCallback(
    (item) => {
      if (!item || item._tipo !== "hijo") return null;
      const saved = getHijoColor(usuario?.id, item.id);
      return saved && saved !== HIJO_COLOR_DEFAULT ? saved : null;
    },
    [usuario?.id, hijoColorsVer] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Cursos distintos donde el usuario tiene hijos (excluye el pseudo-item "Todos").
  const cursosHijos = useMemo(
    () => [...new Set(items.filter((i) => i._tipo === "hijo" || i._tipo === "curso").map((i) => i.curso_id).filter(Boolean))],
    [items]
  );

  const esVistaTodos = items[cursoIdx]?._tipo === "todos";

  // Tag por curso para la vista "Todos": primer nombre de cada hijo del curso +
  // su color de identidad (el mismo dot del selector del header).
  const tagPorCurso = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (it._tipo === "curso") { m.set(it.curso_id, { nombre: it.nombre?.split(" - ")[0]?.trim() || it.nombre, color: colorDeItem(it) }); continue; }
      if (it._tipo !== "hijo" || !it.curso_id) continue;
      const nombre = it.nombre?.split(" ")[0] || "";
      const prev = m.get(it.curso_id);
      if (prev) prev.nombre = `${prev.nombre}, ${nombre}`;
      else m.set(it.curso_id, { nombre, color: colorDeItem(it) });
    }
    return m;
  }, [items, colorDeItem]);

  // {nombre, color} del curso dado, SOLO en vista "Todos" (en vista por hijo
  // devuelve null, así las pantallas lo llaman incondicionalmente).
  const tagDeCurso = useCallback(
    (cid) => (esVistaTodos && cid ? tagPorCurso.get(cid) || null : null),
    [esVistaTodos, tagPorCurso]
  );

  // cursoIds y misHijos estables: si se armaban dentro de `value`, cada cambio
  // de la sesión (por ejemplo, cuando llega el logo del colegio) los volvía
  // listas nuevas y relanzaba la carga de todas las pantallas que dependen de
  // ellos (el Inicio cargaba dos veces al abrir la app).
  const cursoIdActual = esVistaTodos ? null : items[cursoIdx]?.curso_id ?? null;
  const cursoIds = useMemo(
    () => (esVistaTodos ? cursosHijos : cursoIdActual ? [cursoIdActual] : []),
    [esVistaTodos, cursosHijos, cursoIdActual]
  );
  const misHijos = useMemo(() => items.filter((i) => i._tipo === "hijo").map((i) => i.id), [items]);

  const value = useMemo(() => {
    const itemActual = items[cursoIdx] || null;
    // En "Todos" no hay curso único: sin rol admin (las acciones por curso
    // requieren elegir un hijo) y cursoId null; las lecturas van por cursoIds.
    const esDocente = usuario?.rol === "docente";
    const rolEfectivo = esVistaTodos ? (esDocente ? "docente" : "padre") : itemActual?.rolEfectivo || "padre";
    const cursoId = esVistaTodos ? null : itemActual?.curso_id ?? null;
    // Igual criterio que colegioActivo en src/App.jsx (web): solo con un
    // colegio inequívoco (no en Todos, ni sin logo cargado).
    const colegioActivo = !esVistaTodos ? colegiosPorId[itemActual?.cursos?.colegio_id] : null;
    return {
      usuario,
      authLoading,
      isSuper: usuario?.rol === "super",
      // colegio_admin: mismo panel de administración que super pero acotado a
      // su colegio_id por RLS. NO es isSuper (no activa lógica de plataforma).
      // La Secretaría (nivel_admin, specs/roles-por-nivel.md) usa el mismo panel:
      // cuenta como esColegioAdmin y RLS la acota a los cursos de sus niveles.
      esColegioAdmin: usuario?.rol === "colegio_admin" || usuario?.rol === "nivel_admin",
      esSecretaria: usuario?.rol === "nivel_admin",
      // Docente (specs/docentes-clases-y-grupos.md): sus cursos en "Mi acceso",
      // publica en ellos; cursosDocente = ids donde puede publicar.
      esDocente,
      cursosDocente: esDocente ? (usuario?.cursosDocente || []).map((c) => c.id) : [],
      items,
      cursoIdx,
      setCursoIdx,
      itemActual,
      cursoId,
      cursoIds,
      esVistaTodos,
      cursoNombre: esVistaTodos ? "Todos mis hijos" : itemActual?.cursos?.nombre ?? null,
      colegioActivo,
      rolEfectivo,
      isAdmin: rolEfectivo === "room",
      esPadre: rolEfectivo === "padre",
      hijoActivoId: itemActual?._tipo === "hijo" ? itemActual.id : null,
      misHijos,
      cursosHijos,
      tagDeCurso,
      colorDeItem,
      colorCustomDeItem,
      setColorHijo,
      logout,
      authId,
      cuentas,
      cambiandoCuenta,
      cambiarCuenta,
      agregarCuenta,
      quitarOtraCuenta,
      fotoPerfil: fotoLocal !== undefined ? fotoLocal : usuario?.foto_url || null,
      setFotoPerfil: setFotoLocal,
      reloadUsuario: () =>
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) cargarUsuario(session.user);
        }),
    };
  }, [usuario, authLoading, items, cursoIdx, cursoIds, misHijos, cursosHijos, esVistaTodos, colegiosPorId, tagDeCurso, colorDeItem, colorCustomDeItem, setColorHijo, logout, cargarUsuario, fotoLocal, authId, cuentas, cambiandoCuenta, cambiarCuenta, agregarCuenta, quitarOtraCuenta]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
