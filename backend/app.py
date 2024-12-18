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

# Flask app setup
app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")
logging.basicConfig(level=logging.INFO)

# File paths
CODES_FILE = "codes.csv"
CHAT_LOGS_FILE = "chats.json"
FEEDBACK_FILE = "feedback.csv"

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

# Ensure necessary files exist
if not os.path.exists(CODES_FILE):
    with open(CODES_FILE, "w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["code", "role", "timestamp"])  # Header row

if not os.path.exists(CHAT_LOGS_FILE):
    with open(CHAT_LOGS_FILE, "w") as file:
        json.dump([], file)


# --- Serve React App ---
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path != "" and os.path.exists(f"static/{path}"):
        return send_from_directory("static", path)
    return send_from_directory("static", "index.html")


# --- Helper Functions ---
def generate_unique_code(digits=6):
    """
    Generate a unique code with a specified number of digits.
    """
    code = ''.join(random.choices(string.digits, k=digits))

    # Ensure the code is unique in the CSV file
    with open(CODES_FILE, "r") as file:
        existing_codes = {row[0] for row in csv.reader(file)}

    while code in existing_codes:
        code = ''.join(random.choices(string.digits, k=digits))

    return code


def load_chat_logs():
    """
    Load chat logs from the JSON file.
    """
    with open(CHAT_LOGS_FILE, "r") as file:
        content = file.read()
        return json.loads(content) if content.strip() else []


def save_chat_logs(logs):
    """
    Save chat logs to the JSON file.
    """
    with open(CHAT_LOGS_FILE, "w") as file:
        json.dump(logs, file, indent=4)


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
    print("real_a: ", real_a)
    print("real_b: ", real_b)
    print("guess_a: ", guess_a)
    print("guess_b: ", guess_b)
    if role not in ["tester", "experimenter"]:
        return jsonify({"status": "error", "message": "Invalid role"}), 400

    with code_lock:
        if name in generated_codes:
            code = generated_codes[name]
        elif role == "tester" and guess_a == real_a and guess_b == real_b:
            code = generate_unique_code(digits=7)
        else:
            code = generate_unique_code(digits=6)

        generated_codes[name] = code

        with open(CODES_FILE, "a", newline="") as file:
            writer = csv.writer(file)
            writer.writerow([code, role, time.strftime("%Y-%m-%d %H:%M:%S")])

        # Notify the experimenter
        print("pairs", pairs)
        print("pair_id", pair_id)
        print("user_sockets", user_sockets)

        experimenter_id = user_sockets.get(pairs[pair_id]["experimenter"])
        print("experimenter_id", experimenter_id)
        if experimenter_id:
            socketio.emit("bonus_code", {"bonus": code})
            print("emitted bonus code")

        return jsonify({"status": "success", "code": code})


@socketio.on("connect")
def on_connect():
    """
    Capture the user's socket connection when they connect.
    """
    logging.info(f"User connected: {request.sid}")


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

    # Check if the user is already in the queues
    if username in tester_queue or username in experimenter_queue:
        return jsonify({"status": "error", "message": "You are already waiting to be paired"}), 400

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
        tester = tester_queue.popleft()
        experimenter = experimenter_queue.popleft()

        pair_id = f"room_{random.randint(1000, 9999)}"
        pairs[pair_id] = {"tester": tester, "experimenter": experimenter}

        # Retrieve socket IDs for both users
        tester_id = user_sockets.get(tester)
        experimenter_id = user_sockets.get(experimenter)

        # Notify both users via WebSocket
        if tester_id:
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
        if experimenter_id:
            print("experimenter_id in submit_name function", experimenter_id)
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
    """
    Save chat logs to the JSON file.
    """
    chat_data = request.json
    pair_id = chat_data.get("pairId")
    title = chat_data.get("title")

    try:
        logs = load_chat_logs()

        # Check if pairId exists and update logs
        existing_entry = next((entry for entry in logs if entry["pairId"] == pair_id), None)
        new_log = {
            "title": title,
            "testerChatWithExperimenter": chat_data.get("testerChatWithExperimenter"),
            "testerChatWithBot": chat_data.get("testerChatWithBot")
        }

        if existing_entry:
            existing_entry.setdefault("logs", []).append(new_log)
        else:
            logs.append({"pairId": pair_id, "logs": [new_log]})

        save_chat_logs(logs)
        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error saving chat logs: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/save_feedback", methods=["POST"])
def save_feedback():
    """
    Save feedback to a CSV file and evaluate tester guesses.
    """
    logging.info("Received feedback data: %s", request.json)
    data = request.json

    # Normalize real identities
    if data.get("realIdentityA").lower() == "bot":
        data["realIdentityA"] = "bot"
        data["realIdentityB"] = "experimenter"
    else:
        data["realIdentityA"] = "experimenter"
        data["realIdentityB"] = "bot"

    feedback = {
        "user_id": data.get("userId"),
        "tester_name": data.get("name"),
        "experience": data.get("experience"),
        "comments": data.get("comments"),
        "improvements": data.get("improvements"),
        "guess_candidate_a": data.get("guessCandidateA"),
        "guess_candidate_b": data.get("guessCandidateB"),
        "real_identity_a": data.get("realIdentityA"),
        "real_identity_b": data.get("realIdentityB"),
        "correct_guess_a": data.get("guessCandidateA") == data.get("realIdentityA"),
        "correct_guess_b": data.get("guessCandidateB") == data.get("realIdentityB"),
    }

    # Save to CSV
    file_exists = os.path.isfile(FEEDBACK_FILE)
    with open(FEEDBACK_FILE, mode="a", newline="", encoding="utf-16") as file:
        writer = csv.DictWriter(file, fieldnames=feedback.keys())
        if not file_exists:
            writer.writeheader()
        writer.writerow(feedback)

    return jsonify({"status": "success", "message": "Feedback saved"})


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
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)
