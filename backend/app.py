import os
import string
import time
from datetime import datetime, timedelta
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

load_dotenv()
# Get the connection string from the environment variable
MONGODB_URI = os.getenv("MONGODB_URI")

# MongoDB connection
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = client['turing_test_db']  # database name

# Flask app setup
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
app = Flask(__name__, static_folder="build", static_url_path='/')
# app = Flask(__name__)  # For local testing

CORS(app, resources={
    r"/*": {
        "origins": "*",
        "supports_credentials": True
    }
})

socketio = SocketIO(app,
                    cors_allowed_origins=allowed,
                    logging=True,
                    ping_timeout=5000,
                    ping_interval=25000)
logging.basicConfig(level=logging.INFO)

# Collections instead of files
codes_collection = db['codes']
chats_collection = db['chats']
feedback_collection = db['feedback']
demographic_collection = db['demographic_data']
blocked_ips_collection = db['blocked_ips']
room_numbers_collection = db['room_numbers']

# Fetch and print collections stored in the database
collection_names = db.list_collection_names()

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

# Add a counter for unique user IDs
user_counter = 0
user_lock = Lock()


@socketio.on('check_ip')
def handle_check_ip(data):
    ip_address = data['ip']
    blocked_ip = blocked_ips_collection.find_one({"ip": ip_address})
    if blocked_ip:
        blocked_at = blocked_ip.get("blocked_at")
        if blocked_at:
            blocked_duration = datetime.now() - blocked_at
            if blocked_duration < timedelta(days=1):  # Block for one day
                socketio.emit('ip_blocked', 'You have already participated.')
                return
            else:
                # Unblock the IP after 1 day
                blocked_ips_collection.delete_one({"ip": ip_address})
    # Log the IP address
    blocked_ips_collection.update_one(
        {"ip": ip_address},
        {"$set": {"blocked_at": datetime.now()}},
        upsert=True
    )


@app.route('/api/unblock_ip', methods=['POST'])
def unblock_ip():
    data = request.json
    ip = data.get('ip')

    if not ip:
        return jsonify({'status': 'error', 'message': 'No IP provided'}), 400

    try:
        # Remove the IP from the blocked IPs collection
        blocked_ips_collection = db['blocked_ips']
        blocked_ips_collection.delete_one({'ip': ip})

        return jsonify({
            'status': 'success',
            'message': 'IP unblocked successfully'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


# --- Serve React App ---
# Handle all other routes (for React client-side routing)
@app.route('/<path:path>')
def serve_static_files(path):
    try:
        # Try to serve the requested file from the React build folder
        return send_from_directory(app.static_folder, path)
    except FileNotFoundError:
        # If file is not found, serve React's index.html (for client-side routing)
        return send_from_directory(app.static_folder, 'index.html')


# --- Helper Functions ---
def generate_unique_code(digits=6):
    """Generate a unique code with a specified number of digits."""
    while True:
        code = ''.join(random.choices(string.digits, k=digits))
        # Check if code exists in MongoDB
        if not codes_collection.find_one({"code": code}):
            return code


def get_unique_user_id():
    global user_counter
    with user_lock:
        user_counter += 1
        return user_counter


# --- Routes ---
@app.route("/")
def home():
    return app.send_static_file('index.html')


@app.route("/api/generate_code", methods=["POST"])
def generate_code():
    data = request.json
    role = data.get("role")
    userId = data.get("userId")
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
            "userId": userId,
            "pairId": pair_id
        })

        if existing_code:
            code = existing_code["code"]
        # Handle case where guesses are None (experimenter waiting scenario)
        elif role == "experimenter" or guess_a is None or guess_b is None:
            code = generate_unique_code(digits=6)
        elif role == "tester" and guess_a == real_a and guess_b == real_b:
            code = generate_unique_code(digits=7)
        else:
            code = generate_unique_code(digits=6)

        # Save to MongoDB
        code_data = {
            "code": code,
            "role": role,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "pairId": pair_id,
        }

        # Insert new document instead of update
        codes_collection.insert_one(code_data)

        # Store in memory for quick lookup
        # generated_codes[name] = code

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


@socketio.on('quiz_completed')
def handle_quiz_completed(data):
    logging.info(f"Quiz completed: {data}")
    pair_id = data.get('pair_id')
    role = data.get('role')
    emit('quiz_completed', {'role': role}, room=pair_id)


@socketio.on('quiz_failed')
def handle_quiz_failed(data):
    logging.info(f"Quiz failed: {data}")
    pair_id = data.get('pair_id')
    role = data.get('role')
    emit('quiz_failed', {'role': role}, room=pair_id)


@socketio.on("participant_inactivity_warning")
def handle_inactivity_warning(data):
    print("Received inactivity warning:", data)  # Debug log
    pair_id = data.get("pair_id")
    role = data.get("role")
    emit("inactivity_warning", {"role": role}, room=pair_id)
    print(f"Sent inactivity warning to room {pair_id}")  # Debug log


