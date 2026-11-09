# 5. Decisiones de diseño (ADR)

Un ADR (*Architecture Decision Record*) registra una decisión importante, por qué se tomó y qué consecuencias tiene. Sirve para que cualquiera (incluido tú en seis meses, o un entrevistador) entienda el porqué del proyecto, no solo el qué.

Cuando una decisión cambie, no se borra: se agrega un ADR nuevo que la reemplaza.

---

## ADR-001: Monorepo

**Contexto.** El proyecto tiene backend, frontend, pruebas e2e e infraestructura.

**Decisión.** Todo vive en un solo repositorio, en carpetas separadas.

**Consecuencias.**
- ✅ Un solo lugar para ver el proyecto completo; ideal para un portafolio.
- ✅ Un cambio que toca API y frontend va en un solo pull request.
- ⚠️ Los workflows de CI deben filtrar por carpeta para no correr todo en cada cambio (`paths` en GitHub Actions). *Reemplazado por el [ADR-016](#adr-016-la-ci-revisa-todo-en-cada-pull-request).*

---

## ADR-002: Flask + SQLAlchemy + Alembic + Pydantic

**Contexto.** Hace falta una API REST en Python con base de datos relacional y validación de datos.

**Decisión.**
- **Flask** como framework web: ligero y ya lo usaste en el proyecto de EC2.
- **SQLAlchemy 2** como ORM, para no escribir SQL a mano en cada consulta.
- **Flask-Migrate (Alembic)** para versionar los cambios de la estructura de la base de datos.
- **Pydantic v2** para validar los datos que entran y dar formato a los que salen.

**Consecuencias.**
- ✅ Herramientas muy pedidas en vacantes de backend con Python.
- ✅ Las migraciones permiten recrear la base de datos idéntica en local, en CI y en AWS.
- ⚠️ Flask no integra Pydantic de forma nativa; se crea una pequeña capa propia para validar y convertir errores al formato de la API.

---

## ADR-003: PostgreSQL, con el estado como texto y `CHECK`

**Contexto.** El estado de una postulación tiene un conjunto fijo de valores.

**Decisión.** Guardar `status` como `VARCHAR(20)` con una restricción `CHECK`, en lugar de un tipo `ENUM` de PostgreSQL.

**Consecuencias.**
- ✅ Agregar un estado nuevo es una migración sencilla (cambiar el `CHECK`); modificar un `ENUM` es más delicado.
- ✅ La base de datos sigue rechazando valores inválidos.
- ⚠️ Los valores válidos están repetidos en la BD, en la API y en el frontend; se mantienen sincronizados con pruebas.

---

## ADR-004: Sin autenticación en el MVP

**Contexto.** Agregar usuarios e inicio de sesión aumenta mucho el alcance.

**Decisión.** El MVP es de un solo usuario y no tiene inicio de sesión.

**Consecuencias.**
- ✅ El esfuerzo se concentra en lo que más demuestra el proyecto: pruebas, CI/CD e infraestructura.
- ⚠️ Mientras esté publicada en AWS, **cualquiera con la URL puede ver y modificar los datos**. Por eso la versión publicada usa solo datos de ejemplo y la infraestructura se apaga cuando no se usa.
- ➡️ Es la primera mejora planeada después del MVP.

---

## ADR-005: Mismo origen para frontend y API

**Contexto.** Si el frontend y la API están en dominios distintos, el navegador exige configurar CORS.

**Decisión.** El navegador siempre habla con un solo dominio:
- **En local:** el servidor de desarrollo de Vite redirige `/api/*` hacia Flask (proxy).
- **En AWS:** CloudFront sirve el frontend desde S3 y redirige `/api/*` hacia la API en EC2.

**Consecuencias.**
- ✅ No hace falta CORS, que es una fuente común de errores y de configuraciones inseguras.
- ✅ La API queda detrás de HTTPS gracias a CloudFront, sin comprar un dominio ni configurar certificados en EC2.
- ⚠️ CloudFront no debe guardar en caché las respuestas de `/api/*`; se configura una política sin caché para esa ruta.
- ⚠️ El tramo entre CloudFront y EC2 va por HTTP. Para limitar el riesgo, el security group de EC2 solo acepta tráfico de CloudFront (usando su lista de prefijos administrada por AWS), no de cualquier IP.

---

## ADR-006: API en EC2 con Docker

**Contexto.** AWS ofrece varias formas de correr la API: EC2, ECS/Fargate, App Runner, Lambda.

**Decisión.** Un contenedor Docker en una instancia EC2.

**Consecuencias.**
- ✅ Bajo costo y cabe en los créditos.
- ✅ Continúa lo aprendido en el proyecto de EC2 y en el curso de Cloud Practitioner.
- ✅ Docker hace que el mismo contenedor corra igual en local, en CI y en AWS.
- ⚠️ Una sola instancia: si falla, la API se cae. Para un portafolio es aceptable; la mejora sería Auto Scaling + balanceador o ECS.
- ⚠️ Se administra por **SSM Session Manager**, sin abrir el puerto 22 (SSH) a internet.

---

## ADR-007: Infraestructura como código y destruible

**Contexto.** Los recursos de AWS cuestan mientras existen, y los créditos son limitados.

**Decisión.**
- Toda la infraestructura se define con **Terraform** en `infra/`.
- El estado de Terraform se guarda en un bucket de S3 con bloqueo nativo, no en la computadora.
- Región: `us-east-1`.
- La red no usa NAT Gateway (cobra por hora): la base de datos va en subredes privadas y la instancia EC2 en una subred pública con un security group restrictivo.

**Consecuencias.**
- ✅ Con `terraform apply` se levanta todo en minutos y con `terraform destroy` se elimina.
- ✅ La infraestructura queda documentada y versionada en Git.
- ⚠️ El bucket del estado se crea aparte (una sola vez) y no se destruye con el resto.

---

## ADR-008: Borrado físico

**Contexto.** Al eliminar una postulación se puede borrar la fila (borrado físico) o marcarla como eliminada (borrado lógico).

**Decisión.** Borrado físico (`DELETE`).

**Consecuencias.**
- ✅ Más simple, y en el MVP no hay necesidad de recuperar registros.
- ⚠️ No se puede deshacer; por eso la interfaz pide confirmación.

---

## ADR-009: "Hoy" según la zona horaria de la aplicación

**Contexto.** Los servidores y contenedores normalmente usan UTC. A las 8 p. m. en Guadalajara ya es el día siguiente en UTC, así que `date.today()` pondría como fecha de postulación "mañana" y la validación de fechas futuras rechazaría la fecha real del usuario.

**Decisión.** La fecha de hoy se calcula con la zona horaria configurada en `APP_TIMEZONE` (por defecto `America/Mexico_City`), en un solo lugar: `app/clock.py`.

**Consecuencias.**
- ✅ El valor por defecto y la validación coinciden con el calendario del usuario.
- ✅ Las pruebas reemplazan `clock.today` por una fecha fija, así dan el mismo resultado cualquier día.
- ⚠️ Con usuarios en varias zonas horarias habría que recibir la zona desde el frontend. Para el MVP basta con una.

---

## ADR-010: Pruebas contra PostgreSQL real

**Contexto.** Una opción común es probar con SQLite en memoria porque es más rápido de configurar.

**Decisión.** Las pruebas usan una base PostgreSQL separada (`jobtracker_test`), creada con las mismas migraciones que se usan en producción. Antes de cada prueba se vacía la tabla.

**Consecuencias.**
- ✅ Se prueba lo que de verdad corre en producción: `ILIKE`, `to_char`, las restricciones `CHECK` y las migraciones.
- ✅ Una prueba detecta si un modelo cambió y falta crear su migración.
- ⚠️ Para correr las pruebas hay que tener PostgreSQL arriba (`docker compose up -d db`). En CI se usará un contenedor de PostgreSQL.

---

## ADR-011: Gráficas propias en lugar de Recharts

**Contexto.** El plan original usaba Recharts para la pantalla de estadísticas. Solo hay dos gráficas y las dos son sencillas: barras horizontales por estado y columnas por mes. Recharts es una librería grande pensada para gráficas mucho más complejas.

**Decisión.** Las gráficas se dibujan con HTML y CSS (`features/stats/`): cada barra es un elemento con su ancho o alto en porcentaje. Los cálculos (rellenar con 0 los meses sin postulaciones, elegir el tope del eje) viven en `chartData.ts`, separados del dibujo y con sus propias pruebas.

**Consecuencias.**
- ✅ Una dependencia menos que mantener y menos JavaScript que descargar.
- ✅ Control total del diseño: barras delgadas, etiquetas solo donde ayudan, detalle al pasar el mouse o al llegar con el teclado.
- ✅ Accesibles sin trabajo extra: cada barra es un elemento de lista con texto ("Postulado: 15 postulaciones, 62.5 % del total") y cada gráfica tiene una tabla con los datos.
- ✅ Se prueban como el resto de la app, con React Testing Library.
- ⚠️ Si después hacen falta gráficas complejas (líneas con muchos puntos, zoom, ejes de tiempo continuos), conviene volver a una librería como Recharts.

---

## ADR-012: TanStack Query para los datos de la API

**Contexto.** Las tres pantallas piden datos a la API. En cada una hay que manejar la carga, los errores y los reintentos; cancelar la petición anterior cuando cambia un filtro, y volver a pedir la lista y las estadísticas después de crear, editar o eliminar. Hacerlo a mano con `useEffect` y `useState` repite código en cada pantalla y es una fuente común de errores, como mostrar una respuesta vieja que llegó tarde.

**Decisión.** Los datos que vienen de la API se manejan con **TanStack Query** (`src/api/queries.ts`). Lo que solo existe en la pantalla, como lo que se escribe en el formulario o si el diálogo está abierto, se queda en `useState`. No se usa una librería de estado global como Redux.

**Consecuencias.**
- ✅ Cada combinación de filtros se guarda en caché: regresar a una página ya vista es instantáneo.
- ✅ Al cambiar de filtro se cancela la petición anterior y se sigue mostrando la lista actual hasta que llega la nueva, sin parpadeos.
- ✅ Después de guardar o eliminar se invalidan las llaves `applications` y `stats`, y todo se actualiza solo.
- ✅ Los errores `4xx` (como un `404`) no se reintentan; los de red o `5xx` sí, hasta dos veces.
- ⚠️ Es una dependencia más, con conceptos propios (llaves de consulta, invalidación).
- ⚠️ Cada prueba crea su propio `QueryClient` sin reintentos, para que una prueba no herede la caché de otra.

---

## ADR-013: Los filtros de la lista viven en la URL

**Contexto.** La lista tiene búsqueda, filtro por estado, rango de fechas, orden y paginación. Si esos valores solo existieran en la memoria de la página, se perderían al recargar, al compartir el enlace o al regresar desde el formulario de edición.

**Decisión.** La URL es la única fuente de los filtros (`/?status=interview&q=oracle&page=2`), leída con `useSearchParams` de React Router.
- `filters.ts` convierte la URL en filtros válidos: lo que no tenga sentido (un estado que no existe, una fecha mal escrita, una página negativa) se ignora en lugar de romper la pantalla.
- Los valores por defecto no se escriben, así la URL queda limpia.
- Cualquier cambio de filtro regresa a la página 1.
- La búsqueda se aplica 300 ms después de dejar de escribir y reemplaza la entrada del historial, para no crear una por cada letra.
- Al abrir el formulario se guarda la URL de la lista, y al terminar se regresa a ella con los mismos filtros.

**Consecuencias.**
- ✅ Recargar, compartir el enlace y los botones atrás/adelante del navegador funcionan como se espera.
- ✅ Las pruebas pueden empezar en cualquier estado de la lista con solo indicar una URL.
- ⚠️ Cualquiera puede escribir la URL a mano, así que todo lo que llega por ahí se valida antes de usarlo.

---

## ADR-014: Imágenes de Docker pequeñas y sin privilegios

**Contexto.** En la Fase 3 la API y el frontend se empaquetan como imágenes de Docker. Las mismas imágenes se usarán en la CI y en AWS, así que conviene que sean seguras, ligeras y reproducibles desde el principio.

**Decisión.**
- **API:** `python:3.13-slim` con **Gunicorn** como servidor (2 procesos), en lugar de `flask run`, que es solo para desarrollo.
- **Frontend:** construcción en dos etapas. `node:24-alpine` compila la app y `nginxinc/nginx-unprivileged:1.30-alpine` sirve el resultado. Node y `node_modules` no llegan a la imagen final.
- **Sin root:** la API corre como un usuario propio (`app`, UID 10001) y Nginx como el usuario sin privilegios de su imagen. El código queda a nombre de root, así que la aplicación puede leerlo pero no modificarlo.
- **Healthchecks** en las dos imágenes: la API revisa `GET /api/v1/health` (que también prueba la base de datos) y Nginx responde en `/healthz`.
- **Versiones fijas:** la versión menor de cada imagen base (`3.13`, `24`, `1.30`) y la versión exacta de cada paquete de Python y de npm (con `package-lock.json` y `npm ci`).
- `.dockerignore` en cada carpeta, para que `.env`, `.venv`, `node_modules` y las pruebas nunca entren a una imagen.

**Consecuencias.**
- ✅ Si alguien lograra ejecutar código a través de la API o de Nginx, no tendría permisos de administrador dentro del contenedor.
- ✅ Docker Compose (y más adelante AWS) sabe cuándo un servicio está listo de verdad, no solo encendido.
- ✅ La imagen del frontend pesa decenas de MB, no cientos.
- ⚠️ Fijar versiones implica actualizarlas a mano de vez en cuando. En la Fase 4 se puede automatizar con Dependabot.

---

## ADR-015: Las migraciones corren en un paso aparte

**Contexto.** Antes de que la API atienda peticiones, la base de datos debe tener sus tablas al día (`flask db upgrade`). Una opción común es correr las migraciones al arrancar la API, dentro del mismo contenedor.

**Decisión.** Las migraciones son un servicio aparte en Docker Compose (`migrate`). Usa la misma imagen que la API, ejecuta `flask db upgrade` y termina. La API solo arranca si ese paso terminó bien (`condition: service_completed_successfully`).

**Consecuencias.**
- ✅ Si una migración falla, la API no arranca con una base de datos a medias, y el error aparece aislado en `docker compose logs migrate`.
- ✅ Si un día hay varias copias de la API, las migraciones no corren varias veces al mismo tiempo.
- ✅ Es el mismo flujo que se usará al desplegar en AWS (Fase 6): primero migrar y después actualizar la API.
- ⚠️ Es un servicio más en `docker-compose.yml`, y `docker compose ps` no lo muestra porque ya terminó (se ve con `docker compose ps -a`).

---

## ADR-016: La CI revisa todo en cada pull request

**Contexto.** En el ADR-001 se planeó que cada workflow filtrara por carpeta (`paths`), para no correr las pruebas del backend cuando solo cambia el frontend. Pero en la Fase 4 los checks de la CI son **obligatorios** para unir a `main`. Si un workflow no corre por un filtro de carpeta, GitHub se queda esperando ese check para siempre y el pull request no se puede unir.

**Decisión.** Un solo workflow (`.github/workflows/ci.yml`) que en cada pull request corre todos los jobs: Backend, Frontend, E2E y SonarQube. Reemplaza la nota de `paths` del ADR-001.

**Consecuencias.**
- ✅ Configuración simple, y nunca se queda un check pendiente.
- ✅ Un cambio en la API también se prueba en el navegador (E2E), y al revés.
- ⚠️ Cada pull request tarda unos minutos, sobre todo por el job E2E, que construye las imágenes de Docker. En un repositorio público, GitHub Actions no cobra por esos minutos.

---

## ADR-017: Pruebas de navegador contra Docker Compose

**Contexto.** Las pruebas E2E pueden correr contra el modo desarrollo (Vite + `flask run`) o contra las imágenes de Docker.

**Decisión.** En la CI, Playwright prueba la app levantada con `docker compose up -d`: Nginx, Gunicorn y PostgreSQL, igual que en producción. Cada prueba crea sus propios datos con un nombre único y los borra al terminar, aunque falle. El navegador usa la zona horaria `America/Mexico_City`, la misma que la API.

**Consecuencias.**
- ✅ Si un Dockerfile o la configuración de Nginx se rompen, la CI lo detecta antes de llegar a AWS.
- ✅ Las pruebas no dependen de los datos de ejemplo, así que también se pueden correr en tu computadora sin borrar nada.
- ⚠️ Es el job más lento, porque construye las dos imágenes en cada ejecución.

---

## ADR-018: SonarQube Cloud analiza desde la CI y su Quality Gate es obligatorio

**Contexto.** SonarQube Cloud puede analizar el repositorio por su cuenta ("Automatic Analysis") o desde la CI.

**Decisión.** El análisis corre en la CI, después de las pruebas, porque así recibe los reportes de cobertura de pytest y Vitest. El job espera el resultado del Quality Gate (`sonar.qualitygate.wait=true`): si el código nuevo no lo pasa, el job falla y el pull request no se puede unir. Se usa el Quality Gate por defecto ("Sonar way"), que revisa el **código nuevo**: cobertura, duplicación, problemas nuevos y *security hotspots* sin revisar.

**Consecuencias.**
- ✅ La calidad se mide igual en cada pull request, sin depender de acordarse de revisarla.
- ✅ Solo se exige al código nuevo, así que el código anterior no bloquea el trabajo.
- ⚠️ Hay que desactivar "Automatic Analysis" en SonarQube Cloud; si los dos están activos, el análisis de la CI falla.
- ⚠️ El job necesita el secreto `SONAR_TOKEN`. Sin él, el job solo muestra un aviso y no analiza nada.

---

## ADR-019: La contraseña de la base de datos no pasa por el estado de Terraform

**Contexto.** RDS necesita una contraseña al crearse. Si Terraform la genera con un recurso normal (`random_password`) o la recibe en una variable, queda escrita en texto plano en el estado de Terraform, y cualquiera con acceso al bucket del estado la podría leer.

**Decisión.**
- La contraseña se genera con un recurso `ephemeral`, que solo existe mientras corre `terraform apply`.
- Se guarda en **SSM Parameter Store** como `SecureString` (cifrada), a través de un argumento *write-only* (`value_wo`), que Terraform envía pero no guarda.
- RDS la recibe leyéndola de SSM, también por un argumento *write-only* (`password_wo`).
- La instancia EC2 la lee de SSM al desplegar. Su rol de IAM solo puede leer ese parámetro.

**Consecuencias.**
- ✅ La contraseña no está en el código, ni en Git, ni en el estado de Terraform. Solo en SSM, cifrada.
- ✅ Para cambiarla basta con subir `value_wo_version` en `infra/database.tf` y correr `terraform apply`.
- ⚠️ Requiere Terraform 1.11 o más nueva.
- ⚠️ Terraform no detecta si alguien cambia la contraseña a mano en RDS, porque no la guarda para compararla.

---

## ADR-020: La instancia EC2 se prepara sola y se despliega con un script

**Contexto.** La API corre como contenedor en EC2 ([ADR-006](#adr-006-api-en-ec2-con-docker)). Hace falta instalar Docker, saber qué imagen correr y con qué variables, y poder actualizarla sin entrar por SSH.

**Decisión.**
- Al crearse, la instancia ejecuta su *user data* (`infra/scripts/user-data.sh.tftpl`): instala Docker y deja el script `job-tracker-deploy` con su configuración, que no incluye secretos.
- El script descarga la imagen de ECR, lee la contraseña de SSM, aplica las migraciones, reemplaza el contenedor y revisa que `GET /api/v1/health` responda.
- El script se ejecuta desde fuera con **SSM Run Command** (`aws ssm send-command`). En la Fase 6, GitHub Actions lo llamará de la misma forma.
- La instancia solo acepta IMDSv2 y con un solo salto de red, así que los contenedores no pueden obtener las credenciales de su rol.

**Consecuencias.**
- ✅ No hay SSH ni llaves `.pem`: el puerto 22 está cerrado.
- ✅ Si la instancia se vuelve a crear, la API arranca sola con la última imagen de ECR.
- ⚠️ Mientras se reemplaza el contenedor, la API deja de responder unos segundos.
- ⚠️ Si cambia el *user data* o el script, Terraform crea una instancia nueva.

---

## ADR-021: CloudFront hace en AWS lo que Nginx hace en Docker

**Contexto.** En Docker, Nginx entrega el frontend, responde `index.html` en las rutas de React, agrega cabeceras de seguridad y reenvía `/api`. En AWS el frontend está en S3, que no hace nada de eso.

**Decisión.**
- **Rutas de React:** una CloudFront Function (`infra/scripts/spa-routes.js`) cambia a `/index.html` toda ruta que no tenga extensión. No se usan las páginas de error de CloudFront (convertir los `403`/`404` en `index.html`), porque aplican a toda la distribución: un `404` de la API llegaría al navegador como una página HTML con código `200`.
- **Cabeceras:** una *response headers policy* con la misma CSP de Nginx, más HSTS, porque en AWS el sitio siempre va por HTTPS.
- **Caché:** los archivos de `assets/` se suben con caché de un año, y `index.html` y lo demás sin caché, igual que en Nginx. Después de cada despliegue se invalida la caché de CloudFront. `/api/*` nunca se guarda en caché.

**Consecuencias.**
- ✅ La app se comporta igual en Docker y en AWS.
- ⚠️ Un archivo que no existe (por ejemplo `/logo.png`) responde con el error `403` de S3, no con la pantalla de "página no encontrada" de la app.

---

## ADR-022: Credenciales temporales en la computadora (`aws login`)

**Contexto.** Terraform y la AWS CLI necesitan credenciales de AWS en la computadora. Lo más común son las llaves de acceso (*access keys*) de un usuario de IAM, pero son permanentes: si se filtran, sirven hasta que alguien las borre.

**Decisión.** Se usa `aws login`, que da credenciales temporales (hasta 12 horas) a partir del inicio de sesión de la consola. Terraform todavía no las lee directo, así que un perfil con `credential_process` se las pasa a través de la AWS CLI.

**Consecuencias.**
- ✅ No hay llaves permanentes guardadas en la computadora.
- ⚠️ Hay que volver a iniciar sesión cada 12 horas.
- ⚠️ Requiere AWS CLI 2.32 o más nueva.

---

## ADR-023: GitHub Actions entra a AWS con OIDC

**Contexto.** El despliegue automático necesita permisos en AWS. Lo más común es crear llaves de acceso de un usuario de IAM y guardarlas como secretos en GitHub, pero son permanentes: si se filtran, sirven hasta que alguien las borre.

**Decisión.**
- Se usa **OIDC**. En cada ejecución, GitHub le da al workflow un token firmado que dice de qué repositorio y rama viene. AWS lo revisa y entrega credenciales temporales (1 hora) del rol `job-tracker-github-deploy`.
- Solo este repositorio, desde `main`, puede usar el rol.
- El rol tiene los permisos mínimos para desplegar: leer los datos del despliegue en SSM, subir la imagen a su repositorio de ECR, mandar comandos solo a la instancia con la etiqueta `Name=job-tracker-api`, subir archivos al bucket del frontend e invalidar la caché de CloudFront.
- El proveedor OIDC y el rol viven en `infra/bootstrap`, no en `infra/`, para que sigan existiendo cuando la infraestructura de la app se destruye.

**Consecuencias.**
- ✅ No hay llaves de AWS guardadas en GitHub.
- ✅ Un pull request, incluso desde un fork, no puede desplegar ni tocar AWS.
- ⚠️ Como el rol existe aunque la infraestructura no, sus permisos usan nombres escritos a mano (`job-tracker-api`, `job-tracker-web-*`) en lugar de referencias de Terraform. Si un nombre cambia en `infra/`, también hay que cambiarlo en `infra/bootstrap/github.tf`.
- ⚠️ El estado de `infra/bootstrap` sigue en tu computadora.

---

## ADR-024: El despliegue corre después de la CI y respeta la infraestructura apagada

**Contexto.** Al unir a `main`, el cambio debe publicarse solo, pero únicamente si pasa las pruebas. Además, la infraestructura no siempre está encendida ([ADR-007](#adr-007-infraestructura-como-código-y-destruible)).

**Decisión.**
- Un workflow aparte, `deploy.yml`, que arranca cuando la CI termina bien en `main` (`workflow_run`), o a mano con **Run workflow**.
- Primero busca en SSM los datos de la infraestructura (`infra/deploy.tf`). Si no existen, avisa y termina sin error.
- Orden: la API (imagen con la etiqueta del commit y migraciones con el script de la Fase 5), después el frontend (S3 e invalidación de la caché) y al final una prueba de salud a través de CloudFront.
- Un solo despliegue a la vez.

**Consecuencias.**
- ✅ Nada llega a AWS sin haber pasado la CI en `main`.
- ✅ Unir con la infraestructura apagada no deja errores en rojo; para publicar después basta con **Run workflow**.
- ✅ Cada imagen lleva la etiqueta de su commit, así que se sabe qué versión corre. Para regresar a una anterior basta con volver a correr su despliegue.
- ⚠️ La API se actualiza antes que el frontend. Un cambio que rompa la compatibilidad entre los dos tendría que hacerse en dos pasos.
- ⚠️ Cada unión a `main` despliega, aunque solo cambie la documentación.
