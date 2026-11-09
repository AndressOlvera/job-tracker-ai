# Roadmap (v2, construida con IA)

Misma app que la v1, con el mismo spec (`docs/01` a `docs/05`). Cambia quién la construye:
agentes de IA hacen el trabajo y Andrés revisa y aprueba.

Cada casilla es una **issue** de GitHub. Las crea `/crear-issues`, que además escribe aquí su número.
Las que dicen `humano` necesitan a Andrés en algún paso.

## Cómo se trabaja

1. `/fase <n>` trabaja todas las issues abiertas de una fase en una rama `fase-<n>-...`, con los subagentes de `.claude/agents/`.
2. Al final abre **un solo PR por fase**, con una línea `Closes #n` por issue y la casilla marcada aquí.
3. La CI y la revisión automática de Claude revisan el PR. Andrés lee el resumen, revisa lo que le interese y hace el merge.
4. Para una issue suelta (un bug, una mejora) se usa `/issue <número>` o se menciona `@claude` en la issue.

Diferencias con la v1: la CI de cada área se crea junto con su código (no hasta la Fase 4), para que la IA tenga
con qué comprobar su trabajo desde el primer PR; y los PR son por fase, no por issue.

---

## Fase 0 · Spec y kit de IA

- [x] Spec copiado de la v1 → `docs/01` a `docs/05`
- [x] Kit de IA → `CLAUDE.md`, `.claude/` (subagentes, comandos, hooks, permisos), `.mcp.json`

## Fase 1 · Backend

