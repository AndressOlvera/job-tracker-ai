import click
from flask.cli import with_appcontext

from app.services.seed import count_applications, load_sample_data


@click.command("seed")
@click.option("--reset", is_flag=True, help="Borra todas las postulaciones antes de cargar.")
@with_appcontext
def seed_command(reset: bool) -> None:
    """Carga postulaciones de ejemplo."""
    existing = count_applications()
    if existing and not reset:
        click.echo(
            f"La tabla ya tiene {existing} postulaciones; no se insertó nada. "
            "Usa --reset para vaciarla y volver a cargar."
        )
        return
    click.echo(f"Se cargaron {load_sample_data(reset=reset)} postulaciones de ejemplo.")
