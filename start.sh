#!/bin/bash

# Start MongoDB in the background
mongod --bind_ip_all --logpath /var/log/mongodb/mongod.log --fork

# Wait for MongoDB to start
sleep 5

# Start FastAPI in the background (Internal API)
uvicorn app_fastapi:app --host 0.0.0.0 --port 8000 &

# Start Flask in the foreground (Public UI) on port 7860
python app_flask.py
