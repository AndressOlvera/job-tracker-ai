import click
from flask import current_app
from flask.cli import with_appcontext

from app.services.seed import count_applications, load_sample_data


@click.command("seed")
@click.option("--reset", is_flag=True, help="Borra todas las postulaciones antes de cargar.")
@click.option("--yes", is_flag=True, help="No pedir confirmación de --reset en producción.")
@with_appcontext
def seed_command(reset: bool, yes: bool) -> None:
    """Carga postulaciones de ejemplo."""
    # Sin APP_ENV se asume producción: ahí --reset borraría datos reales.
    if reset and not yes and current_app.config["APP_ENV"] == "production":
        click.confirm(
            "Estás en PRODUCCIÓN: --reset borrará TODAS las postulaciones. ¿Continuar?",
            abort=True,
        )
    existing = count_applications()
    if existing and not reset:
        click.echo(
            f"La tabla ya tiene {existing} postulaciones; no se insertó nada. "
            "Usa --reset para vaciarla y volver a cargar."
        )
        return
    click.echo(f"Se cargaron {load_sample_data(reset=reset)} postulaciones de ejemplo.")
