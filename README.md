# Job Tracker v2 · construida con IA

La misma app que [Job Tracker](https://github.com/AndressOlvera/job-tracker), construida otra vez
desde el mismo spec, pero con agentes de IA haciendo el trabajo:

- **Claude Code** con subagentes (`.claude/agents/`), comandos (`.claude/commands/`) y hooks.
- **Sesiones en la nube** para trabajar varias fases en paralelo.
- **Claude en GitHub Actions** para issues sueltas y para revisar cada PR.
- **MCP**: documentación actual de librerías (Context7), navegador (Playwright) y AWS.

El spec está en [`docs/`](docs/), el plan en [`ROADMAP.md`](ROADMAP.md) y las reglas para los agentes en [`CLAUDE.md`](CLAUDE.md).

> Este README es temporal; la versión final se escribe en la Fase 7.
