// src/hooks/useCuentas.js — cuentas guardadas en este navegador
// (specs/perfil-multicuenta.md). Solo tokens, en localStorage, donde Supabase
// ya guarda la sesión abierta; la contraseña nunca se guarda.
//
// Al cambiar de cuenta se recarga la página: las pestañas visitadas quedan
// montadas y ocultas (App.jsx), y así ninguna conserva datos de la otra cuenta.

import { useCallback, useEffect, useState } from "react";
import { supabase, crearClienteTemporal } from "../supabase";
import { etiquetaDeCuenta, guardarEnLista, quitarDeLista, rolAdmiteMulticuenta, validarCuenta, iniciarCuenta } from "../lib/cuentas";

const CLAVE = "tribbu_cuentas_guardadas";

const leer = () => {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
};
const escribir = (lista) => {
  try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch { /* sin storage: no se guarda */ }
  return lista;
};

// Volver al inicio de la otra cuenta: el ?tab= de esta puede no existir en ella.
const recargar = () => window.location.assign(window.location.pathname);

async function revocar(cuenta) {
  try {
    const temporal = crearClienteTemporal();
    const { error } = await temporal.auth.setSession({ access_token: cuenta.access_token, refresh_token: cuenta.refresh_token });
    if (!error) await temporal.auth.signOut({ scope: "local" });
  } catch { /* sin conexión o sesión vencida: igual se saca del navegador */ }
}

export function useCuentas(usuario, colegiosPorId, items) {
  const [cuentas, setCuentas] = useState(leer);
  const [authId, setAuthId] = useState(null);

  // Los tokens rotan: la cuenta guardada siempre tiene que tener los últimos.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_evento, session) => {
      setAuthId(session?.user?.id ?? null);
      if (session?.user && session.refresh_token) {
        setCuentas(escribir(guardarEnLista(leer(), { auth_id: session.user.id, access_token: session.access_token, refresh_token: session.refresh_token })));
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Datos de la cuenta abierta. El panel no arma "Mi acceso": su colegio se pide acá.
  const usuarioColegioId = usuario?.colegio_id ?? null;
  const [colegioPropio, setColegioPropio] = useState(null);
  useEffect(() => {
    if (!usuarioColegioId) return undefined;
    let vivo = true;
    supabase.from("colegios").select("nombre").eq("id", usuarioColegioId).maybeSingle().then(({ data }) => {
      if (vivo) setColegioPropio(data?.nombre ?? null);
    });
    return () => { vivo = false; };
  }, [usuarioColegioId]);

  useEffect(() => {
    if (!usuario?.id) return undefined;
    let vivo = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!vivo || !session?.user) return;
      setAuthId(session.user.id);
      if (!rolAdmiteMulticuenta(usuario.rol)) {
        setCuentas(escribir(quitarDeLista(leer(), session.user.id)));
        return;
      }
      const colegios = usuarioColegioId ? [colegioPropio] : Object.values(colegiosPorId || {}).map((c) => c.nombre);
      const hijos = (items || []).filter((i) => i._tipo === "hijo").map((i) => i.nombre);
      setCuentas(escribir(guardarEnLista(leer(), {
        auth_id: session.user.id,
        usuario_id: usuario.id,
        rol: usuario.rol,
        email: usuario.email,
        nombre: [usuario.nombre, usuario.apellido].filter(Boolean).join(" "),
        etiqueta: etiquetaDeCuenta(colegios, hijos, usuario.rol),
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })));
    });
    return () => { vivo = false; };
  }, [usuario, usuarioColegioId, colegioPropio, colegiosPorId, items]);

  const cambiarCuenta = useCallback(async (destino) => {
    const cuenta = leer().find((c) => c.auth_id === destino);
    if (!cuenta) return { error: "Esa cuenta ya no está en este navegador." };
    const res = await validarCuenta(crearClienteTemporal(), cuenta);
    if (res.error) return res;
    const { error } = await supabase.auth.setSession({ access_token: res.session.access_token, refresh_token: res.session.refresh_token });
    if (error) return { error: error.message };
    recargar();
    return { ok: true };
  }, []);

  const agregarCuenta = useCallback(async (email, password) => {
    const res = await iniciarCuenta(crearClienteTemporal(), email, password, authId);
    if (res.error) return res;
    escribir(guardarEnLista(leer(), {
      auth_id: res.session.user.id,
      usuario_id: res.fila.id,
      rol: res.fila.rol,
      email: res.fila.email,
      nombre: [res.fila.nombre, res.fila.apellido].filter(Boolean).join(" "),
      access_token: res.session.access_token,
      refresh_token: res.session.refresh_token,
    }));
    const { error } = await supabase.auth.setSession({ access_token: res.session.access_token, refresh_token: res.session.refresh_token });
    if (error) return { error: error.message };
    recargar();
    return { ok: true };
  }, [authId]);

  const quitarOtraCuenta = useCallback(async (destino) => {
    const cuenta = leer().find((c) => c.auth_id === destino);
    setCuentas(escribir(quitarDeLista(leer(), destino)));
    if (cuenta) await revocar(cuenta);
  }, []);

  /** Sale de la cuenta abierta. Devuelve true si no quedó ninguna (hay que ir al login). */
  const cerrarSesion = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const lista = escribir(session?.user ? quitarDeLista(leer(), session.user.id) : leer());
    setCuentas(lista);
    for (const cuenta of lista) {
      const res = await validarCuenta(crearClienteTemporal(), cuenta);
      if (res.error) continue;
      if (session) await revocar({ access_token: session.access_token, refresh_token: session.refresh_token });
      const { error } = await supabase.auth.setSession({ access_token: res.session.access_token, refresh_token: res.session.refresh_token });
      if (error) break;
      recargar();
      return false;
    }
    try { await supabase.auth.signOut(); } catch { /* sesión ya invalidada */ }
    return true;
  }, []);

  return { authId, cuentas, cambiarCuenta, agregarCuenta, quitarOtraCuenta, cerrarSesion };
}
