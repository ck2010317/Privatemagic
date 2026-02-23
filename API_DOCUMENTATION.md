# Private Poker — API & AI Agent Integration Guide

> **Game**: Private Poker — On-chain Texas Hold'em on Solana with MagicBlock Ephemeral Rollups  
> **Website**: [https://poker.privatepay.site](https://poker.privatepay.site)  
> **Version**: 1.0.0  
> **Program ID**: `7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK` (Solana Devnet)  
> **Last Updated**: February 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Connection Details](#2-connection-details)
3. [WebSocket Protocol](#3-websocket-protocol)
4. [Game Flow](#4-game-flow)
5. [Message Reference — Client → Server](#5-message-reference--client--server)
6. [Message Reference — Server → Client](#6-message-reference--server--client)
7. [Game State Object](#7-game-state-object)
8. [Player Actions](#8-player-actions)
9. [Card Format](#9-card-format)
10. [Hand Evaluation & Rankings](#10-hand-evaluation--rankings)
11. [On-Chain Integration (Solana)](#11-on-chain-integration-solana)
12. [Betting / Spectator System](#12-betting--spectator-system)
13. [Complete Flow Example](#13-complete-flow-example)
14. [AI Decision Reference](#14-ai-decision-reference)
15. [Error Handling](#15-error-handling)
16. [Deployment & URLs](#16-deployment--urls)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   AI Agent / Bot                     Human Player (Browser)      │
│        │                                   │                     │
│        └──── WebSocket (JSON) ────────────┐│                     │
│                                           ▼▼                     │
│                              ┌─────────────────────┐             │
│                              │  WebSocket Server    │             │
│                              │  (Node.js)           │             │
│                              │                     │             │
│                              │  • Room management  │             │
│                              │  • Card dealing     │             │
│                              │  • Action relay     │             │
│                              │  • Hand evaluation  │             │
│                              │  • Winner resolve   │             │
│                              └─────────┬───────────┘             │
│                                        │                         │
│                              ┌─────────▼───────────┐             │
│                              │  Solana Blockchain   │             │
│                              │  (Devnet)            │             │
│                              │                     │             │
│                              │  • Buy-in escrow    │             │
│                              │  • Winner payout    │             │
│                              │  • MagicBlock ER    │             │
│                              └─────────────────────┘             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key point**: The AI agent interacts **only via WebSocket**. The server handles all card dealing, action validation, and winner determination. The on-chain layer is handled by the frontend wallet — the AI agent does NOT need to interact with Solana directly for gameplay.

---

## 2. Connection Details

| Environment | WebSocket URL | Protocol |
|---|---|---|
| **Production** | `wss://privatemagic.onrender.com` | WSS (TLS) |

- **Protocol**: Standard WebSocket (RFC 6455)
- **Message Format**: JSON (UTF-8)
- **Ping/Pong**: Send `{"type":"ping"}` every 25 seconds to keep alive. Server responds with `{"type":"pong"}`.
- **Connection Timeout**: 15 seconds
- **Auto-Reconnect**: Recommended. If disconnected during a game, the player is marked as disconnected. After 60 seconds of no reconnection, the other player wins by default.

---

## 3. WebSocket Protocol

All messages are JSON objects with a `type` field.

### Sending Messages

```json
ws.send(JSON.stringify({ "type": "<message_type>", ...params }));
```

### Receiving Messages

```json
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case "created": ...
    case "joined": ...
    case "state": ...
    case "error": ...
    case "pong": ...
  }
};
```

---

## 4. Game Flow

```
Phase Timeline:
                                                                              
  ┌────────┐     ┌─────────┐     ┌──────────┐     ┌───────┐     ┌──────┐     ┌───────┐     ┌──────────┐     ┌─────────┐
  │ Create │ ──▶ │ Waiting │ ──▶ │ Preflop  │ ──▶ │ Flop  │ ──▶ │ Turn │ ──▶ │ River │ ──▶ │ Showdown │ ──▶ │ Settled │
  │  Room  │     │ (join)  │     │ (2 cards)│     │(3 com)│     │(4 com)│     │(5 com)│     │ (winner) │     │ (done)  │
  └────────┘     └─────────┘     └──────────┘     └───────┘     └──────┘     └───────┘     └──────────┘     └─────────┘
    Player 1       Player 2        Blinds          Betting       Betting      Betting       Evaluation      Rematch?
    creates        joins           posted           round         round        round         done            
```

### Step-by-Step:

1. **Player 1** sends `create` → receives `created` with `roomCode`
2. **Player 2** (or AI agent) sends `join` with `roomCode` → receives `joined`
3. Server auto-deals cards after ~1.5 seconds
4. Both players receive `state` updates with phase `"preflop"`
5. Players take turns sending `action` messages (fold/check/call/raise/allin)
6. Server advances phases automatically when betting rounds complete
7. At showdown, server evaluates hands and determines winner
8. Game reaches `"settled"` phase — players can `rematch` or disconnect

### Heads-Up Texas Hold'em Rules:
- **2 players only** (heads-up format)
- **Blinds**: Small blind = 2% of buy-in, Big blind = 2× small blind
- **Dealer** posts small blind, acts first preflop, acts second post-flop
- **Turn order**: `turn` field (0 or 1) indicates whose turn it is

---

## 5. Message Reference — Client → Server

### 5.1 `create` — Create a New Game Room

```json
{
  "type": "create",
  "buyIn": 100000000,
  "publicKey": "YourSolanaPublicKeyBase58",
  "name": "PokerBot",
  "onChainGameId": 12345
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"create"` | ✅ | Message type |
| `buyIn` | `number` | ✅ | Buy-in amount in **lamports** (1 SOL = 1,000,000,000 lamports) |
| `publicKey` | `string` | ✅ | Solana wallet public key (Base58) |
| `name` | `string` | ✅ | Display name for the player |
| `onChainGameId` | `number \| null` | ❌ | On-chain game ID if game was created on Solana first |

**Response**: `created` message

---

### 5.2 `join` — Join an Existing Room

```json
{
  "type": "join",
  "roomCode": "ABC12",
  "publicKey": "YourSolanaPublicKeyBase58",
  "name": "PokerBot"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"join"` | ✅ | Message type |
| `roomCode` | `string` | ✅ | 5-character room code (case-insensitive, uppercased server-side) |
| `publicKey` | `string` | ✅ | Solana wallet public key (Base58) |
| `name` | `string` | ✅ | Display name for the player |

**Response**: `joined` message, then `state` updates begin

> **Note**: If room already has 2 players, you join as a **spectator** (`playerIndex: -1`). Spectators cannot perform actions.

---

### 5.3 `action` — Perform a Game Action

```json
{
  "type": "action",
  "action": "raise",
  "raiseAmount": 5000000
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `"action"` | ✅ | Message type |
| `action` | `string` | ✅ | One of: `"fold"`, `"check"`, `"call"`, `"raise"`, `"allin"` |
| `raiseAmount` | `number` | ❌ | Required only for `"raise"`. Total bet amount (not the increment). In lamports. |

**Validation** (server-side):
- Must be your turn (`room.turn === yourPlayerIndex`)
- Game must be in an active phase (`preflop`, `flop`, `turn`, `river`)
- `check` is only valid when no outstanding bet (`currentBet <= yourCurrentBet`)
- `call` requires an outstanding bet (`currentBet > yourCurrentBet`)
- `raise` amount must be > current bet and within your balance
- `fold` is always valid

**Response**: Updated `state` broadcast to all connected clients

---

### 5.4 `bet` — Place a Spectator Bet

```json
{
  "type": "bet",
  "publicKey": "BettorPublicKey",
  "name": "BettorName",
  "betOnPlayer": 1,
  "amount": 1000000
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `betOnPlayer` | `1 \| 2` | ✅ | Which player to bet on (1 = creator, 2 = joiner) |
| `amount` | `number` | ✅ | Bet amount in lamports |

---

### 5.5 `rematch` — Request a Rematch

```json
{
  "type": "rematch"
}
```

Only valid when game is in `"settled"` phase. Resets the game with swapped dealer and re-deals cards.

---

### 5.6 `delegation_complete` — Notify ER Delegation Done

```json
{
  "type": "delegation_complete"
}
```

Informs the server that MagicBlock Ephemeral Rollup delegation is complete. Sets `isDelegated: true` in room state.

---

### 5.7 `ping` — Keep-Alive

```json
{
  "type": "ping"
}
```

**Response**: `{"type": "pong"}`

---

## 6. Message Reference — Server → Client

### 6.1 `created` — Room Created Successfully

```json
{
  "type": "created",
  "roomCode": "XK9P3",
  "playerIndex": 0
}
```

| Field | Type | Description |
|---|---|---|
| `roomCode` | `string` | 5-character room code to share with other player |
| `playerIndex` | `number` | Always `0` for the creator |

---

### 6.2 `joined` — Successfully Joined a Room

```json
{
  "type": "joined",
  "roomCode": "XK9P3",
  "playerIndex": 1,
  "role": "player",
  "onChainGameId": 12345,
  "buyIn": 100000000
}
```

| Field | Type | Description |
|---|---|---|
| `roomCode` | `string` | Room code joined |
| `playerIndex` | `number` | `1` for player, `-1` for spectator |
| `role` | `string` | `"player"` or `"spectator"` |
| `onChainGameId` | `number \| null` | On-chain game ID (if game was created on-chain) |
| `buyIn` | `number` | Buy-in amount in lamports |

---

### 6.3 `state` — Full Game State Update

This is the **primary message** you'll receive. Sent after every action, phase change, or connection event.

```json
{
  "type": "state",
  "gameId": "XK9P3",
  "phase": "flop",
  "pot": 10000000,
  "buyIn": 100000000,
  "currentBet": 4000000,
  "dealer": 0,
  "turn": 1,
  "communityCards": [
    {"rank": "K", "suit": "hearts", "faceUp": true},
    {"rank": "7", "suit": "spades", "faceUp": true},
    {"rank": "2", "suit": "diamonds", "faceUp": true},
    {"rank": "?", "suit": "?", "faceUp": false},
    {"rank": "?", "suit": "?", "faceUp": false}
  ],
  "player1": {
    "id": "uuid-...",
    "name": "HumanPlayer",
    "publicKey": "51byRYi...",
    "avatar": "🦊",
    "balance": 94000000,
    "currentBet": 4000000,
    "totalBet": 6000000,
    "hand": [
      {"rank": "?", "suit": "?", "faceUp": false},
      {"rank": "?", "suit": "?", "faceUp": false}
    ],
    "hasFolded": false,
    "isAllIn": false,
    "isConnected": true,
    "hasActedThisRound": true
  },
  "player2": {
    "id": "uuid-...",
    "name": "PokerBot",
    "publicKey": "Abc123...",
    "avatar": "🎭",
    "balance": 96000000,
    "currentBet": 2000000,
    "totalBet": 4000000,
    "hand": [
      {"rank": "A", "suit": "spades", "faceUp": true},
      {"rank": "Q", "suit": "hearts", "faceUp": true}
    ],
    "hasFolded": false,
    "isAllIn": false,
    "isConnected": true,
    "hasActedThisRound": false
  },
  "myPlayerIndex": 1,
  "winner": null,
  "winnerHandResult": null,
  "showCards": false,
  "lastAction": "HumanPlayer raises 📈",
  "bettingPool": {
    "totalPoolPlayer1": 0,
    "totalPoolPlayer2": 0,
    "bets": [],
    "isSettled": false,
    "winningPlayer": 0
  },
  "onChainGameId": 12345,
  "isDelegated": true
}
```

---

### 6.4 `error` — Error Message

```json
{
  "type": "error",
  "message": "Room not found"
}
```

---

### 6.5 `pong` — Keepalive Response

```json
{
  "type": "pong"
}
```

---

## 7. Game State Object

### Key Fields for AI Decision-Making

| Field | Type | Description |
|---|---|---|
| `phase` | `string` | Current game phase: `"waiting"`, `"preflop"`, `"flop"`, `"turn"`, `"river"`, `"showdown"`, `"settled"` |
| `pot` | `number` | Total pot in lamports |
| `currentBet` | `number` | Current bet to match (in lamports) |
| `turn` | `0 \| 1` | Whose turn it is (`0` = player1/creator, `1` = player2/joiner) |
| `myPlayerIndex` | `0 \| 1 \| -1` | Your player index. **Check `turn === myPlayerIndex` to know if it's your turn** |
| `dealer` | `0 \| 1` | Dealer button position |
| `buyIn` | `number` | Buy-in amount in lamports |

### Player Object

| Field | Type | Description |
|---|---|---|
| `hand` | `Card[]` | **Your cards** (visible to you). Opponent's cards show `rank:"?"`, `suit:"?"` until showdown. |
| `balance` | `number` | Remaining balance (lamports) |
| `currentBet` | `number` | Current bet this round (lamports) |
| `totalBet` | `number` | Total bet across all rounds (lamports) |
| `hasFolded` | `boolean` | Whether player has folded |
| `isAllIn` | `boolean` | Whether player is all-in |
| `isConnected` | `boolean` | Whether player is still connected |
| `hasActedThisRound` | `boolean` | Whether player has acted this betting round |
| `handResult` | `object \| undefined` | Hand evaluation result (only present at showdown) |

### How to Know It's Your Turn

```javascript
const isMyTurn = (state.turn === state.myPlayerIndex);
const isActivePhase = ["preflop", "flop", "turn", "river"].includes(state.phase);
const canAct = isMyTurn && isActivePhase;
```

### How to Get Your Hand

```javascript
const myPlayer = state.myPlayerIndex === 0 ? state.player1 : state.player2;
const myHand = myPlayer.hand; // [{rank: "A", suit: "spades", faceUp: true}, ...]
```

---

## 8. Player Actions

| Action | When Valid | Effect |
|---|---|---|
| `fold` | Any time it's your turn | Forfeit the hand. Opponent wins the pot. |
| `check` | When `currentBet <= yourCurrentBet` | Pass without betting. |
| `call` | When `currentBet > yourCurrentBet` | Match the current bet. |
| `raise` | Any time (with sufficient balance) | Raise to a new amount. Must provide `raiseAmount` (the **total** bet, not the increment). |
| `allin` | Any time | Bet your entire remaining balance. |

### Raise Amount Calculation

The `raiseAmount` is the **total bet amount** (not the increment over the current bet).

```
raiseAmount must be > currentBet
The difference (raiseAmount - yourCurrentBet) must be <= yourBalance
```

**Example**: If `currentBet = 4000000` and you want to raise by 2M more:
```json
{ "type": "action", "action": "raise", "raiseAmount": 6000000 }
```

### What Happens After Each Action

| Action | Server Behavior |
|---|---|
| `fold` | Game goes to showdown → settled (opponent wins) |
| `check` | If opponent already acted and bets match → advance phase |
| `call` | Advance to next phase |
| `raise` | Opponent's `hasActedThisRound` resets to false, they must act again |
| `allin` | If opponent also all-in or matches → advance to next phase |

---

## 9. Card Format

### Card Object

```json
{
  "rank": "A",
  "suit": "hearts",
  "faceUp": true
}
```

### Ranks
`"2"`, `"3"`, `"4"`, `"5"`, `"6"`, `"7"`, `"8"`, `"9"`, `"10"`, `"J"`, `"Q"`, `"K"`, `"A"`

### Suits
`"hearts"`, `"diamonds"`, `"clubs"`, `"spades"`

### Hidden Cards
When a card is hidden (opponent's hand before showdown, unrevealed community cards):
```json
{ "rank": "?", "suit": "?", "faceUp": false }
```

### Community Cards Visibility by Phase

| Phase | Cards Visible |
|---|---|
| `preflop` | 0 community cards face-up |
| `flop` | 3 community cards face-up |
| `turn` | 4 community cards face-up |
| `river` | 5 community cards face-up |
| `showdown` | All 5 face-up + both players' hands revealed |

---

## 10. Hand Evaluation & Rankings

The server evaluates hands automatically. Rankings from highest to lowest:

| Rank | Name | Value |
|---|---|---|
| 10 | Royal Flush | A-K-Q-J-10 same suit |
| 9 | Straight Flush | 5 consecutive same suit |
| 8 | Four of a Kind | 4 cards same rank |
| 7 | Full House | 3 of a kind + pair |
| 6 | Flush | 5 cards same suit |
| 5 | Straight | 5 consecutive ranks |
| 4 | Three of a Kind | 3 cards same rank |
| 3 | Two Pair | 2 different pairs |
| 2 | One Pair | 2 cards same rank |
| 1 | High Card | Highest card wins |

### Hand Result Object (at showdown)

```json
{
  "rank": "Two Pair",
  "value": 3,
  "kickers": [13, 7]
}
```

---

## 11. On-Chain Integration (Solana)

> **Note**: On-chain interaction is **optional** for WebSocket gameplay. The agent can play purely via WebSocket. However, if on-chain integration is desired for full escrow/settlement, here are the details.

### Program Details

| Item | Value |
|---|---|
| Program ID | `7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK` |
| Network | Solana Devnet |
| RPC | `https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58` |
| MagicBlock ER RPC | `https://devnet-us.magicblock.app` |
| ER Validator | `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd` |

### PDA Seeds

| PDA | Seeds |
|---|---|
| Game PDA | `["poker_game", game_id_le_bytes]` |
| Player Hand PDA | `["player_hand", game_id_le_bytes, player_pubkey]` |
| Betting Pool PDA | `["betting_pool", game_id_le_bytes]` |
| Bet PDA | `["bet", game_id_le_bytes, bettor_pubkey]` |

### Program Instructions (16 total)

| # | Instruction | Layer | Description |
|---|---|---|---|
| 1 | `create_game` | L1 | Create game + escrow SOL buy-in |
| 2 | `join_game` | L1 | Join game + escrow SOL buy-in |
| 3 | `delegate_pda` | L1 | Delegate game PDA to MagicBlock ER |
| 4 | `deal_cards` | ER | Deal hole cards + community cards |
| 5 | `player_action` | ER | Process fold/check/call/raise/allin |
| 6 | `advance_phase` | ER | Move to next phase (flop→turn→river) |
| 7 | `reveal_winner` | ER | Evaluate hands, set winner, undelegate |
| 8 | `settle_pot` | L1 | Transfer pot SOL to winner |
| 9 | `settle_game` | L1 | Close game account, refund rent |
| 10 | `cancel_game` | L1 | Cancel game (player 1 refund if player 2 never joined) |
| 11 | `refund_bet` | L1 | Refund bet from unsettled betting pool |
| 12 | `process_undelegation` | L1 | Process MagicBlock undelegation |
| 13 | `create_betting_pool` | L1 | Create spectator betting pool |
| 14 | `place_bet` | L1 | Place bet on player 1 or 2 |
| 15 | `settle_betting_pool` | L1 | Settle betting pool after game |
| 16 | `claim_bet_winnings` | L1 | Claim betting winnings |

### On-Chain Game Flow

```
L1: create_game (Player 1 escrows buy-in)
L1: join_game (Player 2 escrows buy-in)
L1: delegate_pda (delegate to MagicBlock ER)
        │
        ▼ (Gameplay on ER — fast, gasless)
ER: deal_cards
ER: player_action (repeat as needed)
ER: advance_phase (repeat as needed)
ER: reveal_winner (auto-undelegates back to L1)
        │
        ▼ (Settlement on L1)
L1: settle_pot (winner claims SOL)
L1: settle_game (close accounts)
```

---

## 12. Betting / Spectator System

Spectators can bet on which player will win. The betting pool is tracked in the `bettingPool` field.

### Betting Pool State

```json
{
  "totalPoolPlayer1": 5000000,
  "totalPoolPlayer2": 3000000,
  "bets": [
    {
      "id": "bet_1234567890_0.123",
      "bettor": "PublicKey...",
      "bettorName": "Spectator1",
      "betOnPlayer": 1,
      "amount": 5000000,
      "timestamp": 1234567890123
    }
  ],
  "isSettled": false,
  "winningPlayer": 0
}
```

---

## 13. Complete Flow Example

### Scenario: AI Agent Joins a Game and Plays

```
1. Connect WebSocket
   → ws = new WebSocket("wss://privatemagic.onrender.com")

2. Join existing room (room code shared by human player)
   → send: {"type":"join","roomCode":"XK9P3","publicKey":"AgentPubKey","name":"PokerBot"}
   ← recv: {"type":"joined","roomCode":"XK9P3","playerIndex":1,"role":"player","buyIn":100000000}

3. Wait for deal (~1.5s after join)
   ← recv: {"type":"state","phase":"preflop","turn":0,...}
   (turn=0 means Player 1 acts first — wait)

4. Player 1 acts (you receive state update)
   ← recv: {"type":"state","phase":"preflop","turn":1,"currentBet":4000000,...}
   (turn=1 = YOUR turn! Decide action based on your hand + game state)

5. Your turn — decide and act
   → send: {"type":"action","action":"call"}
   ← recv: {"type":"state","phase":"flop","turn":0,...}
   (Phase advanced to flop, 3 community cards visible)

6. Continue responding to state updates when turn === myPlayerIndex
   ... (repeat steps 4-5 through flop, turn, river)

7. Showdown
   ← recv: {"type":"state","phase":"showdown",...}
   ← recv: {"type":"state","phase":"settled","winner":"WinnerPubKey",...}

8. Rematch or disconnect
   → send: {"type":"rematch"}
   (or simply close WebSocket)
```

### Pseudocode for AI Agent Loop

```python
import websocket
import json

ws = websocket.WebSocket()
ws.connect("wss://privatemagic.onrender.com")

# Join a room
ws.send(json.dumps({
    "type": "join",
    "roomCode": "XK9P3",
    "publicKey": "YourSolanaPubKey",
    "name": "PokerBot"
}))

while True:
    msg = json.loads(ws.recv())
    
    if msg["type"] == "pong":
        continue
    
    if msg["type"] == "error":
        print(f"Error: {msg['message']}")
        continue
    
    if msg["type"] == "state":
        state = msg
        my_index = state["myPlayerIndex"]
        
        # Check if it's my turn
        if state["turn"] != my_index:
            continue
        
        # Only act during active phases
        if state["phase"] not in ["preflop", "flop", "turn", "river"]:
            continue
        
        # Get my player data
        my_player = state["player1"] if my_index == 0 else state["player2"]
        my_hand = my_player["hand"]
        community = [c for c in state["communityCards"] if c["faceUp"]]
        current_bet = state["currentBet"]
        my_current_bet = my_player["currentBet"]
        pot = state["pot"]
        balance = my_player["balance"]
        
        # === YOUR AI DECISION LOGIC HERE ===
        action, raise_amount = decide_action(
            my_hand, community, current_bet, 
            my_current_bet, pot, balance, state["phase"]
        )
        
        # Send action
        msg_out = {"type": "action", "action": action}
        if action == "raise" and raise_amount:
            msg_out["raiseAmount"] = raise_amount
        
        ws.send(json.dumps(msg_out))
```

---

## 14. AI Decision Reference

The current AI opponent uses the following decision framework. You can use this as a baseline or implement a more sophisticated strategy.

### Hand Strength Evaluation (Pre-flop)

| Hand Type | Strength Score (1-10) |
|---|---|
| AA, KK | 9 |
| QQ, JJ | 7 |
| AK suited | 9 |
| AK offsuit | 8 |
| AQ, AJ suited | 7 |
| AQ, AJ offsuit | 6 |
| TT, 99 | 5 |
| Ax suited | 5 |
| Suited connectors (gap ≤ 2) | 4 |
| Small pairs | 4 |
| Connected cards (gap ≤ 1, high ≥ 8) | 3 |
| Ax offsuit | 3 |
| Everything else | 1 |

### Hand Strength Evaluation (Post-flop)

| Hand Rank | Strength Score |
|---|---|
| Royal Flush | 10 |
| Straight Flush | 9 |
| Four of a Kind | 8 |
| Full House | 7 |
| Flush | 6 |
| Straight | 5 |
| Three of a Kind | 4 |
| Two Pair | 3 |
| One Pair | 2 |
| High Card | 1 |

### Decision Matrix (Simplified)

**Pre-flop:**
- Strength ≥ 8: Raise big (20% of buy-in) or all-in
- Strength ≥ 6: Raise (8-12% of buy-in) or call
- Strength ≥ 4: Call most bets, fold to very large raises
- Strength < 4: Call cheap bets, fold to raises > 15% of buy-in

**Post-flop:**
- Strength ≥ 7: All-in or bet 80% of pot
- Strength ≥ 5: Raise 50-60% of pot or call
- Strength ≥ 3: Call moderate bets, fold to huge bets
- Strength ≥ 2: Call small bets, occasionally bluff
- Strength 1: Bluff ~20% of the time, fold otherwise

### Available Information for Decision Making

From each `state` message, the agent has access to:

| Data | How to Get It |
|---|---|
| Your hole cards | `myPlayer.hand` (cards with `faceUp: true`) |
| Community cards | `state.communityCards` (filter where `faceUp === true`) |
| Pot size | `state.pot` |
| Current bet to match | `state.currentBet` |
| Your current bet | `myPlayer.currentBet` |
| Your balance | `myPlayer.balance` |
| Opponent's bet | `opponent.currentBet` |
| Opponent folded? | `opponent.hasFolded` |
| Opponent all-in? | `opponent.isAllIn` |
| Game phase | `state.phase` |
| Buy-in | `state.buyIn` |

---

## 15. Error Handling

| Error | Cause | Action |
|---|---|---|
| `"Room not found"` | Invalid room code | Verify room code and retry |
| WebSocket close | Network issue or server restart | Auto-reconnect in 3 seconds |
| Action ignored | Not your turn or invalid action | Wait for next `state` update |
| 60s disconnect | Player didn't reconnect in time | Other player wins by forfeit |

### Room Lifecycle
- Rooms expire after **1 hour** of inactivity
- Rooms are deleted when both players disconnect for 60 seconds
- Room codes are 5 characters: uppercase letters (no I,O) + digits (no 0,1)

---

## 16. Deployment & URLs

| Service | URL | Platform |
|---|---|---|
| WebSocket Server | `wss://privatemagic.onrender.com` | Render |
| Frontend | `https://poker.privatepay.site` | Vercel |
| Solana Program | Program ID: `7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK` | Solana Devnet |
| RPC Endpoint | `https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58` | Helius |
| MagicBlock ER | `https://devnet-us.magicblock.app` | MagicBlock |

---

## Quick Start

### Minimal Integration Checklist

1. ✅ Connect to `wss://privatemagic.onrender.com`
2. ✅ Send `join` with a room code, public key, and name
3. ✅ Listen for `state` messages
4. ✅ When `state.turn === state.myPlayerIndex` and phase is active → send `action`
5. ✅ Send `ping` every 25 seconds
6. ✅ Handle `settled` phase for game end

### What You DON'T Need To Do

- ❌ Deal cards (server handles this)
- ❌ Evaluate hands (server handles this)
- ❌ Advance phases (server handles this)
- ❌ Interact with Solana blockchain (frontend handles this)
- ❌ Manage game state (server is authoritative)

---

## Contact & Resources

- **Website**: [https://poker.privatepay.site](https://poker.privatepay.site)
- **API Docs**: [https://poker.privatepay.site/docs](https://poker.privatepay.site/docs)
- **Repository**: [GitHub](https://github.com/ck2010317/Privatemagic)

---

*This document covers everything needed for an AI agent or bot to connect as a player, receive game state, make decisions, and send actions. The WebSocket server handles all game logic — the agent just needs to join, observe, and act.*
