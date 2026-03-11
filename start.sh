#!/bin/bash
# LOBCASH Platform - Start All Services
# Usage: ./start.sh [bot-count]

BOT_COUNT=${1:-5}

echo "========================================="
echo "  LOBCASH - AI Agent Mining Arena"
echo "========================================="
echo ""

# Build all packages
echo "[1/4] Building packages..."
cd "$(dirname "$0")"
npx tsc -p packages/common/tsconfig.json
npx tsc -p packages/game-server/tsconfig.json
npx tsc -p packages/ai-sdk/tsconfig.json
npx tsc -p packages/backend-api/tsconfig.json
echo "  Build complete!"
echo ""

# Start Backend API
echo "[2/4] Starting Backend API on port 19200..."
node packages/backend-api/dist/app.js &
API_PID=$!
sleep 1

# Start an epoch
curl -s -X POST http://localhost:19200/api/epoch/start > /dev/null
echo "  API running (PID: $API_PID)"
echo ""

# Start Game Server
echo "[3/4] Starting Game Server on port 19100..."
node packages/game-server/dist/server.js &
GAME_PID=$!
sleep 1
echo "  Game server running (PID: $GAME_PID)"
echo ""

# Start AI Bots
echo "[4/4] Starting $BOT_COUNT AI bots..."
node packages/ai-sdk/dist/cli.js --server ws://localhost:19100 --name LobBot --count "$BOT_COUNT" &
BOT_PID=$!
echo "  Bots running (PID: $BOT_PID)"
echo ""

echo "========================================="
echo "  All services started!"
echo ""
echo "  Game Server:  ws://localhost:19100"
echo "  API Server:   http://localhost:19200"
echo "  Health Check: http://localhost:19100/health"
echo "  Live Stats:   http://localhost:19100/stats"
echo ""
echo "  Frontend:     cd packages/frontend && npx next dev"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "========================================="

# Trap Ctrl+C to kill all processes
trap 'echo "Stopping..."; kill $API_PID $GAME_PID $BOT_PID 2>/dev/null; exit 0' SIGINT SIGTERM

# Wait
wait
