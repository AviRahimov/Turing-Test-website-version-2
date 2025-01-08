import os
from flask_cors import CORS
from flask import Flask


# Flask app setup
def create_app():
    app = Flask(__name__, static_folder="build", static_url_path='/')

    allowed = [
        "http://localhost:5000",
        "http://localhost:3000",
        "https://localhost:5000",
        "https://localhost:3000",
        "http://0.0.0.0:5000",
        "http://0.0.0.0:3000",
        "https://0.0.0.0:5000",
        "https://0.0.0.0:3000",
        "http://3.93.242.186:5000",
        "http://3.93.242.186:3000",
        "https://3.93.242.186:5000",
        "https://3.93.242.186:3000"
    ]

    CORS(app, resources={
        r"/*": {
            "origins": "*",
            "supports_credentials": True
        }
    })

    return app, allowed
