#!/bin/bash

# Start FastAPI
echo "Starting FastAPI..."
uvicorn app_fastapi:app --host 0.0.0.0 --port 8000 &

# Start Flask
echo "Starting Flask..."
python app_flask.py
