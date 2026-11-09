---
description: Trabaja todas las issues abiertas de una fase del ROADMAP y abre un solo PR
argument-hint: "<número de fase>"
---

Trabaja la **Fase $ARGUMENTS** del `ROADMAP.md` de principio a fin. No me pidas confirmación
entre pasos; solo detente para lo que `CLAUDE.md` dice que necesita a Andrés.

## 1. Preparación

- Actualiza `main` (`git switch main && git pull`) y crea la rama `fase-$ARGUMENTS-<tema-corto>`
  (si ya existe, continúa en ella). Si estás en una sesión en la nube que ya creó su propia rama, usa esa.
- Busca las issues abiertas de la fase: `gh issue list --label fase-$ARGUMENTS --state open --json number,title,labels,body`.
  Si `gh` no está disponible, toma los números de las casillas de la Fase $ARGUMENTS en `ROADMAP.md`.
- Revisa qué existe ya en el repo: puede que otra fase haya avanzado en paralelo.
- Arma tu lista de tareas: una por issue, en el orden del roadmap, con el subagente que la hará.

## 2. Por cada issue

1. Delega la implementación al subagente del área (`backend`, `frontend` o `devops`). Pásale el número,
   el "Listo cuando" y las referencias de la issue.
2. Delega al subagente `tester` que pruebe cada criterio del "Listo cuando".
3. Corre tú los checks del área (`CLAUDE.md` → Comandos). Si algo falla, regrésalo al implementador
   con la salida exacta. Máximo 3 vueltas por issue; si sigue fallando, detente y explícame qué pasa.
4. Marca su casilla en `ROADMAP.md` y haz commit con Conventional Commits terminando en `(#número)`.
5. Si tiene la etiqueta `humano`: deja hecho todo lo que no requiera a Andrés, no marques la casilla
   y anota los pasos exactos que le tocan.

## 3. Antes del PR

- Delega al subagente `revisor` la revisión de `git diff main...HEAD`. Corrige todo lo "Importante".
- Vuelve a correr los checks de todas las áreas que tocaste.

## 4. PR

- Sube la rama (`git push -u origin <rama>`) y crea el PR con `gh pr create`, siguiendo
  `.github/pull_request_template.md`:
  - Título: `Fase $ARGUMENTS: <tema>`.
  - Una línea `Closes #n` por cada issue terminada (no pongas las `humano` pendientes).
  - Cómo se probó: comandos y resultados.
  - "Te toca a ti": los pasos de Andrés, si hay.
  Si `gh` no está disponible, sube la rama y crea el PR desde la sesión con el mismo contenido.
- Si ya existe CI para esta área, espera el resultado (`gh pr checks --watch`). Si falla, lee el log
  (`gh run view <id> --log-failed`), corrige, sube el arreglo y vuelve a esperar.

## 5. Resumen final

Responde en pocas líneas: link del PR, issues que cierra, estado de la CI y qué le toca a Andrés.
Nunca hagas merge del PR.
