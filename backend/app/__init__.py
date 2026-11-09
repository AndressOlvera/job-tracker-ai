from flask import Flask

from app.api import api_v1
from app.config import load_config
from app.errors import register_error_handlers
from app.extensions import db, migrate


def create_app(env_name: str | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_mapping(load_config(env_name))

    db.init_app(app)
    migrate.init_app(app, db)

    app.register_blueprint(api_v1)
    register_error_handlers(app)
    return app
