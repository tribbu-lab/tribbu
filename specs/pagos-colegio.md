---
title: Pagos al colegio y reenvío de comunicados
status: implemented
priority: high
---

## Summary

Para excursiones, visitas y otros cobros del colegio. La Secretaría del nivel o
el administrador cargan un pago por curso, la familia avisa "Ya pagué" y el
colegio lo confirma cuando recibe el dinero. Es distinto de las colectas entre
familias, que el colegio no ve y siguen igual. Además, un comunicado ya enviado
se puede reenviar como recordatorio con un botón.

## Acceptance Criteria

**Panel (Comunicación → Pagos, web y app)**
- [x] Crear un pago: título, monto, fecha límite, datos para pagar y descripción, para uno o varios cursos, con la opción de sacar alumnos.
- [x] Al crearlo, aviso push a las familias que tienen que pagar.
- [x] Lista por alumno: Pendiente, Avisó que pagó, Confirmado.
- [x] Confirmar un pago (también en efectivo, sin aviso de la familia) y deshacer.
- [x] "Enviar recordatorio": solo a familias con algún hijo pendiente, con confirmación y fecha del último envío.
- [x] La Secretaría solo ve y gestiona los cursos de sus niveles.

**Familias (Curso → Pagos al colegio, web y app)**
- [x] Ver monto, fecha límite y datos para pagar, por hijo.
- [x] "Ya pagué" y deshacer, hasta que el colegio confirme.
- [x] El pago pendiente aparece en Hoy.
- [x] Nadie ve qué pagaron otras familias.

**Globitos rojos**
- [x] Panel: pagos por confirmar en Comunicación y en Pagos (Secretaría y administrador).
- [x] Familia: pagos pendientes en Curso y en la fila Pagos al colegio.

**Aviso automático**
- [ ] Dos días antes de la fecha límite, a las familias con algún hijo pendiente. Se puede apagar en Notificaciones. (Programado y desplegado; todavía no corrió con un pago real.)

**Comunicados**
- [x] En el historial, "Reenviar" vuelve a mandar el push a todas las familias de los cursos, con confirmación y fecha del último reenvío.

## Technical Notes

- SQL: `supabase/pagos-colegio.sql`. Una fila en `pago_colegio_alumnos` por alumno que tiene que pagar.
- La familia escribe solo por el RPC `avisar_pago_colegio`, que no deja marcar `pagado`.
- Orden de salida: SQL → `send-push` y `avisos-automaticos` → web y app.
- tribbu no maneja dinero: el pago se hace por fuera.

## Out of Scope

- Comprobante de pago.
- Que los docentes lo vean.
- Vínculo con Autorizaciones.
