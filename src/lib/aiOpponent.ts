// AI Opponent for demo mode
// Makes intelligent decisions based on hand strength and game state

import { Card, evaluateHand, HandRank } from "./cards";

type PlayerAction = "fold" | "check" | "call" | "raise" | "allin";

const HAND_STRENGTH: Record<HandRank, number> = {
  "High Card": 1,
  "One Pair": 2,
  "Two Pair": 3,
  "Three of a Kind": 4,
  "Straight": 5,
  "Flush": 6,
  "Full House": 7,
  "Four of a Kind": 8,
  "Straight Flush": 9,
  "Royal Flush": 10,
};

interface AIDecision {
  action: PlayerAction;
  raiseAmount?: number;
  delay: number; // ms to "think"
  message: string;
}

export function getAIDecision(
  aiHand: Card[],
  communityCards: Card[],
  currentBet: number,
  aiCurrentBet: number,
  pot: number,
  buyIn: number,
  phase: string
): AIDecision {
  // Evaluate current hand strength
  const visibleCommunity = communityCards.filter((c) => c.faceUp);
  const handResult =
    visibleCommunity.length >= 3
      ? evaluateHand(aiHand, visibleCommunity)
      : null;

  const handStrength = handResult
    ? HAND_STRENGTH[handResult.rank]
    : evaluateStartingHand(aiHand);

  const callAmount = currentBet - aiCurrentBet;
  const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0;

  // Random factor for unpredictability (0-1)
  const randomFactor = Math.random();

  // Thinking delay (0.8 to 2.5 seconds)
  const delay = 800 + Math.random() * 1700;

  // Pre-flop decisions (no community cards yet)
  if (phase === "preflop") {
    if (handStrength >= 8) {
      // Premium hand (AA, KK, QQ, AKs) — go big
      if (randomFactor > 0.6) {
        return { action: "allin", delay, message: "goes ALL IN! 🔥🔥🔥" };
      }
      return {
        action: "raise",
        raiseAmount: Math.floor(buyIn * 0.2),
        delay,
        message: "raises aggressively 💪",
      };
    }
    if (handStrength >= 6) {
      // Strong hand — raise or call
      if (randomFactor > 0.5) {
        return {
          action: "raise",
          raiseAmount: Math.floor(buyIn * 0.12),
          delay,
          message: "raises 📈",
        };
      }
      if (callAmount > 0) {
        return { action: "call", delay, message: "calls smoothly 😎" };
      }
      return {
        action: "raise",
        raiseAmount: Math.floor(buyIn * 0.08),
        delay,
        message: "raises 📈",
      };
    }
    if (handStrength >= 4) {
      // Decent hand — usually play it
      if (callAmount > buyIn * 0.2) {
        return randomFactor > 0.4
          ? { action: "call", delay, message: "calls after thinking... 🤔" }
          : { action: "fold", delay, message: "folds 🏳️" };
      }
      if (callAmount > 0) {
        return { action: "call", delay, message: "calls 📞" };
      }
      if (randomFactor > 0.6) {
        return {
          action: "raise",
          raiseAmount: Math.floor(buyIn * 0.06),
          delay,
          message: "raises 📈",
        };
      }
      return { action: "check", delay, message: "checks ✅" };
    }
    // Weak hand — still play sometimes (bluff or cheap call)
    if (callAmount > buyIn * 0.15) {
      return { action: "fold", delay, message: "folds 🏳️" };
    }
    if (callAmount > 0) {
      return randomFactor > 0.35
        ? { action: "call", delay, message: "calls 📞" }
        : { action: "fold", delay, message: "folds 🏳️" };
    }
    // No bet to call — check or bluff raise
    if (randomFactor > 0.75) {
      return {
        action: "raise",
        raiseAmount: Math.floor(buyIn * 0.06),
        delay: delay + 300,
        message: "raises... 🎭",
      };
    }
    return { action: "check", delay, message: "checks ✅" };
  }

  // ── Post-flop decisions (with community cards) ──

  if (handStrength >= 7) {
    // Monster hand — trap or go big
    if (randomFactor > 0.5) {
      return { action: "allin", delay, message: "goes ALL IN! 🔥🔥🔥" };
    }
    return {
      action: "raise",
      raiseAmount: Math.floor(pot * 0.8),
      delay,
      message: "raises big! 💰",
    };
  }

  if (handStrength >= 5) {
    // Strong hand — bet or raise
    if (callAmount > 0) {
      if (randomFactor > 0.6) {
        return {
          action: "raise",
          raiseAmount: Math.floor(pot * 0.6),
          delay,
          message: "re-raises! 💪",
        };
      }
      return { action: "call", delay, message: "calls 📞" };
    }
    // No bet — lead out
    return {
      action: "raise",
      raiseAmount: Math.floor(pot * 0.5),
      delay,
      message: "bets 📈",
    };
  }

  if (handStrength >= 3) {
    // Medium hand — call most bets, occasionally raise
    if (callAmount > pot * 0.8) {
      return randomFactor > 0.5
        ? { action: "call", delay, message: "calls after thinking... 🤔" }
        : { action: "fold", delay, message: "folds 🏳️" };
    }
    if (callAmount > 0) {
      return { action: "call", delay, message: "calls 📞" };
    }
    // No bet — bet or check
    if (randomFactor > 0.5) {
      return {
        action: "raise",
        raiseAmount: Math.floor(pot * 0.4),
        delay,
        message: "bets 📈",
      };
    }
    return { action: "check", delay, message: "checks ✅" };
  }

  if (handStrength >= 2) {
    // Weak pair — still fight
    if (callAmount > pot * 0.5) {
      return randomFactor > 0.4
        ? { action: "call", delay, message: "calls reluctantly 😬" }
        : { action: "fold", delay, message: "folds 🏳️" };
    }
    if (callAmount > 0) {
      return { action: "call", delay, message: "calls 📞" };
    }
    // Bluff sometimes
    if (randomFactor > 0.6) {
      return {
        action: "raise",
        raiseAmount: Math.floor(pot * 0.35),
        delay: delay + 400,
        message: "bets 📈",
      };
    }
    return { action: "check", delay, message: "checks ✅" };
  }

  // Nothing hand — bluff or give up
  if (callAmount === 0) {
    // No bet to face — bluff sometimes
    if (randomFactor > 0.65) {
      return {
        action: "raise",
        raiseAmount: Math.floor(pot * 0.55),
        delay: delay + 500,
        message: "bets... 🎭",
      };
    }
    return { action: "check", delay, message: "checks ✅" };
  }

  // Facing a bet with nothing
  if (callAmount <= buyIn * 0.05) {
    // Cheap call — take a chance
    return randomFactor > 0.3
      ? { action: "call", delay, message: "calls 📞" }
      : { action: "fold", delay, message: "folds 🏳️" };
  }

  // Big bluff re-raise sometimes
  if (randomFactor > 0.8) {
    return {
      action: "raise",
      raiseAmount: Math.floor(pot * 0.7),
      delay: delay + 600,
      message: "re-raises! 🎭💰",
    };
  }

  return { action: "fold", delay, message: "folds 🏳️" };
}

// Evaluate starting hand strength (pre-flop, no community cards)
function evaluateStartingHand(hand: Card[]): number {
  if (hand.length < 2) return 1;

  const ranks = hand.map((c) => rankValue(c.rank));
  const suited = hand[0].suit === hand[1].suit;
  const high = Math.max(...ranks);
  const low = Math.min(...ranks);
  const gap = high - low;
  const isPair = ranks[0] === ranks[1];

  if (isPair) {
    if (high >= 12) return 9; // AA, KK
    if (high >= 10) return 7; // QQ, JJ
    if (high >= 8) return 5; // TT, 99
    return 4; // Small pair
  }

  if (high === 14) {
    // Ace
    if (low >= 12) return suited ? 9 : 8; // AK
    if (low >= 10) return suited ? 7 : 6; // AQ, AJ
    if (suited) return 5; // Ax suited
    return 3;
  }

  if (high >= 12 && low >= 10) {
    return suited ? 6 : 5; // Face cards
  }

  if (suited && gap <= 2) return 4; // Suited connectors
  if (gap <= 1 && high >= 8) return 3; // Connected

  return 1; // Junk
}

function rankValue(rank: string): number {
  const values: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
  };
  return values[rank] || 0;
}
