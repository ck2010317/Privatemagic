// Private Poker Multiplayer WebSocket Server
// Manages game rooms, deals cards server-side, relays actions between players
// Cards are private — each player only receives their own hand

import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`🃏 Private Poker server running on port ${PORT}`);

// ─── Card Engine ─────────────────────────────────────────
const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, faceUp: false });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Hand evaluation (simplified for server-side winner determination)
const HAND_RANKS = {
  "Royal Flush": 10, "Straight Flush": 9, "Four of a Kind": 8,
  "Full House": 7, "Flush": 6, "Straight": 5, "Three of a Kind": 4,
  "Two Pair": 3, "One Pair": 2, "High Card": 1,
};

const RANK_VALUES = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };

function evaluateHand(hand, community) {
  const all = [...hand, ...community];
  const values = all.map(c => RANK_VALUES[c.rank]).sort((a,b) => b - a);
  const suits = {};
  const ranks = {};
  for (const c of all) {
    suits[c.suit] = (suits[c.suit] || 0) + 1;
    ranks[c.rank] = (ranks[c.rank] || 0) + 1;
  }
  
  const flushSuit = Object.entries(suits).find(([,v]) => v >= 5);
  const isFlush = !!flushSuit;
  const flushCards = isFlush ? all.filter(c => c.suit === flushSuit[0]).map(c => RANK_VALUES[c.rank]).sort((a,b) => b-a) : [];
  
  const uniqueVals = [...new Set(values)].sort((a,b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  for (let i = 0; i <= uniqueVals.length - 5; i++) {
    if (uniqueVals[i] - uniqueVals[i+4] === 4) { isStraight = true; straightHigh = uniqueVals[i]; break; }
  }
  if (!isStraight && uniqueVals.includes(14) && uniqueVals.includes(5) && uniqueVals.includes(4) && uniqueVals.includes(3) && uniqueVals.includes(2)) {
    isStraight = true; straightHigh = 5;
  }

  const groups = Object.entries(ranks).map(([r,c]) => ({ rank: r, count: c, value: RANK_VALUES[r] })).sort((a,b) => b.count - a.count || b.value - a.value);
  const fourKind = groups.find(g => g.count === 4);
  const threeKind = groups.find(g => g.count === 3);
  const pairs = groups.filter(g => g.count === 2).sort((a,b) => b.value - a.value);

  let result;
  if (isFlush && isStraight && straightHigh === 14) result = { rank: "Royal Flush", value: 10, kickers: [14] };
  else if (isFlush && isStraight) result = { rank: "Straight Flush", value: 9, kickers: [straightHigh] };
  else if (fourKind) result = { rank: "Four of a Kind", value: 8, kickers: [fourKind.value] };
  else if (threeKind && pairs.length > 0) result = { rank: "Full House", value: 7, kickers: [threeKind.value, pairs[0].value] };
  else if (isFlush) result = { rank: "Flush", value: 6, kickers: flushCards.slice(0, 5) };
  else if (isStraight) result = { rank: "Straight", value: 5, kickers: [straightHigh] };
  else if (threeKind) result = { rank: "Three of a Kind", value: 4, kickers: [threeKind.value] };
  else if (pairs.length >= 2) result = { rank: "Two Pair", value: 3, kickers: [pairs[0].value, pairs[1].value] };
  else if (pairs.length === 1) result = { rank: "One Pair", value: 2, kickers: [pairs[0].value] };
  else result = { rank: "High Card", value: 1, kickers: values.slice(0, 5) };

  return result;
}

function compareHands(h1, h2) {
  if (h1.value !== h2.value) return h1.value - h2.value;
  for (let i = 0; i < Math.min(h1.kickers.length, h2.kickers.length); i++) {
    if (h1.kickers[i] !== h2.kickers[i]) return h1.kickers[i] - h2.kickers[i];
  }
  return 0;
}

// ─── Game Rooms ──────────────────────────────────────────
const rooms = new Map(); // roomCode -> GameRoom

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(buyIn) {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();
  
  const room = {
    code,
    buyIn,
    phase: "waiting", // waiting | preflop | flop | turn | river | showdown | settled
    players: [], // [{ws, id, name, publicKey, avatar, balance, currentBet, totalBet, hand[], hasFolded, isAllIn, hasActedThisRound}]
    spectators: [], // [{ws, id, name}]
    deck: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    dealer: 0,
    turn: 0,
    winner: null,
    winnerHand: null,
    bettingPool: { totalPoolPlayer1: 0, totalPoolPlayer2: 0, bets: [], isSettled: false, winningPlayer: 0 },
    onChainGameId: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

// ─── Broadcasting ────────────────────────────────────────
function getPublicPlayerData(player, forPlayerIndex, playerIndex) {
  // Players only see their own hand, opponent's hand is hidden until showdown
  const showHand = forPlayerIndex === playerIndex;
  return {
    id: player.id,
    name: player.name,
    publicKey: player.publicKey,
    avatar: player.avatar,
    balance: player.balance,
    currentBet: player.currentBet,
    totalBet: player.totalBet,
    hand: showHand ? player.hand.map(c => ({ ...c, faceUp: true })) : player.hand.map(() => ({ rank: "?", suit: "?", faceUp: false })),
    hasFolded: player.hasFolded,
    isAllIn: player.isAllIn,
    isConnected: player.isConnected,
    hasActedThisRound: player.hasActedThisRound,
    handResult: player.handResult || undefined,
  };
}

function broadcastState(room) {
  const showdown = room.phase === "showdown" || room.phase === "settled";
  
  // Send to each player with their private view
  room.players.forEach((player, idx) => {
    if (!player.ws || player.ws.readyState !== 1) return;
    
    const state = {
      type: "state",
      gameId: room.code,
      phase: room.phase,
      pot: room.pot,
      buyIn: room.buyIn,
      currentBet: room.currentBet,
      dealer: room.dealer,
      turn: room.turn,
      communityCards: room.communityCards,
      player1: room.players[0] ? getPublicPlayerData(room.players[0], idx, 0) : null,
      player2: room.players[1] ? getPublicPlayerData(room.players[1], idx, 1) : null,
      myPlayerIndex: idx,
      winner: room.winner,
      winnerHandResult: room.winnerHand,
      showCards: showdown,
      lastAction: room.lastAction || "",
      bettingPool: room.bettingPool,
      onChainGameId: room.onChainGameId || null,
    };
    
    // During showdown/settled, reveal all hands
    if (showdown && room.players[0] && room.players[1]) {
      state.player1 = { ...state.player1, hand: room.players[0].hand.map(c => ({ ...c, faceUp: true })) };
      state.player2 = { ...state.player2, hand: room.players[1].hand.map(c => ({ ...c, faceUp: true })) };
    }
    
    send(player.ws, state);
  });
  
  // Send to spectators (no hands visible until showdown)
  room.spectators.forEach(spec => {
    if (!spec.ws || spec.ws.readyState !== 1) return;
    const state = {
      type: "state",
      gameId: room.code,
      phase: room.phase,
      pot: room.pot,
      buyIn: room.buyIn,
      currentBet: room.currentBet,
      dealer: room.dealer,
      turn: room.turn,
      communityCards: room.communityCards,
      player1: room.players[0] ? getPublicPlayerData(room.players[0], -1, 0) : null,
      player2: room.players[1] ? getPublicPlayerData(room.players[1], -1, 1) : null,
      myPlayerIndex: -1,
      winner: room.winner,
      winnerHandResult: room.winnerHand,
      showCards: showdown,
      lastAction: room.lastAction || "",
      bettingPool: room.bettingPool,
      onChainGameId: room.onChainGameId || null,
    };
    if (showdown && room.players[0] && room.players[1]) {
      state.player1 = { ...state.player1, hand: room.players[0].hand.map(c => ({ ...c, faceUp: true })) };
      state.player2 = { ...state.player2, hand: room.players[1].hand.map(c => ({ ...c, faceUp: true })) };
    }
    send(spec.ws, state);
  });
}

function send(ws, data) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(data)); } catch {}
}

// ─── Game Logic (server-side) ────────────────────────────
function dealCards(room) {
  const deck = shuffleDeck(createDeck());
  room.deck = deck;
  
  room.players[0].hand = [deck.pop(), deck.pop()];
  room.players[1].hand = [deck.pop(), deck.pop()];
  room.communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()].map(c => ({ ...c, faceUp: false }));
  
  const smallBlind = Math.floor(room.buyIn * 0.02) || 1;
  const bigBlind = smallBlind * 2;
  
  // Player at dealer posts small blind, other posts big blind (heads-up rules)
  const sbIdx = room.dealer;
  const bbIdx = 1 - room.dealer;
  
  room.players[sbIdx].balance -= smallBlind;
  room.players[sbIdx].currentBet = smallBlind;
  room.players[sbIdx].totalBet = smallBlind;
  room.players[bbIdx].balance -= bigBlind;
  room.players[bbIdx].currentBet = bigBlind;
  room.players[bbIdx].totalBet = bigBlind;
  
  room.pot = smallBlind + bigBlind;
  room.currentBet = bigBlind;
  room.turn = sbIdx; // Small blind acts first preflop in heads-up
  room.phase = "preflop";
  room.winner = null;
  room.winnerHand = null;
  room.lastAction = "Cards dealt! 🎴";
  
  room.players.forEach(p => {
    p.hasFolded = false;
    p.isAllIn = false;
    p.hasActedThisRound = false;
    p.handResult = undefined;
  });
  
  broadcastState(room);
}

