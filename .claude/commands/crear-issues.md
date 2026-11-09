---
description: Crea en GitHub las etiquetas e issues del ROADMAP.md que todavía no existen
argument-hint: "[número de fase, opcional]"
---

Crea en GitHub, con `gh`, lo necesario para trabajar el `ROADMAP.md`.
Fase a procesar: $ARGUMENTS (si está vacío, todas las fases del 1 al 7).

1. **Revisa lo que ya existe**
   - `gh label list --limit 100`
   - `gh issue list --state all --limit 200 --json number,title,labels`

2. **Etiquetas** (crea solo las que falten, con `gh label create`):
   - `fase-1` … `fase-7`
   - Áreas: `backend`, `frontend`, `docker`, `ci`, `infra`, `docs`
   - `humano` (color rojo): necesita a Andrés en algún paso.

3. **Issues**: por cada casilla sin marcar (`- [ ]`) de las secciones "Fase N"
   (ignora la sección "Después del MVP"), crea una issue si no existe otra con el mismo título.
   - Título: el texto en negritas de la casilla.
   - Cuerpo con el formato de `.github/ISSUE_TEMPLATE/tarea.md`:
     - **Descripción**: qué hay que hacer y por qué, en 1 a 3 frases, con base en `docs/`.
     - **Listo cuando**: los criterios de la casilla como checklist. Si la casilla no tiene, escribe uno verificable.
     - **Referencias**: archivos de `docs/`, HU-xx y ADR-xxx que apliquen, y lo que le toca a Andrés si es `humano`.
   - Etiquetas: `fase-N`, el área de la fase y `humano` si la casilla lo dice.
     Áreas por fase: 1 `backend`, 2 `frontend`, 3 `docker`, 4 `ci`, 5 `infra`, 6 `infra`, 7 `docs`.
   - Escribe cada cuerpo en un archivo temporal fuera del repo (por ejemplo `/tmp/issue.md`) y usa
     `gh issue create --title "..." --body-file /tmp/issue.md --label ... --label ...`.

4. **Enlaza el roadmap**: agrega el número al final del título de cada casilla, por ejemplo
   `- [ ] **Estructura de la app Flask** (#3)`. Haz esto en una rama `docs/enlazar-issues`,
   con un commit `docs(roadmap): enlaza las casillas con sus issues`, y abre un PR.

5. Termina con una tabla (número, título, etiquetas) y el link del PR.
