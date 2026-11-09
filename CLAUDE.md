# Job Tracker v2 (construida con IA)

App full-stack para dar seguimiento a postulaciones de empleo. Es la misma app que
`AndressOlvera/job-tracker` (v1), pero esta vez la construyen agentes de IA a partir
de la especificación en `docs/`. Andrés define, revisa y aprueba; tú implementas.

## Fuente de verdad

- Requisitos e historias de usuario (HU-xx): `docs/01-requisitos.md`
- Modelo de datos: `docs/02-modelo-de-datos.md`
- API (rutas, validaciones, formato de errores): `docs/03-api.md`
- Pantallas: `docs/04-pantallas.md`
- Decisiones de diseño (ADR-001 a ADR-024): `docs/05-decisiones.md`
- Plan de trabajo: `ROADMAP.md`. Cada casilla es una issue de GitHub; su "Listo cuando" es el criterio de aceptación.

Respeta los ADR. Si algo te obliga a contradecir uno, no lo cambies en silencio:
agrega un ADR nuevo al final de `docs/05-decisiones.md` y explícalo en el PR.
Si el spec no dice algo, elige la opción más simple y anótala en el PR.

## Stack

- `backend/`: Python 3.13, Flask (application factory), SQLAlchemy 2, Alembic (Flask-Migrate), Pydantic, Gunicorn. PostgreSQL 16.
- `frontend/`: React + TypeScript con Vite, React Router, TanStack Query, CSS Modules. Node 24 (`frontend/.nvmrc`).
- `e2e/`: Playwright.
- `infra/`: Terraform (>= 1.11) y AWS en `us-east-1`.
- Calidad: ruff (backend); ESLint, Prettier y `tsc` (frontend); SonarQube Cloud.

## Comandos

Crea cada parte para que funcionen estos comandos. Si cambias alguno, actualiza esta sección en el mismo PR.

Backend (desde `backend/`, con `.venv` activo):
- Instalar: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt`
- Revisar: `ruff check . && ruff format --check .`
- Probar: `pytest` (cobertura mínima 80 %). Necesita PostgreSQL: `docker compose up -d db` desde la raíz.
- Datos de ejemplo: `flask seed` (no inserta si ya hay filas; `flask seed --reset` vacía la tabla y vuelve a cargar).
- `flask` en local necesita `APP_ENV=development` (en el entorno o en `.env`); sin esa variable se asume producción.

Frontend (desde `frontend/`):
- `npm ci`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`

E2E (desde la raíz y luego `e2e/`):
- `docker compose up -d --build`, después `npx playwright test`

Infra (desde `infra/` o `infra/bootstrap/`):
- `terraform fmt -check -recursive`, `terraform validate`

## Cómo se trabaja

- Una rama y un PR por fase (`fase-1-backend`) o por issue suelta (`fix/23-filtro-fechas`). Nunca push directo a `main` ni force push.
- Commits pequeños con Conventional Commits en español, terminando con el número de issue:
  `feat(api): agrega endpoint de estadísticas (#12)`.
- El PR usa `.github/pull_request_template.md` y lleva una línea `Closes #n` por cada issue que termina.
- En el mismo PR marca la casilla en `ROADMAP.md` y actualiza la documentación si cambió algo.
- Antes de abrir el PR corre los checks de todo lo que tocaste. No abras un PR en rojo.
- Nunca hagas merge de un PR: eso lo decide Andrés.
- Issues con la etiqueta `humano` necesitan a Andrés (aplicar en AWS, crear cuentas o secretos, grabar video).
  Deja hecho todo lo demás y escribe en el PR los pasos exactos que le tocan, en la sección "Te toca a ti".

## Subagentes (`.claude/agents/`)

- `backend`, `frontend`, `devops` (Docker, CI, Terraform): implementan en su área.
- `tester`: escribe y corre las pruebas de los criterios "Listo cuando".
- `revisor`: revisa el diff antes del PR. Solo lee.

Para cada issue: implementador → tester → checks. Antes del PR: revisor. Corrige todo lo que marque como "Importante".

## Trabajo en paralelo sin choques

Varias fases pueden avanzar al mismo tiempo en sesiones distintas. Para no pisarse:
- Cada fase toca solo su carpeta (`backend/`, `frontend/`, `e2e/`, `infra/`).
- Un workflow por área: `.github/workflows/ci-backend.yml`, `ci-frontend.yml`, `e2e.yml`, `sonarqube.yml`, `deploy.yml`.
  Nombres de los jobs: `Backend`, `Frontend`, `E2E`, `SonarQube` (la protección de `main` los exige por nombre).
- En archivos compartidos de la raíz (`README.md`, `docker-compose.yml`, `.env.example`, `ROADMAP.md`) cambia solo tu parte.

## AWS

La v1 vive en la misma cuenta de AWS, así que la v2 tiene estas reglas, que mandan sobre los ADR:
- Donde los ADR dicen `job-tracker-...` (rol, instancia, buckets, ECR, parámetros de SSM, etiquetas), en la v2 usa `job-tracker-ai-...`.
- El estado de Terraform va en el bucket que ya existe de la v1, `job-tracker-tfstate-<número de cuenta>`, con la llave
  `job-tracker-ai/terraform.tfstate`. No crees otro bucket.
- El proveedor OIDC de GitHub (`token.actions.githubusercontent.com`) ya existe en la cuenta. Léelo con
  `data "aws_iam_openid_connect_provider"`; no lo crees. Sí crea un rol nuevo que solo pueda asumir
  `AndressOlvera/job-tracker-ai` desde `main` (ADR-023).
- Tamaños de capa gratuita: `t3.micro` para EC2 y `db.t4g.micro` para RDS.
- Nunca corras `terraform apply`, `terraform destroy` ni comandos de AWS que cambien recursos sin que Andrés lo
  apruebe en ese momento. `fmt`, `validate`, `plan` y consultas de solo lectura sí.
- Nunca escribas llaves ni contraseñas en el código, en Git ni en el estado de Terraform (ADR-019, ADR-022, ADR-023).

## Estilo

- Nombres de código en inglés; comentarios, documentación, commits y PR en español.
- Textos que ve el usuario de la app, en español.
- Comentarios cortos que expliquen el porqué, no el qué.
