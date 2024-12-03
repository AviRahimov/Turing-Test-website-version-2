from flask import Flask, request, jsonify
from flask_socketio import SocketIO, join_room, leave_room, emit
from flask_cors import CORS
import random
import string
import time
import logging
app = Flask(__name__)
CORS(app)  # Allow React to communicate with Flask
socketio = SocketIO(app, cors_allowed_origins="*")
logging.basicConfig(level=logging.INFO)

waiting_user = None
pairs = {}


@app.route('/api/submit_name', methods=['POST'])
def submit_name():
    global waiting_user, pairs
    data = request.json
    username = data.get('username')

    if not username:
        return jsonify({"status": "error", "message": "Invalid username"}), 400

    if waiting_user is None:
        # First user waits for pairing
        waiting_user = username
        return jsonify({"status": "waiting", "message": "Waiting for another user"})
    else:
        # Pair users and create a new room
        pair_id = f"room_{random.randint(1000, 9999)}"
        pairs[pair_id] = {"tester": waiting_user, "experimenter": username}

        # Notify the waiting user (tester) to start the chat
        socketio.emit('paired', {"pair_id": pair_id, "role": "tester"}) # it was to=waiting_user but it was not working so I omit it

        # Clear waiting_user after pairing
        waiting_user = None

        # Respond to the experimenter
        return jsonify({"status": "paired", "pair_id": pair_id, "role": "experimenter"})


@app.route('/')
def home():
    return "Backend is running!"


# @app.route("/api/pair_status/<string:username>", methods=["GET"])
# def pair_status(username):
#     """Check if a user has been paired."""
#     for pair_id, details in pairings.items():
#         if details["tester"] == username or details["experimenter"] == username:
#             return jsonify({"status": "paired", "pair_id": pair_id, "role": "tester" if details["tester"] == username else "experimenter"})
#     return jsonify({"status": "waiting"}), 200
#
#
# @app.route("/api/generate_code", methods=["GET"])
# def generate_code():
#     """Generate a unique 6-digit code for Mechanical Turk verification."""
#     code = ''.join(random.choices(string.digits, k=6))
#     return jsonify({"code": code})


@socketio.on('join')
def on_join(data):
    print("data received: ", data)
    print("pairs: ", pairs)
    username = data['username']
    # pair_id = pairs.get(0)
    pair_id = data['pair_id'] # gives an error
    join_room(pair_id)
    emit('joined_room', {'username': username, 'pair_id': pair_id}, to=pair_id)


@socketio.on('message')
def handle_message(data):
    pair_id = data['pair_id']
    sender = data['sender']
    message = data['message']
    emit('message', {'sender': sender, 'message': message}, to=pair_id)


if __name__ == '__main__':
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)
