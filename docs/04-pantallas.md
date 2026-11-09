# 4. Pantallas

Bocetos de baja fidelidad: definen **qué** hay en cada pantalla y cómo se navega, no el diseño visual final. Se actualizaron en la Fase 2 para reflejar lo que se construyó.

## Navegación

| Ruta | Pantalla |
|---|---|
| `/` | Lista de postulaciones |
| `/applications/new` | Nueva postulación |
| `/applications/:id/edit` | Editar postulación |
| `/stats` | Estadísticas |

Barra superior en todas las pantallas: **Job Tracker** · Postulaciones · Estadísticas.

## 1. Lista de postulaciones (`/`)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ Job Tracker                                         Postulaciones   Estadísticas │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Postulaciones                                              [ + Nueva postulación ] │
│ 24 registradas en total.                                                           │
│                                                                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━ ━━━ ━━━━━━━━━━━━━━━━━━━━━━━━ │
│ (Todas 24) (● Postulado 15) (● Entrevista 5) (● Oferta 1) (● Rechazado 3)          │
│                                                                                    │
│ Buscar                                             Desde            Hasta          │
│ [ Empresa o puesto                             ]   [ dd/mm/aaaa ]   [ dd/mm/aaaa ] │
│                                                                [ Limpiar filtros ] │
│ Mostrando 1–20 de 24                                                               │
│ ┌────────────┬─────────────────────────┬────────────┬────────────┬────────┬───────┐│
│ │ Empresa ⇅  │ Puesto                  │ Estado ⇅   │ Fecha ↓    │ Fuente │       ││
│ ├────────────┼─────────────────────────┼────────────┼────────────┼────────┼───────┤│
│ │ Oracle     │ Becario de Software     │ Entrevista │ 28/09/2026 │ OCC    │ ↗ ✎ ✕ ││
│ │ Bosch      │ Practicante QA          │ Postulado  │ 25/09/2026 │ —      │ ↗ ✎ ✕ ││
│ │ Intel      │ Becario de Datos        │ Rechazado  │ 20/09/2026 │ —      │   ✎ ✕ ││
│ └────────────┴─────────────────────────┴────────────┴────────────┴────────┴───────┘│
│                                         [ Anterior ]  Página 1 de 2  [ Siguiente ] │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Filtro por estado:** en lugar de un menú desplegable, una fila de botones con cuántas postulaciones hay en cada estado. Encima, una franja dividida en los colores de cada estado muestra la proporción de un vistazo. Los colores siempre van acompañados del nombre del estado.
- El estado se muestra como etiqueta con un punto de color y su nombre.
- La búsqueda se aplica al dejar de escribir; no hace falta un botón de buscar.
- **Limpiar filtros** solo aparece cuando hay algún filtro activo; conserva el orden elegido.
- Los filtros, el orden y la página se guardan en la URL (`/?status=interview&q=data`) para que al recargar o compartir el enlace se conserven ([ADR-013](05-decisiones.md#adr-013-los-filtros-de-la-lista-viven-en-la-url)).
- Las columnas Empresa, Estado y Fecha se ordenan al hacer clic en su encabezado; un segundo clic invierte el orden.
- En celular la tabla se convierte en tarjetas apiladas.

### Estados especiales

| Situación | Qué se muestra |
|---|---|
| Cargando por primera vez | Esqueleto de la tabla |
| Cambiando de filtro o de página | La lista actual sigue visible hasta que llega la nueva |
| Sin postulaciones | "Aún no registras postulaciones" + botón **Registrar la primera** |
| Filtros sin resultados | "Ninguna postulación coincide con los filtros" + **Limpiar filtros** |
| Error de la API | Mensaje de error + botón **Reintentar** |

### Confirmación al eliminar

```
┌─────────────────────────────────────────────────┐
│ ¿Eliminar la postulación a Oracle?              │
│ Becario de Software. Esta acción no se puede    │
│ deshacer.                                       │
│                       [ Cancelar ] [ Eliminar ] │
└─────────────────────────────────────────────────┘
```

- El foco empieza en **Cancelar**, la opción segura. `Esc` también cancela.
- Si la API falla, el error aparece dentro del diálogo. Al eliminar se muestra el aviso "Postulación eliminada".

## 2. Nueva / editar postulación

```
┌──────────────────────────────────────────────────────────────┐
│ ← Volver a postulaciones                                     │
│ Nueva postulación                                            │
│ Registra una vacante a la que aplicaste.                     │
│                                                              │
│ Los campos con * son obligatorios.                           │
│ Empresa *                     Puesto *                       │
│ [ Oracle                 ]    [ Becario de Software      ]   │
│ Estado                        Fecha de postulación *         │
│ [ Postulado ▾            ]    [ 03/10/2026               ]   │
│ Enlace de la vacante          Fuente                         │
│ [ https://...            ]    [ OCC                      ]   │
│ ⚠ Escribe una URL válida…     Dónde encontraste la vacante.  │
│ Notas                                                        │
│ ┌────────────────────────────────────────────────────────┐   │
│ │                                                        │   │
│ └────────────────────────────────────────────────────────┘   │
│ 0 de 5000 caracteres                                         │
│                                                              │
│                     [ Cancelar ] [ Guardar postulación ]     │
└──────────────────────────────────────────────────────────────┘
```

- La misma pantalla sirve para crear y editar; al editar se llena con los datos actuales y el botón dice **Guardar cambios**.
- La fecha empieza en el día de hoy y no permite fechas futuras.
- Los errores se muestran debajo de cada campo, tanto los que detecta el formulario como los que devuelve la API (`422`), con los mismos mensajes. Al enviar con errores, el foco se mueve al primer campo con error.
- El botón **Guardar** se desactiva y dice "Guardando…" mientras se envía, para evitar duplicados.
- Al guardar se regresa a la lista, con los filtros que tenía, y aparece un aviso: "Postulación guardada" al crear o "Cambios guardados" al editar.
- Si se abre la edición de una postulación que no existe, se muestra "No encontramos esta postulación" con un enlace a la lista.

## 3. Estadísticas (`/stats`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Estadísticas                                                            │
│ Cómo va tu búsqueda, contando todas tus postulaciones.                  │
│                                                                         │
│ ━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━      │
│ Postulaciones    Tasa de          Tasa de          Ofertas              │
│ 24               respuesta        entrevistas      1                    │
│                  37.5 %           25 %                                  │
│ Todas las que    Recibieron       Llegaron a       Procesos que         │
│ has registrado.  alguna resp…     entrevista u…    terminaron en…       │
│                                                                         │
│ ┌ Por estado ─────────────────────┐ ┌ Por mes ────────────────────────┐ │
│ │ Postulado  ███████████████ 15   │ │ 20 ┤                            │ │
│ │ Entrevista █████ 5              │ │    ┤            ▐▌ 18           │ │
│ │ Oferta     █ 1                  │ │ 10 ┤            ▐▌              │ │
│ │ Rechazado  ███ 3                │ │    ┤            ▐▌              │ │
│ │                                 │ │  0 ┤   ▐▌       ▐▌              │ │
│ │                                 │ │       ago      sep              │ │
│ │ ▸ Ver los datos en una tabla    │ │ ▸ Ver los datos en una tabla    │ │
│ └─────────────────────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

- Las cifras van como texto grande con una línea encima, no como tarjetas; debajo de cada tasa, un texto corto explica cómo se calcula.
- Las gráficas se hacen con HTML y CSS, sin librería ([ADR-011](05-decisiones.md#adr-011-gráficas-propias-en-lugar-de-recharts)).
- Por estado: barras horizontales con el color y el nombre de cada estado, y su número al final.
- Por mes: columnas de los últimos 12 meses como máximo. Los meses sin postulaciones aparecen en 0 en lugar de desaparecer. Solo el mes más alto y el último muestran su número encima, para no saturar la gráfica.
- Al pasar el mouse o llegar con el teclado a una barra se muestra su detalle (por ejemplo, el porcentaje del total).
- Cada gráfica tiene **Ver los datos en una tabla**, útil con lector de pantalla o para leer los números exactos.
- Sin datos: las cifras muestran 0 y, en lugar de gráficas vacías, un mensaje invita a registrar la primera postulación.
