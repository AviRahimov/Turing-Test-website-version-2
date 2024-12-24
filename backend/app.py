import os
import string
import time
from collections import deque
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, join_room, emit
from flask_cors import CORS
from flask import send_from_directory
import random
import logging
import csv
import json
from threading import Lock
from pymongo import MongoClient
from dotenv import load_dotenv

# Flask app setup
app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:3000"],
        "supports_credentials": True
    }
})

socketio = SocketIO(app,
                    cors_allowed_origins="http://localhost:3000",
                    ping_timeout=5000,
                    ping_interval=25000)
logging.basicConfig(level=logging.INFO)

# Replace the MongoDB connection part with:
load_dotenv()
MONGODB_URI = os.getenv('MONGODB_URI')

# MongoDB connection
client = MongoClient(MONGODB_URI)
db = client['turing_test_db']  # database name

# Collections instead of files
codes_collection = db['codes']
chats_collection = db['chats']
feedback_collection = db['feedback']

# Initialize queues and state
tester_queue = deque()
experimenter_queue = deque()
pairs = {}

# Dictionary to map usernames to socket IDs
user_sockets = {}

# Dictionary to store generated codes
generated_codes = {}

# Lock to ensure thread safety
code_lock = Lock()
pairing_lock = Lock()
active_connections = {}


# --- Serve React App ---
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path != "" and os.path.exists(f"static/{path}"):
        return send_from_directory("static", path)
    return send_from_directory("static", "index.html")


# --- Helper Functions ---
def generate_unique_code(digits=6):
    """Generate a unique code with a specified number of digits."""
    while True:
        code = ''.join(random.choices(string.digits, k=digits))
        # Check if code exists in MongoDB
        if not codes_collection.find_one({"code": code}):
            return code


# --- Routes ---
@app.route("/")
def home():
    return "Backend is running!"


@app.route("/api/generate_code", methods=["POST"])
def generate_code():
    data = request.json
    role = data.get("role")
    name = data.get("name")
    pair_id = data.get("pairId")
    guess_a = data.get("guessCandidateA")
    guess_b = data.get("guessCandidateB")
    real_a = data.get("realIdentityA")
    real_b = data.get("realIdentityB")

    if role not in ["tester", "experimenter"]:
        return jsonify({"status": "error", "message": "Invalid role"}), 400

    with code_lock:
        # Check if code already exists for this name and pair_id
        existing_code = codes_collection.find_one({
            "name": name,
            "pairId": pair_id
        })

        if existing_code:
            code = existing_code["code"]
        elif role == "tester" and guess_a == real_a and guess_b == real_b:
            code = generate_unique_code(digits=7)
        else:
            code = generate_unique_code(digits=6)

        # Save to MongoDB
        code_data = {
            "code": code,
            "role": role,
            "name": name,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "pairId": pair_id,
        }

        # Insert new document instead of update
        codes_collection.insert_one(code_data)

        # Store in memory for quick lookup
        generated_codes[name] = code

        # Notify the experimenter
        experimenter_id = user_sockets.get(pairs[pair_id]["experimenter"])
        print("experimenter_id", experimenter_id)
        if experimenter_id:
            socketio.emit("bonus_code", {"bonus": code})
            print("emitted bonus code")

        return jsonify({"status": "success", "code": code})


@socketio.on('notification_dismissed')
def handle_notification_dismissed(data):
    pair_id = data.get('pair_id')
    role = data.get('role')
    emit('notification_dismissed', {'role': role}, room=pair_id)


# Update the socket connection event handler
@socketio.on("connect")
def on_connect():
    """
    Handle new socket connections
    """
    logging.info(f"User connected with SID: {request.sid}")
    emit('connect_response', {'status': 'connected'})


# Update the socket error handler
@socketio.on_error()
def error_handler(e):
    """
    Handle socket errors
    """
    logging.error(f"SocketIO error: {str(e)}")
    emit('error', {'error': str(e)})


@socketio.on("register_user")
def register_user(data):
    """
    Register the username with the socket ID upon connection.
    """
    username = data.get("username")
    if username and username in user_sockets:
        logging.warning(f"User {username} is already connected.")
        return  # Do not re-register

    if username:
        user_sockets[username] = request.sid
        logging.info(f"Registered user {username} with socket ID {request.sid}")


