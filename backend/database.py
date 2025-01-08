import os
from pymongo import MongoClient
from dotenv import load_dotenv

# MongoDB connection setup
load_dotenv()
MONGODB_URI = os.getenv('MONGODB_URI')

client = MongoClient(MONGODB_URI)
db = client['turing_test_db']  # database name

codes_collection = db['codes']
chats_collection = db['chats']
feedback_collection = db['feedback']