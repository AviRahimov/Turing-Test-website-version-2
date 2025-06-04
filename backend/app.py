import os
import string
import time
from datetime import datetime, timedelta
from collections import deque
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, join_room, emit, disconnect
from flask_cors import CORS
from flask import send_from_directory
import random
import logging
import csv
import json
from threading import Lock, Thread
from pymongo import MongoClient
from dotenv import load_dotenv
import json
import requests
import flask

# Import from prompts module
from prompts import create_system_prompt, WAKEUP_SYSTEM_INSTRUCTION

load_dotenv()
# Get the connection string from the environment variable
MONGODB_URI = os.getenv("MONGODB_URI")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "meta-llama/llama-3.1-405b-instruct"
# OPENROUTER_MODEL = "deepseek/deepseek-r1:free"
# OPENROUTER_MODEL = "openai/gpt-4.5-preview"
BOT_ENABLE_PROMPT = True
SHUFFLE_ENABLED = False  # Should match frontend config - set to False to skip shuffle phase

# MongoDB connection
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = client['advanced_turing_test_db']  # database name

# Flask app setup
allowed = ["http://localhost:3000", "http://54.89.200.237:5000", "*"]
app = Flask(__name__, static_folder="build", static_url_path='/')

CORS(app, resources={
    r"/*": {
        "origins": "*",
        "supports_credentials": True
    }
})