function performAction(room, playerIdx, action, raiseAmount) {
  if (room.turn !== playerIdx) return;
  if (room.phase === "lobby" || room.phase === "waiting" || room.phase === "showdown" || room.phase === "settled") return;
  
  const me = room.players[playerIdx];
  const opp = room.players[1 - playerIdx];
  if (!me || !opp || me.hasFolded) return;
  
  let shouldAdvance = false;
  me.hasActedThisRound = true;
  
  switch (action) {
    case "fold":
      me.hasFolded = true;
      room.winner = opp.publicKey;
      room.phase = "showdown";
      room.lastAction = `${me.name} folds 🏳️`;
      break;
    case "check":
      if (room.currentBet > me.currentBet) return;
      if (opp.hasActedThisRound && opp.currentBet === me.currentBet) shouldAdvance = true;
      room.lastAction = `${me.name} checks ✅`;
      break;
    case "call": {
      const diff = room.currentBet - me.currentBet;
      if (diff <= 0) return;
      me.balance -= diff;
      me.currentBet = room.currentBet;
      me.totalBet += diff;
      room.pot += diff;
      shouldAdvance = true;
      room.lastAction = `${me.name} calls 📞`;
      break;
    }
    case "raise": {
      const amt = raiseAmount || room.currentBet * 2 || Math.floor(room.buyIn * 0.1);
      const diff = amt - me.currentBet;
      if (diff <= 0 || diff > me.balance) return;
      me.balance -= diff;
      me.currentBet = amt;
      me.totalBet += diff;
      room.currentBet = amt;
      room.pot += diff;
      opp.hasActedThisRound = false;
      room.lastAction = `${me.name} raises 📈`;
      break;
    }
    case "allin": {
      const rem = me.balance;
      me.isAllIn = true;
      me.currentBet += rem;
      me.totalBet += rem;
      me.balance = 0;
      room.pot += rem;
      if (me.currentBet > room.currentBet) { room.currentBet = me.currentBet; opp.hasActedThisRound = false; }
      if (opp.isAllIn || opp.currentBet >= me.currentBet) shouldAdvance = true;
      room.lastAction = `${me.name} ALL IN! 🔥`;
      break;
    }
  }
  
  room.turn = 1 - playerIdx;
  broadcastState(room);
  
  // Fold → settle
  if (room.winner && room.phase === "showdown") {
    setTimeout(() => {
      room.communityCards = room.communityCards.map(c => ({ ...c, faceUp: true }));
      room.phase = "settled";
      room.bettingPool.isSettled = true;
      room.bettingPool.winningPlayer = room.winner === room.players[0]?.publicKey ? 1 : 2;
      broadcastState(room);
    }, 1500);
    return;
  }
  
  // Both all-in → run out
  if (shouldAdvance && !room.winner && me.isAllIn && opp.isAllIn) {
    let delay = 800;
    const phases = ["preflop", "flop", "turn", "river"];
    const pi = phases.indexOf(room.phase);
    for (let i = pi; i < phases.length; i++) {
      setTimeout(() => advancePhase(room), delay);
      delay += 1200;
    }
    return;
  }
  
  // Normal advance
  if (shouldAdvance && !room.winner) {
    setTimeout(() => advancePhase(room), 800);
    return;
  }
}

