---
description: Trabaja una sola issue (bug o mejora) y abre su PR
argument-hint: "<número de issue>"
---

Trabaja la issue **#$ARGUMENTS** de principio a fin, sin pedirme confirmación entre pasos.

1. Lee la issue: `gh issue view $ARGUMENTS --comments`.
2. Actualiza `main` y crea una rama con el prefijo del tipo de cambio y el número:
   `feat/`, `fix/`, `test/`, `docs/`, `ci/`, `infra/` o `chore/`, por ejemplo `fix/$ARGUMENTS-filtro-fechas`.
3. Si es un bug, primero escribe una prueba que lo reproduzca y comprueba que falla.
4. Delega la implementación al subagente del área y después al `tester`. Corre los checks del área.
5. Delega al `revisor` la revisión de `git diff main...HEAD` y corrige lo "Importante".
6. Commit con Conventional Commits terminando en `(#$ARGUMENTS)`, push y `gh pr create` con la plantilla
   y `Closes #$ARGUMENTS`. Espera la CI con `gh pr checks --watch` y corrige si falla.
7. Responde con el link del PR y un resumen de 2 o 3 líneas. Nunca hagas merge.