socketio = SocketIO(app,
                    cors_allowed_origins=allowed,
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

# Timer state for each pair
pair_timers = {}
pair_quiz_status = {}  # Track quiz completion status for each pair
pair_review_status = {}  # Track conversation review completion status for each pair
SHUFFLE_TIMER_DURATION = 300  # 30 seconds shuffle timer (5 minutes in production)
REAL_TEST_DURATION = 300  # 40 seconds real test timer (5 minutes in production)


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


@app.route('/api/chat_with_bot', methods=['POST'])
def chat_with_bot():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    conversation_messages_for_api_turn = data.get('conversationMessages')  # Renamed for clarity
    bot_base_persona_details = data.get('botBasePersonaDetails')
    is_wakeup_message = data.get('isWakeupMessage', False)
    enable_prompt_flag = BOT_ENABLE_PROMPT  # Using backend config    # Contextual histories for system prompt generation
    conversation_to_continue = data.get('conversationToContinueHistory')
    original_tester_bot_chat = data.get('originalTesterBotHistory')
    displayed_demographics = data.get('displayedDemographicsForSystemPrompt')    # Debug logging    logging.info(f"🔍 chat_with_bot: Received conversation_messages_for_api_turn length: {len(conversation_messages_for_api_turn) if conversation_messages_for_api_turn else 0}")
    logging.info(f"🔍 chat_with_bot: conversation_to_continue length: {len(conversation_to_continue) if conversation_to_continue else 0}")
    logging.info(f"🔍 chat_with_bot: original_tester_bot_chat length: {len(original_tester_bot_chat) if original_tester_bot_chat else 0}")
    logging.info(f"🔍 chat_with_bot: displayed_demographics: {displayed_demographics}")
    logging.info(f"🔍 chat_with_bot: bot_base_persona_details: {bot_base_persona_details}")
    
    # Determine if this is post-shuffle based on displayed_demographics
    is_post_shuffle = displayed_demographics is not None
    logging.info(f"🔍 chat_with_bot: is_post_shuffle: {is_post_shuffle}")
    
    # NEW DEBUG: Check if displayed_demographics contains human data
    if displayed_demographics:
        logging.info(f"🔧 DEMOGRAPHICS DEBUG: Source = {displayed_demographics.get('source', 'unknown')}")
        if displayed_demographics.get('source') == 'human-participant-demographics':
            logging.info(f"🔧 ✅ RECEIVED HUMAN DEMOGRAPHICS: {displayed_demographics}")
        elif displayed_demographics.get('source') == 'fixed-bot-profile':
            logging.info(f"🔧 ❌ RECEIVED FIXED BOT DEMOGRAPHICS (THIS IS THE PROBLEM): {displayed_demographics}")
        else:
            logging.info(f"🔧 ⚠️ RECEIVED UNKNOWN DEMOGRAPHICS SOURCE: {displayed_demographics}")
    else:
        logging.info(f"🔧 No displayed_demographics provided (likely pre-shuffle)")
    
    # Debug the original data types
    logging.info(f"🔧 conversation_to_continue type: {type(conversation_to_continue)}")
    logging.info(f"🔧 original_tester_bot_chat type: {type(original_tester_bot_chat)}")
    logging.info(f"🔧 displayed_demographics type: {type(displayed_demographics)}")

    if not conversation_messages_for_api_turn or not isinstance(conversation_messages_for_api_turn, list):
        return jsonify({"error": "Missing or invalid 'conversationMessages'"}), 400
    if not bot_base_persona_details or not isinstance(bot_base_persona_details, dict):
        return jsonify({"error": "Missing or invalid 'botBasePersonaDetails'"}), 400

    if not OPENROUTER_API_KEY:
        logging.error("SERVER_ERROR: OPENROUTER_API_KEY is not configured on the backend.")
        return jsonify({"error": "Bot service is not configured correctly on the server."}), 500

    api_payload_messages = []
    system_prompt_object = None

    try:
        if is_wakeup_message:
            system_prompt_object = {"role": "system", "content": WAKEUP_SYSTEM_INSTRUCTION}
        elif enable_prompt_flag:
            if not all(k in bot_base_persona_details for k in ['name', 'gender', 'age']):
                logging.warning("BOT_CHAT_ROUTE: botBasePersonaDetails missing name, gender, or age for system prompt.")
            else:
                system_prompt_object = create_system_prompt(
                    bot_base_name=bot_base_persona_details.get('name'),
                    bot_base_gender=bot_base_persona_details.get('gender'),
                    bot_base_age=bot_base_persona_details.get('age'),
                    bot_base_occupation=bot_base_persona_details.get('occupation', "Student"),
                    bot_base_country=bot_base_persona_details.get('country', "USA"),
                    bot_base_ai_experience=bot_base_persona_details.get('aiExperience', "Low"),
                    conversation_to_continue_history=conversation_to_continue,
                    bot_displayed_demographics=displayed_demographics,
                    original_tester_bot_history=original_tester_bot_chat
                )

        if system_prompt_object:
            api_payload_messages.append(system_prompt_object)

        api_payload_messages.extend(conversation_messages_for_api_turn)

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": OPENROUTER_MODEL,
            "messages": api_payload_messages,
            "temperature": 0.9,
        }

        logging.info(
            f"Calling OpenRouter API. Model: {OPENROUTER_MODEL}. System prompt generated: {bool(system_prompt_object)}"
        )
        logging.info(f"API payload messages count: {len(api_payload_messages)}")
        if api_payload_messages:
            logging.info(f"First message role: {api_payload_messages[0].get('role', 'N/A')}")
            logging.info(f"Last message role: {api_payload_messages[-1].get('role', 'N/A')}")

        response = requests.post(OPENROUTER_API_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        response_data = response.json()

        if response_data and response_data.get("choices") and response_data["choices"][0].get("message"):
            bot_reply_content = response_data["choices"][0]["message"].get("content")
            if bot_reply_content is not None:  # Check for not None, as empty string can be a valid reply
                logging.info("Successfully received reply from OpenRouter.")
                return jsonify({"reply": bot_reply_content})

        logging.error(f"Invalid or incomplete response structure from OpenRouter: {response_data}")
        return jsonify({"error": "Bot did not provide a valid response structure."}), 500

    except requests.exceptions.HTTPError as http_err:
        error_text = http_err.response.text if http_err.response else 'No response body'
        status_code = http_err.response.status_code if http_err.response else 'Unknown HTTP error'
        logging.error(
            f"HTTP error occurred with OpenRouter: {http_err} - Status: {status_code} - Response: {error_text}")
        return jsonify({"error": f"Bot API request failed: {status_code}"}), 502
    except requests.exceptions.RequestException as req_err:
        logging.error(f"Request exception occurred with OpenRouter: {req_err}")
        return jsonify({"error": "Could not connect to bot service."}), 503
    except Exception as e:
        logging.error(f"An unexpected error occurred in chat_with_bot: {e}", exc_info=True)
        return jsonify({"error": "An internal server error occurred."}), 500


@app.route('/api/unblock_ip', methods=['POST'])
def unblock_ip():
    data = request.json
    if not data or 'ip' not in data:
        return jsonify({'status': 'error', 'message': 'No IP provided'}), 400
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
        static_folder = app.static_folder or "build"
        return send_from_directory(static_folder, path)
    except FileNotFoundError:
        # If file is not found, serve React's index.html (for client-side routing)
        static_folder = app.static_folder or "build"
        return send_from_directory(static_folder, 'index.html')


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


# Helper to start the shuffle timer when both users complete quiz
def start_shuffle_timer(pair_id):
    def shuffle_timer_thread():
        logging.info(f"🔥 SHUFFLE TIMER THREAD STARTED for pair {pair_id}")
        for remaining in range(SHUFFLE_TIMER_DURATION, 0, -1):
            if remaining % 5 == 0:
                logging.info(f"🔥 Shuffle timer for pair {pair_id}: {remaining} seconds remaining")
            socketio.sleep(1)
        logging.info(f"🔥 SHUFFLE TIMER ENDED - EMITTING shuffle_started event for pair {pair_id}")
        socketio.emit('shuffle_started', {'pair_id': pair_id}, to=pair_id)
        logging.info(f"🔥 shuffle_started event emitted to room {pair_id}")
        socketio.emit('shuffle_started_broadcast', {'pair_id': pair_id})
        logging.info(f"🔥 shuffle_started_broadcast event emitted to all clients as fallback")
        # Continue to real test timer
        start_real_test_timer(pair_id)

    # Start shuffle timer as a background task for proper SocketIO context
    t = socketio.start_background_task(shuffle_timer_thread)
    pair_timers[f"{pair_id}_shuffle"] = t
    logging.info(f"🔥 ✅ SHUFFLE TIMER BACKGROUND TASK STARTED for pair {pair_id}")

# Helper to start the real test timer for a pair
def start_real_test_timer(pair_id):
    def timer_thread():
        remaining = REAL_TEST_DURATION
        while remaining > 0:
            socketio.sleep(1)
            remaining -= 1
        socketio.emit('chat_ended', {'pair_id': pair_id}, to=pair_id)
        pair_timers.pop(f"{pair_id}_real", None)
        logging.info(f"Real test timer ended for pair {pair_id}")

    # Start real test timer as background task for proper SocketIO context
    t = socketio.start_background_task(timer_thread)
    pair_timers[f"{pair_id}_real"] = t
    logging.info(f"Real test timer background task started for pair {pair_id}")


# --- Routes ---
@app.route("/")
def home():
    return app.send_static_file('index.html')


@app.route("/api/generate_code", methods=["POST"])
def generate_code():
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400

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
        experimenter_username = pairs[pair_id]["experimenter"]
        experimenter_sid = user_sockets.get(experimenter_username)
        print("experimenter_username", experimenter_username)
        print("experimenter_sid", experimenter_sid)
        if experimenter_sid:
            emit("bonus_code", {"bonus": code}, to=experimenter_sid)
            print("emitted bonus code to experimenter_sid")

        return jsonify({"status": "success", "code": code})


@socketio.on('notification_dismissed')
def handle_notification_dismissed(data):
    pair_id = data.get('pair_id')
    role = data.get('role')
    emit('notification_dismissed', {'role': role}, to=pair_id)


@socketio.on('quiz_completed')
def handle_quiz_completed(data):
    logging.info(f"🎯 QUIZ COMPLETED EVENT RECEIVED: {data}")
    pair_id = data.get('pair_id')
    role = data.get('role')
    
    # Initialize pair quiz status if not exists
    if pair_id not in pair_quiz_status:
        pair_quiz_status[pair_id] = {'tester': False, 'experimenter': False}
        logging.info(f"🎯 Initialized quiz status for pair {pair_id}")
    
    # Mark this role as completed
    pair_quiz_status[pair_id][role] = True
    logging.info(f"🎯 Marked {role} as completed for pair {pair_id}")
    logging.info(f"🎯 Current quiz status for pair {pair_id}: {pair_quiz_status[pair_id]}")
      # Emit to the pair that this role completed
    emit('quiz_completed', {'role': role}, to=pair_id)
    logging.info(f"🎯 Emitted quiz_completed event for {role} to room {pair_id}")
    
    # Check if both users have completed the quiz
    tester_completed = pair_quiz_status[pair_id]['tester']
    experimenter_completed = pair_quiz_status[pair_id]['experimenter']
    
    logging.info(f"🎯 Quiz completion check - Tester: {tester_completed}, Experimenter: {experimenter_completed}")
    
    if tester_completed and experimenter_completed:
        logging.info(f"🎯 ✅ BOTH USERS COMPLETED QUIZ for pair {pair_id}")
        
        if SHUFFLE_ENABLED:
            logging.info(f"🎯 Shuffle enabled, starting shuffle timer for pair {pair_id}")
            # Both completed, start the shuffle timer
            start_shuffle_timer(pair_id)
            # Emit timer started event to both users
            emit('timer_started', {'pair_id': pair_id, 'shuffle_duration': SHUFFLE_TIMER_DURATION}, to=pair_id)
            logging.info(f"🎯 Emitted timer_started event to room {pair_id}")
        else:
            logging.info(f"🎯 Shuffle disabled, skipping directly to real test timer for pair {pair_id}")
            # Skip shuffle phase, go directly to real test
            start_real_test_timer(pair_id)
            # Emit shuffle_started event immediately to trigger frontend anonymous mode
            emit('shuffle_started_broadcast', {
                'pair_id': pair_id,
                'message': 'Shuffle phase skipped - starting test phase'
            }, to=pair_id)
            logging.info(f"🎯 Emitted shuffle_started_broadcast (skipped) event to room {pair_id}")
    else:
        logging.info(f"🎯 ⏳ WAITING for other user - Tester completed: {tester_completed}, Experimenter completed: {experimenter_completed}")


@socketio.on('quiz_failed')
def handle_quiz_failed(data):
    logging.info(f"Quiz failed: {data}")
    pair_id = data.get('pair_id')
    role = data.get('role')
    emit('quiz_failed', {'role': role}, to=pair_id)


@socketio.on("participant_inactivity_warning")
def handle_inactivity_warning(data):
    print("Received inactivity warning:", data)  # Debug log
    pair_id = data.get("pair_id")
    role = data.get("role")
    emit("inactivity_warning", {"role": role}, to=pair_id)
    print(f"Sent inactivity warning to room {pair_id}")  # Debug log


@socketio.on("participant_banned")
def handle_participant_ban(data):
    print("Received participant ban:", data)  # Debug log
    pair_id = data.get("pair_id")
    role = data.get("role")
    emit("participant_banned", {"role": role}, to=pair_id)
    print(f"Sent ban notification to room {pair_id}")  # Debug log


# Update the socket connection event handler
@socketio.on("connect")
def on_connect():
    """
    Handle new socket connections
    """
    logging.info(f"User connected with SID: {request.sid}") # type: ignore
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
    Register the user with a unique string username upon connection.
    """
    unique_id = get_unique_user_id()
    username = f"user_{unique_id}"
    if username in user_sockets:
        logging.warning(f"User {username} is already connected.")
        return  # Do not re-register

    user_sockets[username] = request.sid # type: ignore
    logging.info(f"Registered user {username} with socket ID {request.sid}") # type: ignore
    # Emit the string username as both username and user_id for consistency
    emit('user_registered', {'username': username, 'user_id': username})


@app.route("/api/save_demographics", methods=["POST"])
def save_demographics():
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400
    print(f"Received demographics data to save: {data}")  # DEBUG LINE
    user_id_from_frontend = data.get("user_id") # This is the "user_X" string
    gender = data.get("gender")
    age = data.get("age")
    occupation = data.get("occupation")
    education = data.get("education")
    country = data.get("country")
    ai_experience = data.get("aiExperience")

    # Validate age server-side as well
    try:
        age_num = int(age)
        if age_num <= 0:
            return jsonify({"status": "error", "message": "Invalid age"}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Age must be a number"}), 400

    demographic_data = {
        "user_id": user_id_from_frontend, # Storing "user_X" as user_id
        "gender": gender,
        "age": age_num, # Storing numerical age
        "occupation": occupation, # Storing occupation
        "education": education,
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


@app.route('/api/get_demographics/<target_username>', methods=['GET'])
def get_user_demographics(target_username):
    try:
        user_data_doc = demographic_collection.find_one({"user_id": target_username})  # Query by "user_X"

        if user_data_doc:
            demographics_to_return = {
                "gender": user_data_doc.get("gender"),
                "age": user_data_doc.get("age"),
                "occupation": user_data_doc.get("occupation"),  # Return occupation
                "education": user_data_doc.get("education"),
                "country": user_data_doc.get("country"),
                "aiExperience": user_data_doc.get("ai_experience")
            }
            return jsonify(demographics_to_return), 200
        else:
            return jsonify({"error": "Demographics not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400
    logging.info(f"Received name submission data: {data}")
    username = data.get("username")
    user_id = data.get("user_id")  # This should be the string username

    if not username or not user_id or username != user_id:
        return jsonify({"status": "error", "message": "Invalid username or user ID"}), 400

    with pairing_lock:
        if username not in user_sockets:
            return jsonify({"status": "error", "message": "Socket connection not established"}), 400
        if username in tester_queue or username in experimenter_queue:
            return jsonify({"status": "waiting", "message": "You are already waiting to be paired"}), 200
        role = None
        if not tester_queue:
            tester_queue.append(username)
            role = "tester"
        elif not experimenter_queue:
            experimenter_queue.append(username)
            role = "experimenter"
        else:
            return jsonify({"status": "waiting", "message": "Waiting for another user to connect"}), 200
        if tester_queue and experimenter_queue:
            tester_username_str = tester_queue[0]
            experimenter_username_str = experimenter_queue[0]
            tester_socket_id = user_sockets.get(tester_username_str)
            experimenter_socket_id = user_sockets.get(experimenter_username_str)
            if tester_socket_id and experimenter_socket_id:
                tester_queue.popleft()
                experimenter_queue.popleft()
                pair_id = generate_unique_room_number()
                pairs[pair_id] = {"tester": tester_username_str, "experimenter": experimenter_username_str}
                socketio.emit("paired", {
                    "pair_id": pair_id, "role": "tester",
                    "user_id": tester_username_str,  # Use string username
                    "username": tester_username_str,
                    "partner_username": experimenter_username_str
                }, to=tester_socket_id)
                socketio.emit("paired", {
                    "pair_id": pair_id, "role": "experimenter",
                    "user_id": experimenter_username_str,  # Use string username
                    "username": experimenter_username_str,
                    "partner_username": tester_username_str                }, to=experimenter_socket_id)
                logging.info(
                    f"Paired {tester_username_str} (SID: {tester_socket_id}) with {experimenter_username_str} (SID: {experimenter_socket_id}) in room {pair_id}"
                )
                return jsonify({
                    "status": "paired",
                    "pair_id": pair_id,
                    "users": [
                        {"username": tester_username_str, "role": "tester", "user_id": tester_username_str},
                        {"username": experimenter_username_str, "role": "experimenter", "user_id": experimenter_username_str},
                    ],
                }), 200
        return jsonify({"status": "waiting", "message": "Waiting for another user to connect"}), 200


@app.route("/api/save_chat", methods=["POST"])
def save_chat():
    """Save chat logs to MongoDB."""
    chat_data = request.json
    if not chat_data:
        return jsonify({"status": "error", "message": "No chat data provided"}), 400

    pair_id = chat_data.get("pairId")
    title = chat_data.get("title")
    print(f"Received chat data to save: {chat_data}")  # DEBUG LINE
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
    if data and data.get("realIdentityA", "").lower() == "bot":
        real_identity_a = "bot"
        real_identity_b = "experimenter"
    else:
        real_identity_a = "experimenter"
        real_identity_b = "bot"

    feedback = {
        "username": data.get("username") if data else None,
        "userId": data.get("userId") if data else None,
        "pairId": data.get("pairId") if data else None,
        "comments": data.get("comments") if data else None,
        "guessCandidateA": data.get("guessCandidateA") if data else None,
        "guessCandidateB": data.get("guessCandidateB") if data else None,
        "realIdentityA": real_identity_a,
        "realIdentityB": real_identity_b,
        "correctGuessA": (data.get("guessCandidateA") == real_identity_a) if data else False,
        "correctGuessB": (data.get("guessCandidateB") == real_identity_b) if data else False,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    try:
        # Save to MongoDB
        feedback_collection.insert_one(feedback)

        print("user_id string: ", data.get("username") if data else None)
        # Add pair_id to demographic collection
        demographic_collection.update_one(
            {"user_id": data.get("username") if data else None},
            {"$set": {"pair_id": data.get("pairId") if data else None}}
        )

        return jsonify({"status": "success", "message": "Feedback saved"})
    except Exception as e:
        logging.error(f"Error saving feedback: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/verify_code", methods=["POST"])
def verify_code():
    try:
        if not request.json or "code" not in request.json:
            return jsonify({"status": "error", "message": "No code provided"}), 400
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
    logging.info(f"🔗 [JOIN] Joining room with data: {data}")
    pair_id = data.get("pair_id")
    role = data.get("role")

    if not pair_id:
        logging.error("🔗 [JOIN] Invalid join request: Missing pair_id")
        return

    try:
        logging.info(f"🔗 [JOIN] Adding user {role} to room {pair_id}")
        join_room(pair_id)
        
        logging.info(f"🔗 [JOIN] Emitting joined_room event to room {pair_id}")
        emit(
            "joined_room",
            {"pair_id": pair_id, "role": role},
            to=pair_id,
        )
        logging.info(f"🔗 [JOIN] ✅ User with role {role} successfully joined room {pair_id}")
        
        # Check current room status for debugging
        if pair_id in pair_quiz_status:
            logging.info(f"🔗 [JOIN] Current quiz status for pair {pair_id}: {pair_quiz_status[pair_id]}")
        else:
            logging.info(f"🔗 [JOIN] No quiz status yet for pair {pair_id}")
            
    except Exception as e:
        logging.error(f"🔗 [JOIN] Error joining room {pair_id}: {str(e)}")


@socketio.on("experimenter_ready")
def handle_experimenter_ready(data):
    pair_id = data.get("pair_id")
    emit("experimenter_ready", {"status": "ready"}, to=pair_id)


@socketio.on("tester_guessed")
def handle_tester_guessed(data):
    print(f"Received tester_guessed event: {data}")  # Debug log
    pair_id = data.get("pairId")
    guess_a = data.get("guessCandidateA")
    guess_b = data.get("guessCandidateB")
    real_a = data.get("realIdentityA")
    real_b = data.get("realIdentityB")
    tester = data.get("tester")
    
    print(f"Processing guesses - A: {guess_a} vs {real_a}, B: {guess_b} vs {real_b}")  # Debug log
    
    # Find experimenter username and sid
    experimenter_username = pairs.get(pair_id, {}).get("experimenter")
    experimenter_sid = user_sockets.get(experimenter_username)
    
    print(f"Experimenter: {experimenter_username}, SID: {experimenter_sid}")  # Debug log
      # Determine code length
    if guess_a == real_a and guess_b == real_b:
        code = generate_unique_code(digits=7)
        print("Both guesses correct - generating 7-digit code")  # Debug log
    else:
        code = generate_unique_code(digits=6)
        print("Incorrect guesses - generating 6-digit code")  # Debug log
    
    print(f"Generated code: {code}")  # Debug log
    
    # Save to DB for both roles
    codes_collection.insert_one({
        "code": code,
        "role": "experimenter",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "pairId": pair_id,
    })
    codes_collection.insert_one({
        "code": code,
        "role": "tester",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "pairId": pair_id,
    })
    print("Saved code to database for both roles")  # Debug log
    
    # Emit bonus code to both experimenter and tester
    socketio.emit("bonus_code", {
        "bonus": code, 
        "role": "both",  # Both users should receive the same code
        "pair_id": pair_id
    }, to=pair_id)
    print(f"Emitted bonus_code to room {pair_id} for both roles: {code}")  # Debug log
    
    # Send confirmation to the tester
    socketio.emit("guess_submitted", {
        "message": "Your guesses have been submitted successfully!",
        "correct": guess_a == real_a and guess_b == real_b,
        "bonus_code": code,  # Include the bonus code in the confirmation
        "role": "tester",
        "pair_id": pair_id
    }, to=pair_id)
    print(f"Emitted guess_submitted confirmation to room {pair_id}")  # Debug log
    print("Sent guess_submitted confirmation to tester")  # Debug log


@socketio.on("message")
def handle_message(data):
    """
    Handle messages sent between users.
    """
    pair_id = data["pair_id"]
    sender = data["sender"]
    message = data["message"]
    emit("message", {"sender": sender, "message": message}, to=pair_id)


@socketio.on('conversation_review_completed')
def handle_conversation_review_completed(data):
    """
    Handle when a participant completes their conversation review.
    Track completion status and coordinate synchronization between participants.
    """
    pair_id = data.get('pair_id')
    role = data.get('role')
    username = data.get('username')
    review_time_seconds = data.get('review_time_seconds', 0)
    total_conversations = data.get('total_conversations', 0)
    correct_guesses = data.get('correct_guesses', 0)
    remaining_time_when_completed = data.get('remaining_time_when_completed', 0)
    
    logging.info(f"User {username} ({role}) completed conversation review for pair {pair_id}")
    logging.info(f"Review stats - Time: {review_time_seconds}s, Total: {total_conversations}, Correct: {correct_guesses}, Remaining: {remaining_time_when_completed}s")
    
    # Initialize pair review status if not exists
    if pair_id not in pair_review_status:
        pair_review_status[pair_id] = {
            'tester_completed': False,
            'experimenter_completed': False,
            'tester_data': None,
            'experimenter_data': None
        }
      # Mark this participant as completed and store their data
    if role == 'tester':
        pair_review_status[pair_id]['tester_completed'] = True
        pair_review_status[pair_id]['tester_data'] = {
            'username': username,
            'review_time_seconds': review_time_seconds,
            'total_conversations': total_conversations,
            'correct_guesses': correct_guesses,
            'remaining_time_when_completed': remaining_time_when_completed
        }
    elif role == 'experimenter':
        pair_review_status[pair_id]['experimenter_completed'] = True
        pair_review_status[pair_id]['experimenter_data'] = {
            'username': username,
            'review_time_seconds': review_time_seconds,
            'total_conversations': total_conversations,
            'correct_guesses': correct_guesses,
            'remaining_time_when_completed': remaining_time_when_completed
        }
    
    # Check if both participants have completed their review
    review_status = pair_review_status[pair_id]
    if review_status['tester_completed'] and review_status['experimenter_completed']:
        logging.info(f"Both participants completed conversation review for pair {pair_id}, starting test phase")
        
        # Emit synchronization event to start the anonymous test phase
        socketio.emit('conversation_review_sync', {
            'action': 'start_test_phase',
            'message': 'Both participants have completed the conversation review. Starting the anonymous testing phase.',
            'tester_data': review_status['tester_data'],
            'experimenter_data': review_status['experimenter_data']
        }, to=pair_id)
          # Clean up the review status for this pair
        del pair_review_status[pair_id]
        logging.info(f"Cleaned up conversation review status for pair {pair_id}")
    else:
        # Notify the other participant that this user has completed
        waiting_role = 'experimenter' if role == 'tester' else 'tester'
        
        # Get the partner's remaining time to pass to the waiting participant
        partner_remaining_time = remaining_time_when_completed
        
        socketio.emit('conversation_review_sync', {
            'action': 'partner_completed',
            'message': f'Your partner has completed their conversation review. Waiting for you to finish.',
            'completed_role': role,
            'waiting_role': waiting_role,
            'partner_remaining_time': partner_remaining_time
        }, to=pair_id)
        
        logging.info(f"Notified pair {pair_id} that {role} completed review, waiting for {waiting_role}")


@socketio.on('disconnect')
def on_disconnect(*args):
    """ Handle user disconnections. """
    sid = request.sid # type: ignore
    username = next((u for u, s in user_sockets.items() if s == sid), None)
    if username:
        logging.info(f"User {username} disconnected")
        user_sockets.pop(username, None)

        with pairing_lock:  # Ensure thread safety
            # Remove from queues if they were waiting
            if username in tester_queue:
                tester_queue.remove(username)
                logging.info(f"Removed {username} from tester queue")
            if username in experimenter_queue:
                experimenter_queue.remove(username)
                logging.info(f"Removed {username} from experimenter queue")

            # Check if the disconnected user was paired
            for pair_id, pair in list(pairs.items()):
                if pair['tester'] == username or pair['experimenter'] == username:
                    logging.info(f"User {username} was in pair {pair_id}, cleaning up pair")

                    # Find the remaining user
                    other_user = pair['experimenter'] if pair['tester'] == username else pair['tester']
                    other_user_id = user_sockets.get(other_user)
                    other_user_role = 'experimenter' if pair['tester'] == username else 'tester'

                    # Clean up timers for this pair
                    timers_to_remove = []
                    for timer_key in pair_timers:
                        if timer_key.startswith(f"{pair_id}_"):
                            timers_to_remove.append(timer_key)
                    
                    for timer_key in timers_to_remove:
                        timer_thread = pair_timers.pop(timer_key, None)
                        if timer_thread and hasattr(timer_thread, 'cancel'):
                            timer_thread.cancel()
                        logging.info(f"Cleaned up timer: {timer_key}")                    # Clean up quiz status for this pair
                    if pair_id in pair_quiz_status:
                        del pair_quiz_status[pair_id]
                        logging.info(f"Cleaned up quiz status for pair {pair_id}")
                    
                    # Clean up conversation review status for this pair
                    if pair_id in pair_review_status:
                        del pair_review_status[pair_id]
                        logging.info(f"Cleaned up conversation review status for pair {pair_id}")                    # Handle the remaining user
                    if other_user_id and other_user in user_sockets:
                        logging.info(f"Generating 6-digit code for remaining user {other_user} due to partner disconnection")
                        
                        # Generate a 6-digit code for the remaining user
                        code = generate_unique_code(digits=6)
                        
                        # Save the code to MongoDB for the remaining user
                        try:
                            codes_collection.insert_one({
                                "code": code,
                                "username": other_user,
                                "user_id": other_user,
                                "role": other_user_role,
                                "pair_id": pair_id,
                                "reason": "partner_disconnected",
                                "timestamp": datetime.now()
                            })
                            logging.info(f"Saved disconnection code {code} for user {other_user}")
                        except Exception as e:
                            logging.error(f"Error saving disconnection code: {e}")

                        # Check if disconnection happened during conversation review phase
                        if pair_id in pair_review_status:
                            # Disconnection during conversation review - send specific event
                            logging.info(f"Partner disconnected during conversation review for pair {pair_id}")
                            socketio.emit('partner_conversation_review_disconnect',
                                          {
                                              'message': 'Your partner disconnected during the conversation review. You will be redirected to the completion page.',
                                              'bonus_code': code,
                                              'role': other_user_role,
                                              'username': other_user,
                                              'user_id': other_user,
                                              'disconnect_phase': 'conversation_review'
                                          },
                                          to=pair_id)
                            logging.info(f"Sent conversation review disconnect notification to {other_user}")
                        else:
                            # Standard disconnection handling
                            logging.info(f"About to emit partner_disconnected to socket {other_user_id} for user {other_user}")
                            socketio.emit('partner_disconnected',
                                          {
                                              'message': 'Your partner has disconnected. You will be redirected to the completion page.',
                                              'redirect_to_thank_you': True,
                                              'bonus_code': code,
                                              'role': other_user_role,
                                              'username': other_user,
                                              'user_id': other_user
                                          },
                                          to=pair_id)
                            logging.info(f"Notified {other_user} about partner disconnection with code {code} and redirect to thank you page")
                    else:
                        logging.warning(f"Could not find socket for remaining user {other_user}")

                    # Remove the pair
                    del pairs[pair_id]
                    logging.info(f"Removed pair {pair_id} from pairs dict")
                    break
        
        logging.info(f"Disconnection cleanup complete for user {username}")


def get_credits():
    """
    Fetches the number of credits remaining in the OpenRouter account.

    Parameters:
        api_key (str): Your OpenRouter API key.

    Returns:
        float: The number of remaining credits.

    Raises:
        Exception: If the API call fails or credits info is unavailable.
    """
    url = "https://openrouter.ai/api/v1/credits"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}"
    }

    response = requests.get(url, headers=headers)

    if response.status_code != 200:
        raise Exception(f"API request failed with status code {response.status_code}: {response.text}")

    data = response.json()
    print("------------------------------------------------")
    print(f"You have {data['data']['total_credits'] - data['data']['total_usage']} credits remaining.")
    print("------------------------------------------------")


if __name__ == "__main__":
    get_credits()
    socketio.run(app,
                 debug=True,
                 host='0.0.0.0',  # Disable for testing locally
                 port=5000,
                 allow_unsafe_werkzeug=True)