function advancePhase(room) {
  let newPhase, revealCount;
  switch (room.phase) {
    case "preflop": newPhase = "flop"; revealCount = 3; break;
    case "flop": newPhase = "turn"; revealCount = 4; break;
    case "turn": newPhase = "river"; revealCount = 5; break;
    case "river": newPhase = "showdown"; revealCount = 5; break;
    default: return;
  }
  
  room.communityCards = room.communityCards.map((c, i) => ({ ...c, faceUp: i < revealCount }));
  room.players.forEach(p => { p.currentBet = 0; p.hasActedThisRound = false; });
  room.currentBet = 0;
  room.turn = 1 - room.dealer; // Non-dealer acts first post-flop
  room.phase = newPhase;
  room.lastAction = `${newPhase.charAt(0).toUpperCase() + newPhase.slice(1)}! 🃏`;
  
  broadcastState(room);
  
  if (newPhase === "showdown") {
    setTimeout(() => resolveShowdown(room), 2000);
  }
}

function resolveShowdown(room) {
  if (!room.players[0] || !room.players[1]) return;
  
  const vis = room.communityCards.filter(c => c.faceUp);
  const h1 = evaluateHand(room.players[0].hand, vis);
  const h2 = evaluateHand(room.players[1].hand, vis);
  const cmp = compareHands(h1, h2);
  
  room.players[0].handResult = h1;
  room.players[1].handResult = h2;
  
  if (cmp > 0) { room.winner = room.players[0].publicKey; room.winnerHand = h1; room.bettingPool.winningPlayer = 1; }
  else if (cmp < 0) { room.winner = room.players[1].publicKey; room.winnerHand = h2; room.bettingPool.winningPlayer = 2; }
  else { room.winner = null; room.winnerHand = h1; room.bettingPool.winningPlayer = 0; }
  
  room.phase = "settled";
  room.bettingPool.isSettled = true;
  
  broadcastState(room);
}

