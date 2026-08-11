#!/bin/bash
# start.sh - Script to easily start the production server

export PORT=${PORT:-5000}

echo "Starting Production Server on port $PORT..."
echo "Using Gunicorn with Eventlet workers."

# Run gunicorn with 1 worker using eventlet
gunicorn -k eventlet -w 1 --bind 0.0.0.0:$PORT app:app
