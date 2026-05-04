// Persistencia de colores de hijos en localStorage
// Antes: getHijoColor / setHijoColor definidos en App.jsx líneas 146–147

const key = (userId, hijoId) => `hcolor_${userId}_${hijoId}`;

export const getHijoColor = (userId, hijoId) => {
  try {
    return localStorage.getItem(key(userId, hijoId)) || null;
  } catch {
    return null;
  }
};

export const setHijoColor = (userId, hijoId, color) => {
  try {
    localStorage.setItem(key(userId, hijoId), color);
  } catch {
    // localStorage puede estar bloqueado en modo privado
  }
};