// ─── Connection Handler ──────────────────────────────────
const AVATARS = ["🎭", "🦊", "🐺", "🦁", "🐯", "🦅", "🐉", "🎪"];

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  let currentRoom = null;
  let playerIndex = -1;
  
  console.log(`[${clientId.slice(0,8)}] Connected`);
  
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    
    switch (msg.type) {
      case "create": {
        const room = createRoom(msg.buyIn);
        if (msg.onChainGameId) room.onChainGameId = msg.onChainGameId;
        const player = {
          ws, id: clientId,
          name: msg.name || "Anon",
          publicKey: msg.publicKey,
          avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
          balance: msg.buyIn,
          currentBet: 0, totalBet: 0,
          hand: [],
          hasFolded: false, isAllIn: false, isConnected: true,
          hasActedThisRound: false,
        };
        room.players.push(player);
        currentRoom = room;
        playerIndex = 0;
        
        send(ws, { type: "created", roomCode: room.code, playerIndex: 0 });
        broadcastState(room);
        console.log(`[${clientId.slice(0,8)}] Created room ${room.code} (${msg.buyIn} lamports)`);
        break;
      }
      
      case "join": {
        const room = rooms.get(msg.roomCode?.toUpperCase());
        if (!room) { send(ws, { type: "error", message: "Room not found" }); return; }
        
        if (room.players.length >= 2) {
          // Join as spectator
          room.spectators.push({ ws, id: clientId, name: msg.name || "Spectator" });
          currentRoom = room;
          playerIndex = -1;
          send(ws, { type: "joined", roomCode: room.code, playerIndex: -1, role: "spectator" });
          broadcastState(room);
          console.log(`[${clientId.slice(0,8)}] Spectating room ${room.code}`);
          return;
        }
        
        const player = {
          ws, id: clientId,
          name: msg.name || "Anon",
          publicKey: msg.publicKey,
          avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
          balance: room.buyIn,
          currentBet: 0, totalBet: 0,
          hand: [],
          hasFolded: false, isAllIn: false, isConnected: true,
          hasActedThisRound: false,
        };
        room.players.push(player);
        currentRoom = room;
        playerIndex = 1;
        
        send(ws, { type: "joined", roomCode: room.code, playerIndex: 1, role: "player", onChainGameId: room.onChainGameId || null, buyIn: room.buyIn });
        console.log(`[${clientId.slice(0,8)}] Joined room ${room.code} (onChainGameId: ${room.onChainGameId || 'none'})`);
        
        // 2 players → deal cards!
        setTimeout(() => dealCards(room), 1500);
        break;
      }
      
      case "action": {
        if (!currentRoom || playerIndex < 0) return;
        performAction(currentRoom, playerIndex, msg.action, msg.raiseAmount);
        break;
      }
      
      case "bet": {
        if (!currentRoom) return;
        const room = currentRoom;
        if (room.bettingPool.isSettled) return;
        const bet = {
          id: `bet_${Date.now()}_${Math.random()}`,
          bettor: msg.publicKey,
          bettorName: msg.name || "Anon",
          betOnPlayer: msg.betOnPlayer,
          amount: msg.amount,
          timestamp: Date.now(),
        };
        room.bettingPool.bets.push(bet);
        if (msg.betOnPlayer === 1) room.bettingPool.totalPoolPlayer1 += msg.amount;
        else room.bettingPool.totalPoolPlayer2 += msg.amount;
        broadcastState(room);
        break;
      }
      
      case "rematch": {
        if (!currentRoom || playerIndex < 0) return;
        const room = currentRoom;
        if (room.phase !== "settled") return;
        
        // Reset for new hand
        room.dealer = 1 - room.dealer;
        room.bettingPool = { totalPoolPlayer1: 0, totalPoolPlayer2: 0, bets: [], isSettled: false, winningPlayer: 0 };
        room.players.forEach(p => {
          p.balance = room.buyIn;
          p.currentBet = 0; p.totalBet = 0;
          p.hand = []; p.hasFolded = false; p.isAllIn = false;
          p.hasActedThisRound = false; p.handResult = undefined;
        });
        
        setTimeout(() => dealCards(room), 1000);
        broadcastState(room);
        break;
      }
      
      case "ping": {
        send(ws, { type: "pong" });
        break;
      }
    }
  });
  
  ws.on("close", () => {
    console.log(`[${clientId.slice(0,8)}] Disconnected`);
    if (currentRoom) {
      // Remove spectator
      currentRoom.spectators = currentRoom.spectators.filter(s => s.id !== clientId);
      
      // Mark player disconnected
      if (playerIndex >= 0 && currentRoom.players[playerIndex]) {
        currentRoom.players[playerIndex].isConnected = false;
        currentRoom.players[playerIndex].ws = null;
        broadcastState(currentRoom);
        
        // Clean up room after 60s if player doesn't reconnect
        setTimeout(() => {
          if (currentRoom && currentRoom.players[playerIndex] && !currentRoom.players[playerIndex].isConnected) {
            // If game was in progress, other player wins
            if (currentRoom.phase !== "waiting" && currentRoom.phase !== "settled") {
              const otherIdx = 1 - playerIndex;
              if (currentRoom.players[otherIdx]) {
                currentRoom.winner = currentRoom.players[otherIdx].publicKey;
                currentRoom.phase = "settled";
                currentRoom.lastAction = `${currentRoom.players[playerIndex].name} disconnected`;
                broadcastState(currentRoom);
              }
            }
            // Delete room if both disconnected
            if (currentRoom.players.every(p => !p.isConnected)) {
              rooms.delete(currentRoom.code);
              console.log(`Room ${currentRoom.code} deleted (empty)`);
            }
          }
        }, 60000);
      }
    }
  });
  
  ws.on("error", () => {});
});

// Cleanup old rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 3600000) { // 1 hour
      rooms.delete(code);
      console.log(`Room ${code} expired`);
    }
  }
}, 600000);

// Health check via HTTP upgrade
wss.on("headers", (headers) => {
  headers.push("X-Server: privatepoker");
});
