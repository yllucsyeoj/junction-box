#!/bin/bash
# Start GoNude — server on :3001, frontend on :3000
set -e

export PATH="$HOME/.bun/bin:$PATH"

echo "Starting GoNude server on :3001..."
bun run server/index.ts &
SERVER_PID=$!

echo "Starting frontend dev server on :3000..."
cd frontend && bun run dev &
VITE_PID=$!

trap "kill $SERVER_PID $VITE_PID 2>/dev/null" EXIT INT TERM

echo ""
echo "GoNude running at http://localhost:3000"
echo "Press Ctrl+C to stop."
wait
