#!/usr/bin/env bash
# Formatea el archivo que Claude acaba de crear o editar (hook PostToolUse).
# Solo da formato: no corrige imports ni reglas del linter, porque a mitad de un cambio
# un import todavía sin usar es normal. Nunca bloquea: si falta una herramienta, no hace nada.

raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Claude Code manda los datos del evento como JSON por la entrada estándar.
archivo=$(python3 -c 'import json, sys; print(json.load(sys.stdin).get("tool_input", {}).get("file_path", ""))' 2>/dev/null)

if [ -z "$archivo" ] || [ ! -f "$archivo" ]; then
  exit 0
fi

case "$archivo" in
  "$raiz"/backend/*.py)
    ruff="$raiz/backend/.venv/bin/ruff"
    [ -x "$ruff" ] || ruff=$(command -v ruff)
    [ -n "$ruff" ] && "$ruff" format --quiet "$archivo"
    ;;
  "$raiz"/frontend/*.ts | "$raiz"/frontend/*.tsx | "$raiz"/frontend/*.css | "$raiz"/frontend/*.json | \
  "$raiz"/e2e/*.ts)
    prettier="$raiz/frontend/node_modules/.bin/prettier"
    [ -x "$prettier" ] && "$prettier" --write --log-level warn "$archivo"
    ;;
  *.tf)
    command -v terraform >/dev/null && terraform fmt "$archivo" >/dev/null
    ;;
esac

exit 0
