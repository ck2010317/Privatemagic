// Multiplayer WebSocket client for Private Poker
// Connects to the game server and syncs state with the zustand store

import { useGameStore, GameState, GamePhase } from "./gameStore";

type GameMode = "ai" | "multiplayer";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let currentMode: GameMode = "ai";
let serverUrl = "";

export function getServerUrl(): string {
  if (typeof window === "undefined") return "";
  // Check for environment variable first
  const envUrl = process.env.NEXT_PUBLIC_WS_SERVER;
  if (envUrl) return envUrl;
  // Production: Render server
  const isProd = typeof window !== "undefined" && window.location.hostname !== "localhost";
  if (isProd) {
    return "wss://privatemagic.onrender.com";
  }
  // Dev: localhost
  return "ws://localhost:8080";
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function getMode(): GameMode {
  return currentMode;
}

function connect(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    
    serverUrl = url;
    
    // Convert https:// URLs to wss:// for WebSocket
    const wsUrl = url.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    console.log("[MP] Connecting to:", wsUrl);
    
    ws = new WebSocket(wsUrl);
    let timeout = setTimeout(() => {
      reject(new Error("WebSocket connection timeout"));
      ws?.close();
    }, 15000); // 15 second timeout
    
    ws.onopen = () => {
      clearTimeout(timeout);
      console.log("[MP] Connected to game server");
      // Start ping interval
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
      resolve();
    };
    
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleServerMessage(msg);
    };
    
    ws.onclose = () => {
      console.log("[MP] Disconnected");
      cleanup();
      // Auto-reconnect if we were in a game
      const state = useGameStore.getState();
      if (currentMode === "multiplayer" && state.phase !== "lobby" && state.phase !== "settled") {
        reconnectTimer = setTimeout(() => {
          console.log("[MP] Attempting reconnect...");
          connect(serverUrl).catch(() => {});
        }, 3000);
      }
    };
    
    ws.onerror = () => {
      reject(new Error("WebSocket connection failed"));
    };
  });
}

function cleanup() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  ws = null;
}

function sendMsg(msg: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleServerMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case "created": {
      useGameStore.setState({
        gameId: msg.roomCode as string,
        phase: "waiting" as GamePhase,
        myPlayerIndex: msg.playerIndex as 0 | 1 | -1,
      });
      break;
    }
    
    case "joined": {
      const joinUpdate: Partial<GameState> = {
        gameId: msg.roomCode as string,
        myPlayerIndex: msg.playerIndex as 0 | 1 | -1,
      };
      // Store on-chain game ID so player 2 can pay buy-in
      if (msg.onChainGameId) {
        joinUpdate.onChainGameId = msg.onChainGameId as number;
        joinUpdate.isOnChain = true;
      }
      if (msg.buyIn) {
        joinUpdate.buyIn = msg.buyIn as number;
      }
      useGameStore.setState(joinUpdate);
      break;
    }
    
    case "state": {
      // Server sends the authoritative game state
      const s = msg as Record<string, unknown>;
      
      const stateUpdate: Partial<GameState> = {
        gameId: s.gameId as string,
        phase: s.phase as GamePhase,
        pot: s.pot as number,
        buyIn: s.buyIn as number,
        currentBet: s.currentBet as number,
        dealer: s.dealer as 0 | 1,
        turn: s.turn as 0 | 1,
        communityCards: s.communityCards as GameState["communityCards"],
        player1: s.player1 as GameState["player1"],
        player2: s.player2 as GameState["player2"],
        myPlayerIndex: s.myPlayerIndex as 0 | 1 | -1,
        winner: s.winner as string | null,
        winnerHandResult: s.winnerHandResult as GameState["winnerHandResult"],
        showCards: s.showCards as boolean,
        lastAction: s.lastAction as string,
        bettingPool: s.bettingPool as GameState["bettingPool"],
        isAnimating: false,
      };

      // Propagate on-chain game ID from server if present
      if (s.onChainGameId) {
        stateUpdate.onChainGameId = s.onChainGameId as number;
        stateUpdate.isOnChain = true;
      }

      useGameStore.setState(stateUpdate);
      break;
    }
    
    case "error": {
      console.error("[MP] Server error:", msg.message);
      break;
    }
    
    case "pong": break;
  }
}

// ─── Public API ──────────────────────────────────────────

export async function createMultiplayerGame(buyIn: number, playerKey: string, playerName: string): Promise<string> {
  currentMode = "multiplayer";
  const url = getServerUrl();
  await connect(url);

  // Include on-chain game ID so player 2 can pay buy-in on-chain
  const onChainGameId = useGameStore.getState().onChainGameId;

  sendMsg({
    type: "create",
    buyIn,
    publicKey: playerKey,
    name: playerName,
    onChainGameId: onChainGameId || null,
  });
  
  // Wait for room code
  return new Promise((resolve) => {
    const check = setInterval(() => {
      const state = useGameStore.getState();
      if (state.gameId) {
        clearInterval(check);
        resolve(state.gameId);
      }
    }, 100);
    // Timeout after 10s
    setTimeout(() => { clearInterval(check); resolve(""); }, 10000);
  });
}

export async function joinMultiplayerGame(roomCode: string, playerKey: string, playerName: string): Promise<boolean> {
  currentMode = "multiplayer";
  const url = getServerUrl();
  await connect(url);
  
  sendMsg({
    type: "join",
    roomCode: roomCode.toUpperCase(),
    publicKey: playerKey,
    name: playerName,
  });
  
  // Wait for join confirmation
  return new Promise((resolve) => {
    const check = setInterval(() => {
      const state = useGameStore.getState();
      if (state.gameId) {
        clearInterval(check);
        resolve(true);
      }
    }, 100);
    setTimeout(() => { clearInterval(check); resolve(false); }, 10000);
  });
}

export function sendAction(action: string, raiseAmount?: number) {
  if (currentMode !== "multiplayer") return;
  sendMsg({ type: "action", action, raiseAmount });
}

export function sendBet(publicKey: string, name: string, betOnPlayer: 1 | 2, amount: number) {
  if (currentMode !== "multiplayer") return;
  sendMsg({ type: "bet", publicKey, name, betOnPlayer, amount });
}

export function requestRematch() {
  if (currentMode !== "multiplayer") return;
  sendMsg({ type: "rematch" });
}

export function disconnect() {
  if (ws) { ws.close(); ws = null; }
  cleanup();
  currentMode = "ai";
}

export function setMode(mode: GameMode) {
  currentMode = mode;
}
