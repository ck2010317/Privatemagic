# Private Poker WebSocket Server

Real-time multiplayer server for Private Poker. Manages game rooms, deals cards server-side, and relays actions between players.

## Quick Start (Local)

```bash
cd server
npm install
npm start
```

Server runs on `ws://localhost:8080`

## Deploy to Render

1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repo (or ZIP upload the `server/` folder)
4. Build Command: `npm install`
5. Start Command: `node index.js`
6. Region: Your choice
7. Environment: Add `PORT` → `8080`
8. Create Web Service

Your server URL will be something like: `wss://privatepoker-server.onrender.com`

## Environment Variables

For the **frontend** (Vercel), set:
- `NEXT_PUBLIC_WS_SERVER` → Your server URL (e.g., `wss://privatepoker-server.onrender.com`)

## Architecture

- **Single responsibility**: Server manages all game logic, card dealing, turn order, betting calculations
- **Private cards**: Each player only receives their own hand via private message
- **Authoritative state**: Server is the source of truth — prevents cheating
- **Stateless clients**: Frontend is just a dumb UI synced to server state
- **Hand evaluation**: Server-side winner determination using 5-card poker hand rankings

## Protocol

### Client → Server

- `{type: "create", buyIn, publicKey, name}` - Create new game room
- `{type: "join", roomCode, publicKey, name}` - Join existing room
- `{type: "action", action, raiseAmount}` - Player action (fold/check/call/raise/allin)
- `{type: "bet", publicKey, name, betOnPlayer, amount}` - Place spectator bet
- `{type: "rematch"}` - Request new hand
- `{type: "ping"}` - Keep-alive

### Server → Client

- `{type: "created", roomCode, playerIndex}` - Room created successfully
- `{type: "joined", roomCode, playerIndex, role}` - Joined as player/spectator
- `{type: "state", ...}` - Full game state (authoritative)
  - Each player sees only their own hand
  - Community cards visible to all
  - Hands revealed at showdown
- `{type: "error", message}` - Error message
- `{type: "pong"}` - Pong response

## Testing

```bash
node test-client.js
```

Connects as P1, creates room, P2 joins, verifies both players have different cards.

## Limitations

- Rooms expire after 1 hour of inactivity
- Max 2 players per room (+ unlimited spectators)
- No persistence — data lost on server restart
- No transaction/blockchain integration yet (future: real SOL transfers)
