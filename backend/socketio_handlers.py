import logging
from flask_socketio import SocketIO, join_room, emit
from threading import Lock
from collections import deque


# Function to initialize SocketIO with allowed origins
def create_socketio(app, allowed):
    socketio = SocketIO(app, cors_allowed_origins=allowed, ping_timeout=5000, ping_interval=25000)
    logging.basicConfig(level=logging.INFO)
    return socketio


# Initialize queues and state
tester_queue = deque()
experimenter_queue = deque()
pairs = {}
user_sockets = {}
generated_codes = {}
code_lock = Lock()
pairing_lock = Lock()
active_connections = {}


# SocketIO event handlers
def register_handlers(socketio):
    @socketio.on('notification_dismissed')
    def handle_notification_dismissed(data):
        pair_id = data.get('pair_id')
        role = data.get('role')
        emit('notification_dismissed', {'role': role}, room=pair_id)

    @socketio.on("connect")
    def on_connect():
        logging.info(f"User connected with SID: {request.sid}")
        emit('connect_response', {'status': 'connected'})

    @socketio.on_error()
    def error_handler(e):
        logging.error(f"SocketIO error: {str(e)}")
        emit('error', {'error': str(e)})

    @socketio.on("register_user")
    def register_user(data):
        username = data.get("username")
        if username and username in user_sockets:
            logging.warning(f"User {username} is already connected.")
            return
        if username:
            user_sockets[username] = request.sid
            logging.info(f"Registered user {username} with socket ID {request.sid}")

    @socketio.on("join")
    def on_join(data):
        logging.info(f"Joining room with data: {data}")
        pair_id = data.get("pair_id")
        username = data.get("username", "unknown")
        user_id = data.get("user_id")
        if not pair_id:
            logging.error("Invalid join request: Missing pair_id.")
            return
        try:
            join_room(pair_id)
            logging.info(f"User {username} (ID: {user_id}) joined room {pair_id}")
            emit("joined_room", {"username": username, "pair_id": pair_id, "user_id": user_id}, to=pair_id)
        except Exception as e:
            logging.error(f"Error joining room {pair_id}: {e}")

    @socketio.on("experimenter_ready")
    def handle_experimenter_ready(data):
        pair_id = data.get("pair_id")
        logging.info(f"Experimenter ready in room {pair_id}")
        emit("experimenter_ready", {"status": "ready"}, room=pair_id)

    @socketio.on("message")
    def handle_message(data):
        pair_id = data["pair_id"]
        sender = data["sender"]
        message = data["message"]
        emit("message", {"sender": sender, "message": message}, to=pair_id)

    @socketio.on("disconnect")
    def on_disconnect():
        sid = request.sid
        username = next((u for u, s in user_sockets.items() if s == sid), None)
        if username:
            logging.info(f"User {username} (SID: {sid}) disconnected")
            user_sockets.pop(username, None)
            if username in tester_queue:
                tester_queue.remove(username)
            if username in experimenter_queue:
                experimenter_queue.remove(username)