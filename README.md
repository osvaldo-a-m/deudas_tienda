# Control de Créditos

App web (optimizada para móvil) para llevar el registro de clientes y sus deudas: alta de clientes, registro de pagos y de deudas nuevas (cada una con fecha y nota opcional), y saldo total por cliente. Es un panel general del negocio, sin inicio de sesión. Pensada para instalarse como acceso directo desde el navegador del celular.

Es HTML/CSS/JS puro (sin build step) + [Supabase](https://supabase.com) como base de datos.

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (puedes usar tu correo).
2. Click en **New Project**.
   - Elige un nombre, una contraseña de base de datos (guárdala) y la región más cercana.
3. Espera a que termine de aprovisionarse (1-2 minutos).

## 2. Crear las tablas

1. En el panel del proyecto, ve a **SQL Editor** (icono de terminal en el menú lateral).
2. Abre el archivo [supabase-schema.sql](supabase-schema.sql) de este repositorio, copia todo su contenido y pégalo en el editor.
3. Click en **Run**.

Esto crea:
- **`clients`**: nombre, teléfono, notas y (para uso futuro) límite de crédito.
- **`transactions`**: cada pago o deuda nueva, ligado a un cliente, con su fecha y nota opcional.
- **`client_balances`**: vista que calcula el saldo actual de cada cliente (suma de deudas menos suma de pagos).
- Políticas de seguridad (RLS) que permiten leer y escribir a quien tenga la URL de la app y la llave `anon` (ver advertencia abajo).

## 3. Obtener las llaves de conexión

1. Ve a **Project Settings > Data API** (para la URL) y **Project Settings > API Keys** (para la llave).
2. Copia:
   - **Project URL** (formato `https://xxxxxxxx.supabase.co`)
   - La llave pública para el navegador:
     - Proyectos nuevos: **Publishable key** (empieza con `sb_publishable_...`)
     - Proyectos antiguos: **anon public** key
   - **Nunca copies la Secret key / `service_role`** — esa da acceso total sin restricciones de RLS y no debe usarse en código de navegador.

## 4. Conectar la app

Abre el archivo [config.js](config.js) y reemplaza los valores:

```js
window.SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
window.SUPABASE_ANON_KEY = "TU-ANON-PUBLIC-KEY";
```

## 5. Ejecutar la app

No requiere instalación ni build. Basta con servir los archivos estáticos:

- **Opción rápida (local):** abre `index.html` directamente en el navegador, o usa la extensión "Live Server" de VS Code.
- **Opción recomendada (para usarla desde el celular):** despliega la carpeta en un hosting estático gratuito como [Vercel](https://vercel.com), [Netlify](https://netlify.com) o GitHub Pages, y entra desde el navegador del celular. Desde ahí puedes usar "Agregar a pantalla de inicio" para que se sienta como una app.

## ⚠️ Nota de seguridad

Esta app **no pide inicio de sesión**: cualquier persona que tenga la URL donde la publiques puede ver y modificar los datos de los clientes (los saldos, historial de pagos, etc.), porque la llave `anon` que usa el navegador queda visible en el código y las políticas de la base de datos permiten acceso abierto a quien la use.

Esto es intencional para mantener la app simple como panel interno del negocio, pero significa que **la URL no debe compartirse públicamente**. Recomendaciones:

- No publiques el enlace en redes sociales ni lo indexes en buscadores.
- Si usas Vercel o Netlify, activa la protección con contraseña que ofrecen sus planes (Vercel: "Password Protection"; Netlify: "Visitor access control").
- Si más adelante quieres restringir el acceso por usuario (por ejemplo, varios empleados con su propia cuenta), se puede reactivar el login con Supabase Auth y volver a las políticas RLS que exigen `to authenticated`.

## Uso de la app

- **Panel de clientes**: los clientes se muestran ordenados por fecha de alta, del más reciente al más antiguo. Incluye búsqueda por nombre o teléfono y el saldo total pendiente arriba.
- **Recordatorios de cobro**: si un cliente tiene saldo pendiente y pasaron 7 días o más desde su último pago (o desde que se generó la deuda, si nunca ha pagado), aparece marcado como atrasado:
  - Se muestra un aviso arriba del listado con el número de clientes atrasados; tócalo para filtrar y ver solo esos clientes.
  - Cada cliente atrasado muestra una etiqueta con los días sin abonar, tanto en el listado como en su detalle.
  - El botón 🔔 en la parte superior activa notificaciones del navegador: si hay clientes atrasados, se muestra una notificación (máximo una vez al día) mientras la app esté abierta en el navegador. Esto **no es una notificación push real** (no llega con la app cerrada); para eso se necesitaría un service worker + servidor de push, que puede agregarse más adelante si se requiere.
- **Detalle de cliente**: muestra el saldo actual y permite:
  - **Registrar pago** (resta al saldo) o **Registrar deuda** (suma al saldo) — cada movimiento pide monto, **fecha** (por defecto hoy, editable) y **nota opcional**.
  - Ver el historial completo de movimientos, ordenado del más reciente al más antiguo.
  - Editar los datos del cliente o eliminarlo (botón ✎ arriba).

## Próximamente

- **Límite de crédito por cliente**: el campo `credit_limit` ya existe en la base de datos y se puede editar desde el formulario de edición de cliente; falta añadir la validación/alerta en la interfaz cuando el saldo se acerque o supere el límite.

## Estructura del proyecto

```
index.html            Estructura de las pantallas (lista de clientes, detalle)
styles.css             Estilos mobile-first
app.js                 Lógica de la app y llamadas a Supabase
config.js               Credenciales de conexión a Supabase (edítalo)
supabase-schema.sql    Script SQL para crear tablas, vista y políticas RLS
```
