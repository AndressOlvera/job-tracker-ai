import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db

logger = logging.getLogger(__name__)


def database_is_reachable() -> bool:
    try:
        with db.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.warning("No hay conexión con la base de datos.", exc_info=True)
        return False
    return True
