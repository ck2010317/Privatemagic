import { create } from "zustand";
import {
  Card,
  createDeck,
  shuffleDeck,
  evaluateHand,
  compareHands,
  HandResult,
} from "./cards";
import { getAIDecision } from "./aiOpponent";

export type GamePhase =
  | "lobby"
  | "waiting"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "settled";

export type PlayerAction = "fold" | "check" | "call" | "raise" | "allin";

export type GameMode = "ai" | "multiplayer";

export interface Player {
  id: string;
  name: string;
  publicKey: string;
  avatar: string;
  balance: number;
  currentBet: number;
  totalBet: number;
  hand: Card[];
  hasFolded: boolean;
  isAllIn: boolean;
  isConnected: boolean;
  handResult?: HandResult;
  hasActedThisRound: boolean;
}

export interface BettingBid {
  id: string;
  bettor: string;
  bettorName: string;
  betOnPlayer: 1 | 2;
  amount: number;
  timestamp: number;
}

export interface BettingPool {
  totalPoolPlayer1: number;
  totalPoolPlayer2: number;
  bets: BettingBid[];
  isSettled: boolean;
  winningPlayer: 0 | 1 | 2;
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  mode: GameMode;
  pot: number;
  buyIn: number;
  currentBet: number;
  dealer: 0 | 1;
  turn: 0 | 1;
  communityCards: Card[];
  deck: Card[];
  player1: Player | null;
  player2: Player | null;
  myPlayerIndex: 0 | 1 | -1;
  bettingPool: BettingPool;
  winner: string | null;
  winnerHandResult: HandResult | null;
  isAnimating: boolean;
  showCards: boolean;
  lastAction: string;
  aiMessage: string;
  chatMessages: { sender: string; message: string; timestamp: number }[];

  // AI mode
  createGame: (buyIn: number, playerKey: string, playerName: string) => void;
  // Multiplayer (handled by multiplayer.ts, these are local helpers)
  joinGame: (playerKey: string, playerName: string) => void;
  dealCards: () => void;
  performAction: (action: PlayerAction, raiseAmount?: number) => void;
  advancePhase: () => void;
  placeBet: (bettor: string, bettorName: string, betOnPlayer: 1 | 2, amount: number) => void;
  resetGame: () => void;
  setMyPlayerIndex: (index: 0 | 1 | -1) => void;
  setMode: (mode: GameMode) => void;
}

const AI_NAMES = ["SatoshiBot", "CryptoShark", "BlockBluffer", "ChainGambler", "PokerNode", "HashKing", "SolanaAce", "MagicPlayer"];
const DEFAULT_AVATARS = ["🎭", "🦊", "🐺", "🦁", "🐯", "🦅", "🐉", "🎪"];

function makeAIKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";
  let key = "";
  for (let i = 0; i < 44; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

function triggerAITurn() {
  const state = useGameStore.getState();
  if (state.mode !== "ai") return;
  if (state.turn !== 1) return;
  if (!state.player2 || state.player2.hasFolded || state.player2.isAllIn) return;
  if (state.phase === "lobby" || state.phase === "waiting" || state.phase === "showdown" || state.phase === "settled") return;

  const decision = getAIDecision(
    state.player2.hand,
    state.communityCards,
    state.currentBet,
    state.player2.currentBet,
    state.pot,
    state.buyIn,
    state.phase
  );

  useGameStore.setState({ aiMessage: "🤔 Thinking..." });

  setTimeout(() => {
    useGameStore.setState({ aiMessage: decision.message });
    setTimeout(() => {
      const current = useGameStore.getState();
      if (current.turn !== 1) return;
      if (current.phase === "showdown" || current.phase === "settled" || current.phase === "lobby") return;
      current.performAction(decision.action, decision.raiseAmount);
      setTimeout(() => useGameStore.setState({ aiMessage: "" }), 1500);
    }, 400);
  }, decision.delay);
}

export const useGameStore = create<GameState>((set, get) => ({
  gameId: "",
  phase: "lobby",
  mode: "ai",
  pot: 0,
  buyIn: 0,
  currentBet: 0,
  dealer: 0,
  turn: 0,
  communityCards: [],
  deck: [],
  player1: null,
  player2: null,
  myPlayerIndex: -1,
  bettingPool: { totalPoolPlayer1: 0, totalPoolPlayer2: 0, bets: [], isSettled: false, winningPlayer: 0 },
  winner: null,
  winnerHandResult: null,
  isAnimating: false,
  showCards: false,
  lastAction: "",
  aiMessage: "",
  chatMessages: [],

  setMode: (mode) => set({ mode }),

  createGame: (buyIn, playerKey, playerName) => {
    // AI mode: auto-add AI and start
    const gameId = Math.floor(Math.random() * 100000000).toString();
    const deck = shuffleDeck(createDeck(), Date.now());
    const aiName = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
    const aiKey = makeAIKey();

    const deckCopy = [...deck];
    const p1Cards = [deckCopy.pop()!, deckCopy.pop()!].map(c => ({ ...c, faceUp: true }));
    const p2Cards = [deckCopy.pop()!, deckCopy.pop()!].map(c => ({ ...c, faceUp: true }));
    const community = [deckCopy.pop()!, deckCopy.pop()!, deckCopy.pop()!, deckCopy.pop()!, deckCopy.pop()!].map(c => ({ ...c, faceUp: false }));

    const smallBlind = Math.floor(buyIn * 0.02) || 1;
    const bigBlind = smallBlind * 2;

    set({
      gameId,
      phase: "preflop",
      mode: "ai",
      buyIn,
      pot: smallBlind + bigBlind,
      currentBet: bigBlind,
      dealer: 0,
      turn: 0,
      deck: deckCopy,
      communityCards: community,
      player1: {
        id: "player1", name: playerName, publicKey: playerKey,
        avatar: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
        balance: buyIn - smallBlind, currentBet: smallBlind, totalBet: smallBlind,
        hand: p1Cards, hasFolded: false, isAllIn: false, isConnected: true, hasActedThisRound: false,
      },
      player2: {
        id: "player2", name: aiName, publicKey: aiKey, avatar: "🤖",
        balance: buyIn - bigBlind, currentBet: bigBlind, totalBet: bigBlind,
        hand: p2Cards, hasFolded: false, isAllIn: false, isConnected: true, hasActedThisRound: false,
      },
      myPlayerIndex: 0,
      isAnimating: true,
      lastAction: "Cards dealt! 🎴",
      aiMessage: "",
      winner: null, winnerHandResult: null, showCards: false,
      bettingPool: { totalPoolPlayer1: 0, totalPoolPlayer2: 0, bets: [], isSettled: false, winningPlayer: 0 },
    });

    setTimeout(() => set({ isAnimating: false }), 1500);
  },

  joinGame: (playerKey, playerName) => {
    const state = get();
    if (state.player2) return;
    set({
      phase: "preflop",
      pot: state.buyIn * 2,
      player2: {
        id: "player2", name: playerName, publicKey: playerKey,
        avatar: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
        balance: state.buyIn, currentBet: 0, totalBet: state.buyIn,
        hand: [], hasFolded: false, isAllIn: false, isConnected: true, hasActedThisRound: false,
      },
    });
    setTimeout(() => get().dealCards(), 1000);
  },

  dealCards: () => {
    const state = get();
    const deck = [...state.deck];
    const p1Cards = [deck.pop()!, deck.pop()!].map(c => ({ ...c, faceUp: true }));
    const p2Cards = [deck.pop()!, deck.pop()!].map(c => ({ ...c, faceUp: true }));
    const community = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!].map(c => ({ ...c, faceUp: false }));

    set({
      isAnimating: true, deck, communityCards: community,
      player1: state.player1 ? { ...state.player1, hand: p1Cards, hasActedThisRound: false } : null,
      player2: state.player2 ? { ...state.player2, hand: p2Cards, hasActedThisRound: false } : null,
      lastAction: "Cards dealt! 🎴",
    });
    setTimeout(() => set({ isAnimating: false }), 1500);
  },

  performAction: (action, raiseAmount) => {
    const state = get();

    // ── MULTIPLAYER MODE: just send to server, server is authoritative ──
    if (state.mode === "multiplayer") {
      // Dynamic import to avoid circular dependency
      import("./multiplayer").then(({ sendAction }) => {
        sendAction(action, raiseAmount);
      });
      return;
    }

    // ── AI MODE: process locally ──
    const idx = state.turn;
    const current = idx === 0 ? state.player1 : state.player2;
    const other = idx === 0 ? state.player2 : state.player1;
    if (!current || !other) return;

    const me = { ...current };
    const opp = { ...other };
    let pot = state.pot;
    let bet = state.currentBet;
    let phase = state.phase;
    let winner: string | null = state.winner;
    const nextTurn: 0 | 1 = idx === 0 ? 1 : 0;
    let shouldAdvance = false;

    me.hasActedThisRound = true;

    switch (action) {
      case "fold":
        me.hasFolded = true;
        winner = other.publicKey;
        phase = "showdown";
        break;
      case "check":
        if (bet > me.currentBet) return;
        if (opp.hasActedThisRound && opp.currentBet === me.currentBet) shouldAdvance = true;
        break;
      case "call": {
        const diff = bet - me.currentBet;
        if (diff <= 0) return;
        me.balance -= diff;
        me.currentBet = bet;
        me.totalBet += diff;
        pot += diff;
        shouldAdvance = true;
        break;
      }
      case "raise": {
        const amt = raiseAmount || bet * 2 || Math.floor(state.buyIn * 0.1);
        const diff = amt - me.currentBet;
        me.balance -= diff;
        me.currentBet = amt;
        me.totalBet += diff;
        bet = amt;
        pot += diff;
        opp.hasActedThisRound = false;
        break;
      }
      case "allin": {
        const rem = me.balance;
        me.isAllIn = true;
        me.currentBet += rem;
        me.totalBet += rem;
        me.balance = 0;
        pot += rem;
        if (me.currentBet > bet) { bet = me.currentBet; opp.hasActedThisRound = false; }
        if (opp.isAllIn || opp.currentBet >= me.currentBet) shouldAdvance = true;
        break;
      }
    }

    const labels: Record<string, string> = {
      fold: `${current.name} folds 🏳️`,
      check: `${current.name} checks ✅`,
      call: `${current.name} calls 📞`,
      raise: `${current.name} raises 📈`,
      allin: `${current.name} ALL IN! 🔥`,
    };

    const updates: Partial<GameState> = {
      pot, currentBet: bet, phase: phase as GamePhase, turn: nextTurn,
      winner, lastAction: labels[action] || "",
    };
    if (idx === 0) { updates.player1 = me; updates.player2 = opp; }
    else { updates.player2 = me; updates.player1 = opp; }
    set(updates);

    // Fold → settle
    if (winner && phase === "showdown") {
      setTimeout(() => {
        const s = get();
        set({
          communityCards: s.communityCards.map(c => ({ ...c, faceUp: true })),
          showCards: true, phase: "settled",
          bettingPool: { ...s.bettingPool, isSettled: true, winningPlayer: winner === s.player1?.publicKey ? 1 : 2 },
        });
      }, 1500);
      return;
    }

    // Both all-in → run out all streets
    if (shouldAdvance && !winner && me.isAllIn && opp.isAllIn) {
      let delay = 800;
      const phases: GamePhase[] = ["preflop", "flop", "turn", "river"];
      const pi = phases.indexOf(state.phase);
      for (let i = pi; i < phases.length; i++) {
        setTimeout(() => get().advancePhase(), delay);
        delay += 1200;
      }
      return;
    }

    // Normal advance
    if (shouldAdvance && !winner) {
      setTimeout(() => get().advancePhase(), 800);
      return;
    }

    // AI turn
    if (nextTurn === 1 && !winner) {
      setTimeout(() => triggerAITurn(), 300);
    }
  },

  advancePhase: () => {
    const state = get();
    let newPhase: GamePhase;
    let revealCount: number;

    switch (state.phase) {
      case "preflop": newPhase = "flop"; revealCount = 3; break;
      case "flop": newPhase = "turn"; revealCount = 4; break;
      case "turn": newPhase = "river"; revealCount = 5; break;
      case "river": newPhase = "showdown"; revealCount = 5; break;
      default: return;
    }

    const revealed = state.communityCards.map((c, i) => ({ ...c, faceUp: i < revealCount }));
    const p1 = state.player1 ? { ...state.player1, currentBet: 0, hasActedThisRound: false } : null;
    const p2 = state.player2 ? { ...state.player2, currentBet: 0, hasActedThisRound: false } : null;

    set({
      phase: newPhase, communityCards: revealed, currentBet: 0, turn: 0,
      player1: p1, player2: p2, isAnimating: true,
      lastAction: `${newPhase.charAt(0).toUpperCase() + newPhase.slice(1)}! 🃏`,
    });
    setTimeout(() => set({ isAnimating: false }), 1000);

    if (newPhase === "showdown") {
      setTimeout(() => {
        const s = get();
        if (!s.player1 || !s.player2) return;
        const vis = revealed.filter(c => c.faceUp);
        const h1 = evaluateHand(s.player1.hand, vis);
        const h2 = evaluateHand(s.player2.hand, vis);
        const cmp = compareHands(h1, h2);

        let w: string | null;
        let wh: HandResult;
        let wi: 1 | 2;
        if (cmp > 0) { w = s.player1.publicKey; wh = h1; wi = 1; }
        else if (cmp < 0) { w = s.player2.publicKey; wh = h2; wi = 2; }
        else { w = null; wh = h1; wi = 1; }

        set({
          winner: w, winnerHandResult: wh, showCards: true, phase: "settled",
          player1: { ...s.player1, handResult: h1 },
          player2: { ...s.player2, handResult: h2 },
          bettingPool: { ...s.bettingPool, isSettled: true, winningPlayer: w ? wi : 0 },
        });
      }, 2000);
    }
  },

  placeBet: (bettor, bettorName, betOnPlayer, amount) => {
    const state = get();
    if (state.bettingPool.isSettled) return;

    if (state.mode === "multiplayer") {
      import("./multiplayer").then(({ sendBet }) => {
        sendBet(bettor, bettorName, betOnPlayer, amount);
      });
      return;
    }

    const newBet: BettingBid = {
      id: `bet_${Date.now()}_${Math.random()}`, bettor, bettorName, betOnPlayer, amount, timestamp: Date.now(),
    };
    set({
      bettingPool: {
        ...state.bettingPool,
        totalPoolPlayer1: state.bettingPool.totalPoolPlayer1 + (betOnPlayer === 1 ? amount : 0),
        totalPoolPlayer2: state.bettingPool.totalPoolPlayer2 + (betOnPlayer === 2 ? amount : 0),
        bets: [...state.bettingPool.bets, newBet],
      },
    });
  },

  resetGame: () => {
    const state = get();
    if (state.mode === "multiplayer") {
      import("./multiplayer").then(({ requestRematch }) => {
        requestRematch();
      });
      return;
    }
    set({
      gameId: "", phase: "lobby", mode: "ai", pot: 0, buyIn: 0, currentBet: 0, dealer: 0, turn: 0,
      communityCards: [], deck: [], player1: null, player2: null, myPlayerIndex: -1,
      bettingPool: { totalPoolPlayer1: 0, totalPoolPlayer2: 0, bets: [], isSettled: false, winningPlayer: 0 },
      winner: null, winnerHandResult: null, isAnimating: false, showCards: false,
      lastAction: "", aiMessage: "", chatMessages: [],
    });
  },

  setMyPlayerIndex: (index) => set({ myPlayerIndex: index }),
}));
