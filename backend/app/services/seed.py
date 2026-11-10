from datetime import timedelta

from sqlalchemy import delete, func, select

from app import clock
from app.extensions import db
from app.models import Application

# Empresas inventadas y URLs en example.com (dominio reservado): la versión publicada solo
# muestra estos datos. Columnas: empresa, puesto, estado, días atrás, fuente, notas.
_SAMPLE_ROWS = [
    ("Soluciones Ficticias", "Desarrollador Backend Jr.", "interview", 2, "Portal de empleo", None),
    ("Datos de Prueba SA", "Analista de Datos", "applied", 4, "Sitio de la empresa", None),
    ("Nube Imaginaria", "Ingeniero de Nube", "applied", 7, "Portal de empleo", None),
    ("Código Inventado", "Desarrollador Full Stack", "rejected", 10, "Referido", None),
    ("Empresa Ejemplo Uno", "Becario de Software", "applied", 13, "Feria de empleo", None),
    (
        "Empresa Ejemplo Dos",
        "Soporte Técnico",
        "offer",
        18,
        "Portal de empleo",
        "Oferta de ejemplo",
    ),
    ("Logística Demo", "Analista de Sistemas", "applied", 24, "Sitio de la empresa", None),
    ("Finanzas Simuladas", "Desarrollador Python", "interview", 31, "Referido", None),
    ("Servicios Muestra", "Administrador de Bases", "applied", 38, "Portal de empleo", None),
    ("Tecnología Ficticia", "QA Jr.", "rejected", 45, "Portal de empleo", None),
    ("Comercio de Prueba", "Desarrollador Frontend", "applied", 52, "Feria de empleo", None),
    ("Salud Inventada", "Analista de BI", "interview", 60, "Sitio de la empresa", None),
    ("Energía Imaginaria", "Ingeniero DevOps Jr.", "applied", 68, "Portal de empleo", None),
    ("Educación Demo", "Desarrollador Web", "rejected", 76, "Referido", None),
    ("Empresa Ejemplo Tres", "Becario de Datos", "applied", 84, "Feria de empleo", None),
    ("Medios Simulados", "Desarrollador Móvil", "applied", 93, "Portal de empleo", None),
    ("Agencia Muestra", "Analista Programador", "interview", 102, "Portal de empleo", None),
    ("Seguros de Prueba", "Desarrollador Java Jr.", "rejected", 111, "Sitio de la empresa", None),
    ("Transporte Ficticio", "Ingeniero de Datos Jr.", "applied", 120, "Referido", None),
    ("Industria Inventada", "Soporte de Aplicaciones", "applied", 129, "Portal de empleo", None),
    ("Empresa Ejemplo Cuatro", "Becario de QA", "offer", 138, "Feria de empleo", None),
    ("Consultora Demo", "Consultor Jr.", "rejected", 147, "Portal de empleo", None),
    ("Retail Imaginario", "Desarrollador de APIs", "applied", 156, "Sitio de la empresa", None),
    ("Banca Simulada", "Analista de Seguridad Jr.", "interview", 165, "Referido", None),
]


def _sample_applications() -> list[Application]:
    today = clock.today()
    return [
        Application(
            company=company,
            position=position,
            status=status,
            applied_on=today - timedelta(days=days_ago),
            job_url=f"https://example.com/vacantes/{number}",
            source=source,
            notes=notes,
        )
        for number, (company, position, status, days_ago, source, notes) in enumerate(
            _SAMPLE_ROWS, start=1
        )
    ]


def count_applications() -> int:
    return db.session.scalar(select(func.count()).select_from(Application))


def load_sample_data(*, reset: bool = False) -> int:
    """Inserta los datos de ejemplo; con reset borra antes, en la misma transacción."""
    if reset:
        db.session.execute(delete(Application))
    rows = _sample_applications()
    db.session.add_all(rows)
    db.session.commit()
    return len(rows)