@socketio.on("participant_banned")
def handle_participant_ban(data):
    print("Received participant ban:", data)  # Debug log
    pair_id = data.get("pair_id")
    role = data.get("role")
    emit("participant_banned", {"role": role}, room=pair_id)
    print(f"Sent ban notification to room {pair_id}")  # Debug log


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
    Register the user with a unique ID upon connection.
    """
    unique_id = get_unique_user_id()
    print("unique_id", unique_id)
    username = f"user_{unique_id}"
    if username and username in user_sockets:
        logging.warning(f"User {username} is already connected.")
        return  # Do not re-register

    if username:
        user_sockets[username] = request.sid
        logging.info(f"Registered user {username} with socket ID {request.sid}")
        emit('user_registered', {'username': username, 'user_id': unique_id})


@app.route("/api/save_demographics", methods=["POST"])
def save_demographics():
    data = request.json
    user_id = data.get("user_id")
    gender = data.get("gender")
    age = data.get("age")
    education = data.get("education")
    employment = data.get("employment")
    country = data.get("country")
    ai_experience = data.get("aiExperience")

    demographic_data = {
        "user_id": user_id,
        "gender": gender,
        "age": age,
        "education": education,
        "employment": employment,
        "country": country,
        "ai_experience": ai_experience,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    try:
        demographic_collection.insert_one(demographic_data)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        logging.error(f"Error saving demographic data: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


def generate_unique_room_number():
    while True:
        # Generate a random room number
        room_number = random.randint(1000, 9999)
        pair_id = f"room_{room_number}"

        # Check if the room number already exists in the collection
        if not room_numbers_collection.find_one({"pair_id": pair_id}):
            # If it doesn't exist, insert it with a timestamp
            room_numbers_collection.insert_one({
                "pair_id": pair_id,
            })
            return pair_id


@app.route("/api/submit_name", methods=["POST"])
def submit_name():
    """
    Handle user submission and automatically assign roles to pair testers and experimenters.
    """
    data = request.json
    logging.info(f"Received name submission data: {data}")
    username = data.get("username")
    unique_id = data.get("user_id")

    if not username or not unique_id:
        return jsonify({"status": "error", "message": "Invalid username or user ID"}), 400

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

                pair_id = generate_unique_room_number()
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
        "username": data.get("username"),
        "userId": data.get("userId"),
        "pairId": data.get("pairId"),
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

        print("user_id string: ", data.get("username"))
        # Add pair_id to demographic collection
        demographic_collection.update_one(
            {"user_id": data.get("username")},
            {"$set": {"pair_id": data.get("pairId")}}
        )

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
    logging.info(f"[JOIN] Joining room with data: {data}")
    pair_id = data.get("pair_id")
    role = data.get("role")

    if not pair_id:
        logging.error("[JOIN] Invalid join request: Missing pair_id")
        return

    try:
        join_room(pair_id)
        emit(
            "joined_room",
            {"pair_id": pair_id, "role": role},
            to=pair_id,
        )
        logging.info(f"[JOIN] User with role {role} joined room {pair_id}")
    except Exception as e:
        logging.error(f"[JOIN] Error joining room {pair_id}: {str(e)}")


@socketio.on("experimenter_ready")
def handle_experimenter_ready(data):
    pair_id = data.get("pair_id")
    emit("experimenter_ready", {"status": "ready"}, room=pair_id)


@socketio.on("tester_guessed")
def handle_tester_guessed(data):
    pair_id = data.get("pair_id")
    emit("bonus_code", {"bonus": generate_unique_code()}, room=pair_id)


@socketio.on("message")
def handle_message(data):
    """
    Handle messages sent between users.
    """
    pair_id = data["pair_id"]
    sender = data["sender"]
    message = data["message"]
    emit("message", {"sender": sender, "message": message}, to=pair_id)


@socketio.on('disconnect')
def on_disconnect(data):
    """ Handle user disconnections. """
    sid = request.sid
    username = next((u for u, s in user_sockets.items() if s == sid), None)
    if username:
        logging.info(f"User {username} disconnected")
        user_sockets.pop(username, None)

        with pairing_lock:  # Ensure thread safety
            if username in tester_queue:
                tester_queue.remove(username)
            if username in experimenter_queue:
                experimenter_queue.remove(username)

            # Check if the disconnected user was paired
            for pair_id, pair in pairs.items():
                if pair['tester'] == username or pair['experimenter'] == username:
                    logging.info(f"User {username} was in pair {pair_id}, updating status")

                    # Notify the other user that their partner has disconnected
                    other_user = pair['experimenter'] if pair['tester'] == username else pair['tester']
                    other_user_id = user_sockets.get(other_user)

                    if other_user_id:
                        socketio.emit('partner_disconnected',
                                      {'message': 'Your partner has disconnected. Please wait for a new partner.'},
                                      room=other_user_id)

                    # Remove the pair
                    del pairs[pair_id]
                    break


if __name__ == "__main__":
    socketio.run(app,
                 debug=True,
                 host='0.0.0.0',  # Disable for testing locally
                 port=5000,
                 allow_unsafe_werkzeug=True)