- [x] **Base de datos local con Docker Compose** (#2)
  - Listo cuando: `docker compose up -d db` levanta PostgreSQL 16 con una base para desarrollo y otra para pruebas, y existe `.env.example` con las variables necesarias.
- [x] **Estructura de la app Flask** (#3)
  - Listo cuando: existe la app con *application factory*, configuración por entorno (desarrollo, pruebas, producción) y `GET /api/v1/health` responde con el estado de la API y la base.
- [ ] **Modelo `Application` y primera migración** (#4)
  - Listo cuando: `flask db upgrade` crea la tabla igual a `docs/02-modelo-de-datos.md`.
- [ ] **Endpoints CRUD con validación** (#5)
  - Listo cuando: crear, obtener, modificar y eliminar funcionan con las reglas y el formato de errores de `docs/03-api.md`.
- [ ] **Filtros, búsqueda, orden y paginación** (#6)
  - Listo cuando: `GET /api/v1/applications` acepta todos los parámetros documentados.
- [ ] **Endpoint de estadísticas** (#7)
  - Listo cuando: `GET /api/v1/stats` devuelve los totales y tasas, incluido el caso sin datos.
- [ ] **Pruebas con pytest** (#8)
  - Listo cuando: cada endpoint tiene pruebas de éxito y de error contra PostgreSQL real, y la cobertura es ≥ 80 %.
- [ ] **Linter y datos de ejemplo** (#9)
  - Listo cuando: `ruff check` y `ruff format --check` pasan, y `flask seed` carga postulaciones de ejemplo.
- [ ] **CI del backend** (#10)
  - Listo cuando: `.github/workflows/ci-backend.yml` (job `Backend`) corre ruff y pytest contra un PostgreSQL temporal en cada PR y en `main`, y guarda la cobertura como artefacto.

## Fase 2 · Frontend

- [ ] **Proyecto React + TypeScript con Vite** (#11)
  - Listo cuando: el proyecto arranca, ESLint y Prettier están configurados y el proxy de `/api` de Vite apunta a `flask run`.
- [ ] **Cliente de la API con tipos** (#12)
  - Listo cuando: existen tipos de TypeScript para `Application`, filtros y estadísticas (según `docs/03-api.md`), y funciones para cada endpoint.
- [ ] **Pantalla de lista** (#13) (HU-02, HU-03, HU-07)
  - Listo cuando: muestra la tabla con filtros en la URL, orden, paginación y estados de carga, vacío y error.
- [ ] **Formulario de crear y editar** (#14) (HU-01, HU-04)
  - Listo cuando: valida en el navegador, muestra los errores `422` de la API por campo y evita envíos dobles.
- [ ] **Eliminar con confirmación** (#15) (HU-05)
  - Listo cuando: pide confirmación antes de borrar y avisa el resultado.
- [ ] **Pantalla de estadísticas** (#16) (HU-06)
  - Listo cuando: muestra las cifras y las dos gráficas, incluido el caso sin datos, sin librerías de gráficas (ADR-011).
- [ ] **Pruebas con Vitest y React Testing Library** (#17)
  - Listo cuando: el formulario, los filtros y la confirmación de borrado tienen pruebas, con la API simulada.
- [ ] **Diseño responsive y accesible** (#18)
  - Listo cuando: funciona en pantalla de celular y se puede usar completo con teclado.
- [ ] **CI del frontend** (#19)
  - Listo cuando: `.github/workflows/ci-frontend.yml` (job `Frontend`) corre ESLint, Prettier, `tsc`, Vitest con cobertura y el build, y guarda la cobertura como artefacto.

## Fase 3 · Docker

- [ ] **Dockerfile de la API** (#20)
  - Listo cuando: la imagen usa Gunicorn, corre con un usuario sin privilegios y tiene *healthcheck* (ADR-014).
- [ ] **Dockerfile del frontend** (#21)
  - Listo cuando: compila la app y la sirve con Nginx, que además redirige `/api` a la API.
- [ ] **Docker Compose completo** (#22)
  - Listo cuando: `docker compose up` levanta base de datos, API y frontend, y aplica las migraciones en un paso aparte (ADR-015).
  - Guía en `docs/06-docker.md`.

## Fase 4 · Calidad y protección

- [ ] **Pruebas de navegador con Playwright** (#23)
  - Listo cuando: el flujo crear → editar → filtrar → eliminar corre en `.github/workflows/e2e.yml` (job `E2E`) sobre Docker Compose, con la zona horaria `America/Mexico_City` (ADR-017).
- [ ] **SonarQube Cloud** (#24) · `humano`
  - Listo cuando: `.github/workflows/sonarqube.yml` (job `SonarQube`) analiza cada PR con la cobertura de backend y frontend, y el Quality Gate aparece en GitHub.
  - A Andrés le toca: crear el proyecto en SonarQube Cloud y guardar el secreto `SONAR_TOKEN` en GitHub.
- [ ] **Protección de `main` e insignias** (#25)
  - Listo cuando: un ruleset de GitHub impide unir un PR si fallan `Backend`, `Frontend`, `E2E` o `SonarQube`, y el README muestra las insignias de CI y del Quality Gate.
  - Guía en `docs/07-ci.md`.

## Fase 5 · Infraestructura en AWS

- [ ] **Estado remoto de Terraform** (#26)
  - Listo cuando: `infra/` usa el bucket de estado de la v1 con la llave `job-tracker-ai/terraform.tfstate` y bloqueo nativo (ver `CLAUDE.md` → AWS).
- [ ] **Red** (#27)
  - Listo cuando: el código define la VPC con subredes públicas y privadas, sin NAT Gateway, y `terraform validate` pasa.
- [ ] **Registro de imágenes (ECR)** (#28)
- [ ] **Base de datos (RDS PostgreSQL)** (#29)
  - Listo cuando: RDS va en subredes privadas y su contraseña se guarda en SSM sin pasar por el estado (ADR-019).
- [ ] **Servidor de la API (EC2)** (#30)
  - Listo cuando: la instancia tiene un rol IAM para leer de ECR y SSM, instala Docker al arrancar y se administra con Session Manager, sin SSH (ADR-020).
- [ ] **Frontend (S3 + CloudFront)** (#31)
  - Listo cuando: CloudFront sirve el frontend desde un bucket privado y redirige `/api/*` a EC2 sin caché (ADR-021).
- [ ] **Primer despliegue** (#32) · `humano`
  - Listo cuando: la app funciona desde la URL de CloudFront y el procedimiento para levantar y destruir todo está en `docs/08-aws.md`.
  - A Andrés le toca: iniciar sesión con `aws login` y aprobar el `terraform apply`.

## Fase 6 · Despliegue automático

- [ ] **Conexión OIDC entre GitHub y AWS** (#33) · `humano`
  - Listo cuando: `infra/bootstrap` crea un rol que solo puede asumir este repositorio desde `main`, usando el proveedor OIDC que ya existe (ADR-023).
  - A Andrés le toca: aprobar el `terraform apply` de `infra/bootstrap`.
- [ ] **Despliegue de la API** (#34)
  - Listo cuando: al unir a `main` se construye la imagen, se sube a ECR, se actualiza EC2 y se aplican las migraciones (ADR-024).
- [ ] **Despliegue del frontend** (#35)
  - Listo cuando: al unir a `main` se compila, se sube a S3 y se invalida la caché de CloudFront.
- [ ] **Prueba posterior al despliegue** (#36)
  - Listo cuando: el workflow verifica `GET /api/v1/health` a través de CloudFront y falla si no responde.
  - Guía en `docs/09-despliegue.md`.

## Fase 7 · Pulido

- [ ] **README final** (#37)
  - Listo cuando: incluye capturas, diagrama de arquitectura, cómo correrlo, tecnologías y decisiones.
- [ ] **Cómo se construyó con IA** (#38)
  - Listo cuando: `docs/10-construido-con-ia.md` explica las herramientas usadas, cuántos PR e issues hubo, qué falló y cómo se corrigió (sacado del historial de Git y de los PR), y deja una sección para la opinión de Andrés.
- [ ] **Video de demostración** (#39) · `humano`
  - A Andrés le toca: grabarlo. La IA prepara el guion y los datos de ejemplo.

## Después del MVP (opcionales, no se crean como issues)

- Registro e inicio de sesión de usuarios
- Historial de cambios de estado
- Alarmas de CloudWatch con aviso por correo (SNS)
- Dominio propio con HTTPS
