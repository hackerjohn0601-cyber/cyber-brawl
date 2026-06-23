#!/bin/bash

# Find and kill any process running on port 4000 (the game server)
echo "🔍 Checking for existing server on port 4000..."
PIDS=$(lsof -t -i:4000)

if [ ! -z "$PIDS" ]; then
  echo "🛑 Found existing server (PID: $PIDS). Killing it..."
  kill -9 $PIDS
  echo "✅ Old server stopped."
else
  echo "✅ No existing server found."
fi

echo "🔨 Building client..."
cd client
npm run build
cd ..

echo "🚀 Starting new server..."
cd server
npm start
