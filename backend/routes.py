from flask import Flask, request, jsonify, send_from_directory
import time
import random
import string
import logging
from threading import Lock
from collections import deque
from database import codes_collection, chats_collection, feedback_collection
from socketio_handlers import user_sockets, pairs, tester_queue, experimenter_queue, pairing_lock, code_lock, generated_codes


# Helper functions
def generate_unique_code(digits=6):
    while True:
        code = ''.join(random.choices(string.digits, k=digits))
        if not codes_collection.find_one({"code": code}):
            return code


# Routes
def init_routes(app):
    @app.route('/<path:path>')
    def serve_static_files(path):
        try:
            return send_from_directory(app.static_folder, path)
        except FileNotFoundError:
            return send_from_directory(app.static_folder, 'index.html')

    @app.route("/")
    def home():
        return app.send_static_file('index.html')

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
            existing_code = codes_collection.find_one({"name": name, "pairId": pair_id})
            if existing_code:
                code = existing_code["code"]
            elif role == "tester" and guess_a == real_a and guess_b == real_b:
                code = generate_unique_code(digits=7)
            else:
                code = generate_unique_code(digits=6)

            code_data = {
                "code": code,
                "role": role,
                "name": name,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "pairId": pair_id,
            }
            codes_collection.insert_one(code_data)
            generated_codes[name] = code
            experimenter_id = user_sockets.get(pairs[pair_id]["experimenter"])
            if experimenter_id:
                socketio.emit("bonus_code", {"bonus": code})
            return jsonify({"status": "success", "code": code})

    @app.route("/api/submit_name", methods=["POST"])
    def submit_name():
        data = request.json
        username = data.get("username")
        if not username:
            return jsonify({"status": "error", "message": "Invalid username"}), 400

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
                tester = tester_queue[0]
                experimenter = experimenter_queue[0]
                tester_id = user_sockets.get(tester)
                experimenter_id = user_sockets.get(experimenter)
                if tester_id and experimenter_id:
                    tester_queue.popleft()
                    experimenter_queue.popleft()
                    pair_id = f"room_{random.randint(1000, 9999)}"
                    pairs[pair_id] = {"tester": tester, "experimenter": experimenter}
                    socketio.emit("paired", {"pair_id": pair_id, "role": "tester", "user_id": tester_id, "username": tester}, to=tester_id)
                    socketio.emit("paired", {"pair_id": pair_id, "role": "experimenter", "user_id": experimenter_id, "username": experimenter}, to=experimenter_id)
                    logging.info(f"Paired {tester} (ID: {tester_id}) with {experimenter} (ID: {experimenter_id}) in room {pair_id}")
                    return jsonify({"status": "paired", "pair_id": pair_id, "users": [{"username": tester, "role": "tester", "user_id": tester_id}, {"username": experimenter, "role": "experimenter", "user_id": experimenter_id}]}), 200
            return jsonify({"status": "waiting", "message": "Waiting for another user to connect"}), 200

    @app.route("/api/save_chat", methods=["POST"])
    def save_chat():
        chat_data = request.json
        pair_id = chat_data.get("pairId")
        title = chat_data.get("title")
        try:
            new_log = {
                "pairId": pair_id,
                "title": title,
                "testerChatWithExperimenter": chat_data.get("testerChatWithExperimenter"),
                "testerChatWithBot": chat_data.get("testerChatWithBot"),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
            }
            chats_collection.insert_one(new_log)
            return jsonify({"status": "success"})
        except Exception as e:
            logging.error(f"Error saving chat logs: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route("/api/save_feedback", methods=["POST"])
    def save_feedback():
        logging.info("Received feedback data: %s", request.json)
        data = request.json
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
            feedback_collection.insert_one(feedback)
            return jsonify({"status": "success", "message": "Feedback saved"})
        except Exception as e:
            logging.error(f"Error saving feedback: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route("/api/verify_code", methods=["POST"])
    def verify_code():
        try:
            code = request.json.get("code")
            code_doc = codes_collection.find_one({"code": code})
            return jsonify({"status": "success", "valid": bool(code_doc)})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500