# Camélia Boutique

Tienda online de moda femenina con estética Art Nouveau, panel de administración y bot de atención.
Next.js 14 (App Router) + TypeScript + TailwindCSS + Supabase self-hosted (`api.neura.com.py`).

## Versiones unidas

La tienda es la versión 2 (inicio animado, Rebajas, Favoritos, Quiénes somos, talles, cupones, zoom de fotos)
sobre el schema propio `cameliaboutique`, con el panel, el bot, WhatsApp y la agenda de entregas.
Las fotos de `public/products` siguen sirviéndose desde el sitio; las nuevas se suben al bucket.

## Puesta en marcha

1. **SQL**: pegar `supabase/cameliaboutique.sql` completo en el SQL Editor y ejecutar (es idempotente).
   Crea el schema `cameliaboutique` con tablas, funciones, RLS, datos iniciales y el bucket `cameliaboutique`.
   Opcional: `supabase/copiar-desde-boutique.sql` copia categorías, productos, clientes y pedidos
   de la tienda vieja (schema `boutique`) sin modificarla.
2. **Exponer el schema**: agregar `cameliaboutique` a `PGRST_DB_SCHEMAS` y reiniciar el servicio REST.
3. **Usuario admin**: en Authentication → Users, crear `admin@cameliaboutique.com` con contraseña (email confirmado).
   Solo los emails de la tabla `cameliaboutique.admins` entran al panel.
4. **Variables** (opcionales, ya vienen por defecto en el código): ver `.env.example`.
5. `npm install && npm run dev` → <http://localhost:3000> · panel en `/admin`.

## Qué toca fuera del schema

Nada en `public`, `auth` ni otros schemas. Lo único externo es lo que Supabase necesita para el bucket:
una fila en `storage.buckets` (`cameliaboutique`) y 4 policies en `storage.objects` limitadas a ese bucket
(lectura pública, escritura solo admin).

## Panel `/admin`

| Sección | Qué hace |
|---|---|
| Dashboard | Pendientes, pedidos para hoy, facturado, pedidos del bot, chats que piden persona, stock bajo |
| Pedidos | Filtros por estado/origen, detalle, cambio de estado, fecha de entrega, eliminar |
| Agenda | Pedidos por día de entrega (14 días), los del bot marcados |
| Conversaciones | Chats del bot; tomar, responder como equipo, devolver al bot, cerrar, guardar contacto |
| Contactos | Clientes de la web y del bot, notas, WhatsApp directo |
| Productos | Alta/edición, precio, stock, fotos al bucket (orden y portada), sinónimos para el bot |
| Categorías | Alta/edición/orden/visibilidad |
| Cupones | Códigos de descuento con %, vencimiento y cantidad de usos |
| Bot | Encender/apagar, confirmación automática, mensajes, respuestas y palabras clave |
| Entregas y pagos | Turnos por día con horario y cupo, días sin entregas, anticipación, retiro en local, métodos de pago |
| Configuración | Datos del negocio, horarios, responsable de avisos |

El menú muestra contadores en vivo y una notificación del navegador cuando entra un pedido.

## Bot de atención (chat de la web)

Por reglas, sin IA: menús, palabras clave y pasos definidos. Vive en `src/lib/bot/engine.ts` y responde en `/api/chat`.

- Busca productos tolerando errores ("sako camelia" → Saco Camélia) y responde precio y stock reales.
- Toma pedidos paso a paso: producto → cantidad → envío o retiro → día y horario de la agenda → dirección →
  nombre → teléfono → método de pago → "Entendí esto… ¿es correcto?".
- El botón "Comprar por WhatsApp" de cada producto manda `(ref: slug)`: el bot reconoce el producto exacto y
  responde si hay stock. Los mensajes de carrito y de pedido ya hecho pasan a una persona.
- Antes de guardar, `create_order()` bloquea las filas y revalida stock: si dos clientes piden la última unidad, solo uno se la lleva.
- Si no entiende dos veces o piden una persona, pasa la conversación al equipo (el bot se pausa en ese chat).
- Los audios se marcan para atención humana (preparado para WhatsApp).
- Pedidos del bot quedan `pendiente` hasta que alguien los confirme (o automáticos desde el panel).

## WhatsApp (puente Baileys por QR)

El bot también atiende por WhatsApp a través del puente propio
[`baileys-bridge-cameliaboutique`](../baileys-bridge-cameliaboutique) (Coolify).

- Entrada: el puente manda cada mensaje a `/api/whatsapp/inbound`; responde el mismo bot que en la web,
  con las opciones como lista numerada ("Respondé con el número").
- Si alguien del equipo contesta desde el celular de la tienda, queda en el panel como "Equipo" y el bot se pausa en ese chat.
- Las respuestas desde el panel (Conversaciones) salen por WhatsApp cuando el chat vino de ahí.
- Cada pedido nuevo (web, bot web o bot WhatsApp) se avisa al "WhatsApp del responsable" de Configuración,
  con la cantidad de pendientes y el link a la Agenda.
- Se ignoran grupos, estados y canales.

Configuración:
1. `select bridge_secret from cameliaboutique.wa_config;` (lo genera el SQL, no está en el repo).
2. Puente en Coolify con `ERP_INBOUND_URL=https://camelia-boutique.vercel.app/api/whatsapp/inbound` y `ERP_SHARED_SECRET=<secreto>`.
3. Vercel: `WA_BRIDGE_URL` y `WA_BRIDGE_SECRET` (mismo secreto), redeploy.
4. Panel → Configuración → WhatsApp → "Vincular número (QR)" y escanear con el celular de la tienda.

> Conexión no oficial: WhatsApp puede bloquear el número. Usar un número dedicado, solo atención 1:1.

## Agenda de entregas

Los turnos (día de la semana + horario + cupo) se cargan en **Entregas y pagos**. `available_slots()` devuelve
los turnos con lugar libre (sin feriados, sin turnos de hoy que empiecen en menos de una hora). `create_order()`
bloquea la fila del turno y cuenta el cupo antes de guardar: si dos personas eligen el último lugar, solo una lo
consigue y a la otra el bot le ofrece otro horario. Los pedidos cancelados liberan su lugar.

## Stock

- El checkout y el bot usan `create_order()`: precios de la base, validación con bloqueo y descuento de stock.
- Cancelar un pedido devuelve el stock; reactivarlo lo vuelve a descontar (falla si ya no hay).
- Eliminar un pedido no cancelado devuelve el stock.

## Estructura

```
src/app/(tienda)/     tienda pública + widget de chat
src/app/admin/login   login con Supabase Auth
src/app/admin/(panel) panel protegido (middleware + is_admin())
src/app/api/chat      endpoint del bot
src/lib/bot/          motor del bot y utilidades de texto
src/lib/supabase/     clientes (público, servidor con sesión, navegador)
supabase/cameliaboutique.sql
```

Diseñado y desarrollado por **Neura**.
