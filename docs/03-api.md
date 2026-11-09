# 3. API REST

## Convenciones

- **URL base:** `/api/v1`. El número de versión permite cambiar la API en el futuro sin romper a quien la usa.
- **Formato:** JSON en peticiones y respuestas, con nombres de campos en `snake_case`.
- **Fechas:** `YYYY-MM-DD` (por ejemplo `2026-10-03`). Fechas con hora en ISO 8601 con zona horaria.
- **Mismo origen:** en local Vite redirige `/api` hacia Flask y en AWS lo hace CloudFront, así que el navegador siempre habla con un solo dominio y no hace falta CORS (ver [ADR-005](05-decisiones.md#adr-005-mismo-origen-para-frontend-y-api)).

## Resumen de endpoints

| Método | Ruta | Descripción | Éxito |
|---|---|---|---|
| `GET` | `/api/v1/health` | Estado de la API y la base de datos | `200` |
| `GET` | `/api/v1/applications` | Lista con filtros, orden y paginación | `200` |
| `POST` | `/api/v1/applications` | Crear una postulación | `201` |
| `GET` | `/api/v1/applications/{id}` | Obtener una postulación | `200` |
| `PATCH` | `/api/v1/applications/{id}` | Modificar algunos campos | `200` |
| `DELETE` | `/api/v1/applications/{id}` | Eliminar | `204` |
| `GET` | `/api/v1/stats` | Estadísticas | `200` |

---

## Objeto `Application`

```json
{
  "id": 42,
  "company": "Oracle",
  "position": "Becario de Ingeniería de Software",
  "status": "interview",
  "applied_on": "2026-09-28",
  "job_url": "https://www.occ.com.mx/empleo/oferta/12345",
  "source": "OCC",
  "notes": "Entrevista técnica el viernes",
  "created_at": "2026-09-28T17:05:11Z",
  "updated_at": "2026-10-02T15:40:03Z"
}
```

---

## `GET /api/v1/health`

Lo usan Docker, el monitoreo y la prueba posterior a cada despliegue para saber si el servicio está vivo.

`200 OK`

```json
{ "status": "ok", "database": "ok" }
```

`503 Service Unavailable` si no hay conexión con la base de datos:

```json
{ "status": "degraded", "database": "unreachable" }
```

---

## `GET /api/v1/applications`

### Parámetros de consulta (todos opcionales)

| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `status` | `interview` | Filtra por un estado |
| `q` | `data` | Busca en empresa y puesto, sin distinguir mayúsculas |
| `applied_from` | `2026-09-01` | Fecha de postulación mayor o igual |
| `applied_to` | `2026-09-30` | Fecha de postulación menor o igual |
| `sort` | `-applied_on` | Campo para ordenar. Con `-` al inicio es descendente. Valores: `applied_on`, `company`, `status`, `created_at` |
| `page` | `1` | Página, empieza en 1 |
| `per_page` | `20` | Elementos por página, de 1 a 100 |

Valores por defecto: `sort=-applied_on`, `page=1`, `per_page=20`.

### Ejemplo

`GET /api/v1/applications?status=interview&q=data&page=1`

`200 OK`

```json
{
  "items": [ { "id": 42, "company": "Oracle", "...": "..." } ],
  "page": 1,
  "per_page": 20,
  "total": 1,
  "pages": 1
}
```

Una página fuera de rango devuelve `items` vacío, no un error. Sin resultados, `total` y `pages` valen `0`.

Otras reglas:
- `q` admite hasta 100 caracteres. Los caracteres `%` y `_` se buscan como texto literal.
- Un parámetro vacío (`?status=`) equivale a no enviarlo; los parámetros desconocidos se ignoran.
- `applied_from` no puede ser posterior a `applied_to`.
- Al ordenar por `company` no se distinguen mayúsculas. Cuando hay empates, se desempata por `id` en la misma dirección.

---

## `POST /api/v1/applications`

### Cuerpo

| Campo | Obligatorio | Reglas |
|---|---|---|
| `company` | Sí | 1–120 caracteres, se recortan espacios |
| `position` | Sí | 1–120 caracteres, se recortan espacios |
| `status` | No | `applied` (por defecto), `interview`, `offer`, `rejected` |
| `applied_on` | No | `AAAA-MM-DD`. Hoy por defecto (en la zona horaria `APP_TIMEZONE`); no puede ser futura |
| `job_url` | No | URL `http(s)`, máximo 500 caracteres |
| `source` | No | Máximo 60 caracteres |
| `notes` | No | Máximo 5000 caracteres |

Los campos `id`, `created_at` y `updated_at` los asigna el servidor; si se envían, se rechazan, igual que cualquier campo desconocido.

Los campos opcionales enviados vacíos (`""` o solo espacios) se guardan como `null`.

```json
{
  "company": "Oracle",
  "position": "Becario de Ingeniería de Software",
  "job_url": "https://www.occ.com.mx/empleo/oferta/12345",
  "source": "OCC"
}
```

`201 Created` con el encabezado `Location: /api/v1/applications/42` y el objeto creado en el cuerpo.

---

## `GET /api/v1/applications/{id}`

`200 OK` con el objeto, o `404 Not Found`.

---

## `PATCH /api/v1/applications/{id}`

Se envían **solo los campos a cambiar**, con las mismas reglas que al crear. Los campos opcionales se pueden vaciar enviando `null`.

```json
{ "status": "offer", "notes": null }
```

`200 OK` con el objeto actualizado. `404` si no existe. `422` si el cuerpo está vacío o algún campo es inválido.

> Se eligió `PATCH` en lugar de `PUT` porque el caso más común es cambiar solo el estado, y así no hay que reenviar todo el objeto.

---

## `DELETE /api/v1/applications/{id}`

`204 No Content` sin cuerpo, o `404 Not Found`.

---

## `GET /api/v1/stats`

`200 OK`

```json
{
  "total": 24,
  "by_status": { "applied": 15, "interview": 5, "offer": 1, "rejected": 3 },
  "response_rate": 0.375,
  "interview_rate": 0.25,
  "by_month": [
    { "month": "2026-08", "count": 6 },
    { "month": "2026-09", "count": 18 }
  ]
}
```

### Definiciones

- **`by_status`** siempre incluye los cuatro estados, aunque alguno tenga 0.
- **`response_rate`** (tasa de respuesta) = postulaciones con cualquier respuesta / total
  = (`interview` + `offer` + `rejected`) / `total`. En el ejemplo: 9 / 24 = 0.375.
- **`interview_rate`** (tasa de entrevistas) = (`interview` + `offer`) / `total`. Se cuentan las ofertas porque para llegar a una oferta hubo entrevista. En el ejemplo: 6 / 24 = 0.25.
- Con `total = 0`, ambas tasas valen `0` (nunca se divide entre cero).
- Las tasas se redondean a 4 decimales; la interfaz las muestra como porcentaje.
- `by_month` solo incluye meses con al menos una postulación, ordenados del más antiguo al más reciente.

---

## Errores

Todos los errores tienen el mismo formato:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Algunos campos no son válidos.",
    "details": {
      "company": ["Este campo es obligatorio."],
      "applied_on": ["La fecha no puede ser futura."]
    }
  }
}
```

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `bad_request` | El cuerpo no es JSON válido |
| `404` | `not_found` | La postulación o la ruta no existen |
| `405` | `method_not_allowed` | Método no permitido en esa ruta |
| `415` | `unsupported_media_type` | Falta `Content-Type: application/json` en `POST`/`PATCH` |
| `422` | `validation_error` | Parámetros o campos inválidos; `details` indica cuáles |
| `500` | `internal_error` | Error inesperado; nunca se exponen detalles internos |
| `503` | — | Solo en `/health`, cuando la base de datos no responde |

`details` solo aparece en errores de validación. Sus llaves son los nombres de los campos o parámetros; los errores que afectan a todo el cuerpo (por ejemplo, un `PATCH` vacío) aparecen bajo la llave `body`. Los mensajes están en español para que la interfaz los muestre tal cual.