@app.route("/api/submit_name", methods=["POST"])
def submit_name():
    """
    Handle user submission and automatically assign roles to pair testers and experimenters.
    """
    print("submit_name")
    data = request.json
    username = data.get("username")

    if not username:
        return jsonify({"status": "error", "message": "Invalid username"}), 400

    with pairing_lock:  # Use the existing lock for thread safety
        # Check if the user's socket is connected
        if username not in user_sockets:
            return jsonify({"status": "error", "message": "Socket connection not established"}), 400

        # Check if the user is already in the queues
        if username in tester_queue or username in experimenter_queue:
            return jsonify({"status": "waiting", "message": "You are already waiting to be paired"}), 200

        # Automatic role assignment
        role = None
        if not tester_queue:
            # First user becomes the Tester
            tester_queue.append(username)
            role = "tester"
        elif not experimenter_queue:
            # Second user becomes the Experimenter
            experimenter_queue.append(username)
            role = "experimenter"
        else:
            # If both queues are already full, return a waiting response
            return jsonify({"status": "waiting", "message": "Waiting for another user to connect"}), 200

        # Attempt to pair users if both queues are filled
        if tester_queue and experimenter_queue:
            tester = tester_queue[0]  # Don't pop yet
            experimenter = experimenter_queue[0]  # Don't pop yet

            # Get socket IDs for both users
            tester_id = user_sockets.get(tester)
            experimenter_id = user_sockets.get(experimenter)

            # Only proceed if both users have valid socket connections
            if tester_id and experimenter_id:
                # Now it's safe to remove from queues
                tester_queue.popleft()
                experimenter_queue.popleft()

                pair_id = f"room_{random.randint(1000, 9999)}"
                pairs[pair_id] = {"tester": tester, "experimenter": experimenter}

                # Emit to both users
                socketio.emit(
                    "paired",
                    {
                        "pair_id": pair_id,
                        "role": "tester",
                        "user_id": tester_id,
                        "username": tester,
                    },
                    to=tester_id,
                )
                socketio.emit(
                    "paired",
                    {
                        "pair_id": pair_id,
                        "role": "experimenter",
                        "user_id": experimenter_id,
                        "username": experimenter,
                    },
                    to=experimenter_id,
                )

                logging.info(
                    f"Paired {tester} (ID: {tester_id}) with {experimenter} (ID: {experimenter_id}) in room {pair_id}"
                )
                return jsonify(
                    {
                        "status": "paired",
                        "pair_id": pair_id,
                        "users": [
                            {
                                "username": tester,
                                "role": "tester",
                                "user_id": tester_id,
                            },
                            {
                                "username": experimenter,
                                "role": "experimenter",
                                "user_id": experimenter_id,
                            },
                        ],
                    }
                ), 200

        # If pairing wasn't possible, inform the user to wait
        return jsonify({"status": "waiting", "message": "Waiting for another user to connect"}), 200


@app.route("/api/save_chat", methods=["POST"])
def save_chat():
    """Save chat logs to MongoDB."""
    chat_data = request.json
    pair_id = chat_data.get("pairId")
    title = chat_data.get("title")

    try:
        # Create new chat log
        new_log = {
            "pairId": pair_id,
            "title": title,
            "testerChatWithExperimenter": chat_data.get("testerChatWithExperimenter"),
            "testerChatWithBot": chat_data.get("testerChatWithBot"),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }

        # Insert into MongoDB
        chats_collection.insert_one(new_log)

        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error saving chat logs: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/save_feedback", methods=["POST"])
def save_feedback():
    """Save feedback to MongoDB."""
    logging.info("Received feedback data: %s", request.json)
    data = request.json

    # Normalize real identities
    if data.get("realIdentityA", "").lower() == "bot":
        real_identity_a = "bot"
        real_identity_b = "experimenter"
    else:
        real_identity_a = "experimenter"
        real_identity_b = "bot"

    feedback = {
        "userId": data.get("userId"),
        "pairId": data.get("pairId"),
        "testerName": data.get("name"),
        "experience": data.get("experience"),
        "comments": data.get("comments"),
        "improvements": data.get("improvements"),
        "guessCandidateA": data.get("guessCandidateA"),
        "guessCandidateB": data.get("guessCandidateB"),
        "realIdentityA": real_identity_a,
        "realIdentityB": real_identity_b,
        "correctGuessA": data.get("guessCandidateA") == real_identity_a,
        "correctGuessB": data.get("guessCandidateB") == real_identity_b,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    try:
        # Save to MongoDB
        feedback_collection.insert_one(feedback)
        return jsonify({"status": "success", "message": "Feedback saved"})
    except Exception as e:
        logging.error(f"Error saving feedback: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/verify_code", methods=["POST"])
def verify_code():
    try:
        code = request.json.get("code")
        # Query MongoDB for the code
        code_doc = codes_collection.find_one({"code": code})

        return jsonify({
            "status": "success",
            "valid": bool(code_doc)
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --- Socket.IO Handlers ---
@socketio.on("join")
def on_join(data):
    """
    Handle user joining a room.
    """
    logging.info(f"Joining room with data: {data}")
    pair_id = data.get("pair_id")
    username = data.get("username", "unknown")
    user_id = data.get("user_id")

    if not pair_id:
        logging.error("Invalid join request: Missing pair_id.")
        return

    try:
        join_room(pair_id)
        emit(
            "joined_room",
            {"username": username, "pair_id": pair_id, "user_id": user_id},
            to=pair_id,
        )
        logging.info(f"User {username} (ID: {user_id}) joined room {pair_id}")
    except Exception as e:
        logging.error(f"Error joining room {pair_id}: {e}")


@socketio.on("experimenter_ready")
def handle_experimenter_ready(data):
    """
    Handle when experimenter is ready and notify tester
    """
    pair_id = data.get("pair_id")
    logging.info(f"Experimenter ready in room {pair_id}")
    # Emit to everyone in the room
    emit("experimenter_ready", {"status": "ready"}, room=pair_id)


@socketio.on("message")
def handle_message(data):
    """
    Handle messages sent between users.
    """
    pair_id = data["pair_id"]
    sender = data["sender"]
    message = data["message"]
    emit("message", {"sender": sender, "message": message}, to=pair_id)


@socketio.on("disconnect")
def on_disconnect():
    """
    Handle user disconnection.
    """
    sid = request.sid
    username = next((u for u, s in user_sockets.items() if s == sid), None)

    if username:
        logging.info(f"User {username} disconnected")
        user_sockets.pop(username, None)
        if username in tester_queue:
            tester_queue.remove(username)
        if username in experimenter_queue:
            experimenter_queue.remove(username)


if __name__ == "__main__":
    socketio.run(app,
                 debug=True,
                 host='0.0.0.0',
                 port=5000,
                 allow_unsafe_werkzeug=True)
