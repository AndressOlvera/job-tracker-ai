# 1. Requisitos

## Problema

Cuando buscas prácticas o empleo aplicas a muchas vacantes en distintos portales (OCC, LinkedIn, sitios de empresas). Con el tiempo es difícil recordar a qué empresas aplicaste, en qué etapa va cada proceso y qué tan efectiva está siendo tu búsqueda.

**Job Tracker** centraliza todas tus postulaciones en un solo lugar y te muestra estadísticas para entender cómo va tu búsqueda.

## Usuario objetivo

Un estudiante o recién egresado que aplica a varias vacantes al mismo tiempo. En la versión mínima (MVP) hay **un solo usuario**; no existe registro ni inicio de sesión (ver [ADR-004](05-decisiones.md#adr-004-sin-autenticación-en-el-mvp)).

## Estados de una postulación

| Valor en la API | Etiqueta en la interfaz | Significado |
|---|---|---|
| `applied` | Postulado | Enviaste la solicitud y no has recibido respuesta |
| `interview` | Entrevista | Te contactaron para entrevista o prueba técnica |
| `offer` | Oferta | Recibiste una oferta |
| `rejected` | Rechazado | La empresa te descartó |

En el MVP puedes cambiar de cualquier estado a cualquier otro.

## Historias de usuario

### HU-01 · Registrar una postulación
**Como** usuario, **quiero** registrar una vacante a la que apliqué **para** no perderle el rastro.

Criterios de aceptación:
- Empresa y puesto son obligatorios (máximo 120 caracteres cada uno).
- Si no indico estado, se guarda como **Postulado**.
- Si no indico fecha, se usa la fecha de hoy. No se permiten fechas futuras.
- Enlace de la vacante, fuente (OCC, LinkedIn, etc.) y notas son opcionales.
- El enlace, si existe, debe ser una URL válida que empiece con `http://` o `https://`.
- Si algún dato es inválido, veo un mensaje junto al campo con el problema.

### HU-02 · Ver mis postulaciones
**Como** usuario, **quiero** ver la lista de mis postulaciones **para** tener una vista general.

Criterios de aceptación:
- Por defecto se ordenan de la más reciente a la más antigua (por fecha de postulación).
- Se muestran 20 por página, con navegación entre páginas.
- Cada fila muestra empresa, puesto, estado, fecha y fuente.
- Si no tengo postulaciones, veo un mensaje que me invita a registrar la primera.

### HU-03 · Filtrar y buscar
**Como** usuario, **quiero** filtrar por estado y buscar por empresa o puesto **para** encontrar rápido una postulación.

Criterios de aceptación:
- Puedo filtrar por un estado.
- La búsqueda por texto no distingue mayúsculas y busca en empresa y puesto.
- Puedo limitar por rango de fechas.
- Puedo ordenar por fecha, empresa o estado.
- Los filtros se pueden combinar.

### HU-04 · Editar una postulación
**Como** usuario, **quiero** editar una postulación **para** actualizar su estado o corregir datos.

Criterios de aceptación:
- Puedo modificar cualquier campo con las mismas reglas que al registrar.
- Los campos opcionales se pueden vaciar.
- Si la postulación ya no existe, veo un mensaje de "no encontrada".

### HU-05 · Eliminar una postulación
**Como** usuario, **quiero** eliminar una postulación **para** quitar registros que ya no me sirven.

Criterios de aceptación:
- Antes de eliminar se me pide confirmación.
- Al confirmar, desaparece de la lista y de las estadísticas.

### HU-06 · Ver estadísticas
**Como** usuario, **quiero** ver estadísticas **para** saber qué tan efectiva es mi búsqueda.

Criterios de aceptación:
- Veo el total de postulaciones.
- Veo cuántas hay en cada estado (gráfica de barras).
- Veo cuántas hice por mes (gráfica de línea o barras).
- Veo la **tasa de respuesta** y la **tasa de entrevistas** (definidas en [03-api.md](03-api.md#get-apiv1stats)).
- Sin postulaciones, las tasas se muestran como 0 % (sin errores).

### HU-07 · Abrir la vacante original
**Como** usuario, **quiero** abrir el enlace de la vacante **para** volver a leer la descripción.

Criterios de aceptación:
- Si la postulación tiene enlace, se abre en una pestaña nueva.

## Fuera del alcance del MVP

Se consideran para después de terminar las 7 fases:

- Registro e inicio de sesión de usuarios.
- Historial de cambios de estado (hoy solo se guarda el estado actual).
- Recordatorios y notificaciones.
- Adjuntar archivos (CV, cartas).
- Importar vacantes automáticamente desde portales.
- Interfaz en varios idiomas.

## Requisitos no funcionales

| Área | Requisito |
|---|---|
| Calidad | Cobertura de pruebas del backend ≥ 80 % y Quality Gate de SonarQube aprobado |
| Pruebas | Cada historia de usuario tiene al menos una prueba automatizada |
| Seguridad | Ningún secreto (contraseñas, llaves) en el repositorio; acceso de CI a AWS mediante OIDC |
| Reproducibilidad | El sistema completo se levanta en local con `docker compose up` |
| Costos | La infraestructura de AWS se crea y destruye con Terraform para no gastar créditos cuando no se usa |
| Usabilidad | La interfaz funciona en celular y en computadora, y se puede usar con teclado |
| Privacidad | Mientras no haya inicio de sesión, la versión publicada en AWS usa solo datos de ejemplo |
