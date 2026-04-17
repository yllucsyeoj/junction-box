#!/bin/bash
# Start GoNude — server on :3001, frontend on :3000
set -e

BUN="$HOME/.bun/bin/bun"

# Install dependencies if node_modules are missing
if [ ! -d "server/node_modules" ]; then
  echo "Installing server dependencies..."
  "$BUN" install --cwd server
fi
if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  "$BUN" install --cwd frontend
fi

echo "Starting GoNude server on :3001..."
"$BUN" run server/index.ts &
SERVER_PID=$!

echo "Starting frontend dev server on :3000..."
"$BUN" --cwd frontend run dev &
VITE_PID=$!

trap "kill $SERVER_PID $VITE_PID 2>/dev/null" EXIT INT TERM

echo ""
echo "GoNude running at http://localhost:3000"
echo "Press Ctrl+C to stop."
wait
