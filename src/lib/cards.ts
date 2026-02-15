// Card system for Private Poker
// Each card is represented as a number 0-51
// Suit: 0=♠, 1=♥, 2=♦, 3=♣
// Rank: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
  value: number; // 0-51
  faceUp: boolean;
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export const SUIT_COLORS: Record<Suit, string> = {
  spades: "#1a1a2e",
  hearts: "#e74c3c",
  diamonds: "#e74c3c",
  clubs: "#1a1a2e",
};

export function cardFromNumber(num: number): Card {
  const suitIndex = Math.floor(num / 13);
  const rankIndex = num % 13;
  return {
    rank: RANKS[rankIndex],
    suit: SUITS[suitIndex],
    value: num,
    faceUp: true,
  };
}

export function numberFromCard(rank: Rank, suit: Suit): number {
  return SUITS.indexOf(suit) * 13 + RANKS.indexOf(rank);
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let i = 0; i < 52; i++) {
    deck.push({ ...cardFromNumber(i), faceUp: false });
  }
  return deck;
}

export function shuffleDeck(deck: Card[], seed?: number): Card[] {
  const shuffled = [...deck];
  // Fisher-Yates shuffle with optional seed for determinism
  let rng = seed || Math.random() * 1000000;
  for (let i = shuffled.length - 1; i > 0; i--) {
    rng = (rng * 16807 + 0) % 2147483647;
    const j = rng % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// =================== HAND EVALUATION ===================

export type HandRank =
  | "Royal Flush"
  | "Straight Flush"
  | "Four of a Kind"
  | "Full House"
  | "Flush"
  | "Straight"
  | "Three of a Kind"
  | "Two Pair"
  | "One Pair"
  | "High Card";

export interface HandResult {
  rank: HandRank;
  score: number; // Higher = better
  cards: Card[]; // Best 5 cards
  description: string;
}

const HAND_RANKINGS: HandRank[] = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
  "Royal Flush",
];

function getRankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 2; // 2=2, 3=3, ..., J=11, Q=12, K=13, A=14
}

function sortByRank(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) => getRankValue(b.rank) - getRankValue(a.rank)
  );
}

function getGroups(cards: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>();
  for (const card of cards) {
    const group = groups.get(card.rank) || [];
    group.push(card);
    groups.set(card.rank, group);
  }
  return groups;
}

function isFlush(cards: Card[]): Card[] | null {
  const suitCounts = new Map<Suit, Card[]>();
  for (const card of cards) {
    const group = suitCounts.get(card.suit) || [];
    group.push(card);
    suitCounts.set(card.suit, group);
  }
  for (const [, group] of suitCounts) {
    if (group.length >= 5) {
      return sortByRank(group).slice(0, 5);
    }
  }
  return null;
}

function isStraight(cards: Card[]): Card[] | null {
  const sorted = sortByRank(cards);
  const uniqueRanks = [...new Set(sorted.map((c) => getRankValue(c.rank)))];

  // Check for regular straight
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
      const straightCards: Card[] = [];
      for (let j = i; j < i + 5; j++) {
        const card = sorted.find(
          (c) =>
            getRankValue(c.rank) === uniqueRanks[j] &&
            !straightCards.includes(c)
        );
        if (card) straightCards.push(card);
      }
      if (straightCards.length === 5) return straightCards;
    }
  }

  // Check for wheel (A-2-3-4-5)
  if (
    uniqueRanks.includes(14) &&
    uniqueRanks.includes(2) &&
    uniqueRanks.includes(3) &&
    uniqueRanks.includes(4) &&
    uniqueRanks.includes(5)
  ) {
    const wheelCards: Card[] = [];
    for (const rv of [5, 4, 3, 2, 14]) {
      const card = sorted.find(
        (c) => getRankValue(c.rank) === rv && !wheelCards.includes(c)
      );
      if (card) wheelCards.push(card);
    }
    if (wheelCards.length === 5) return wheelCards;
  }

  return null;
}

export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    return {
      rank: "High Card",
      score: 0,
      cards: sortByRank(allCards).slice(0, 5),
      description: "Not enough cards",
    };
  }

  const sorted = sortByRank(allCards);
  const groups = getGroups(allCards);
  const flushCards = isFlush(allCards);
  const straightCards = isStraight(allCards);

  // Royal Flush
  if (flushCards && straightCards) {
    const straightFlush = isStraight(flushCards);
    if (straightFlush && getRankValue(straightFlush[0].rank) === 14) {
      return {
        rank: "Royal Flush",
        score: 9000 + 14,
        cards: straightFlush,
        description: "Royal Flush!",
      };
    }
    if (straightFlush) {
      return {
        rank: "Straight Flush",
        score: 8000 + getRankValue(straightFlush[0].rank),
        cards: straightFlush,
        description: `Straight Flush, ${straightFlush[0].rank} high`,
      };
    }
  }

  // Four of a Kind
  for (const [rank, group] of groups) {
    if (group.length === 4) {
      const kicker = sorted.find((c) => c.rank !== rank)!;
      return {
        rank: "Four of a Kind",
        score: 7000 + getRankValue(rank) * 15 + getRankValue(kicker.rank),
        cards: [...group, kicker],
        description: `Four ${rank}s`,
      };
    }
  }

  // Full House
  let threeKind: Card[] | null = null;
  let pair: Card[] | null = null;
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => getRankValue(b[0]) - getRankValue(a[0])
  );

  for (const [, group] of sortedGroups) {
    if (group.length >= 3 && !threeKind) {
      threeKind = group.slice(0, 3);
    } else if (group.length >= 2 && !pair) {
      pair = group.slice(0, 2);
    }
  }

  if (threeKind && pair) {
    return {
      rank: "Full House",
      score:
        6000 +
        getRankValue(threeKind[0].rank) * 15 +
        getRankValue(pair[0].rank),
      cards: [...threeKind, ...pair],
      description: `Full House, ${threeKind[0].rank}s full of ${pair[0].rank}s`,
    };
  }

  // Flush
  if (flushCards) {
    return {
      rank: "Flush",
      score: 5000 + getRankValue(flushCards[0].rank),
      cards: flushCards,
      description: `Flush, ${flushCards[0].rank} high`,
    };
  }

  // Straight
  if (straightCards) {
    return {
      rank: "Straight",
      score: 4000 + getRankValue(straightCards[0].rank),
      cards: straightCards,
      description: `Straight, ${straightCards[0].rank} high`,
    };
  }

  // Three of a Kind
  if (threeKind) {
    const kickers = sorted
      .filter((c) => c.rank !== threeKind![0].rank)
      .slice(0, 2);
    return {
      rank: "Three of a Kind",
      score: 3000 + getRankValue(threeKind[0].rank),
      cards: [...threeKind, ...kickers],
      description: `Three ${threeKind[0].rank}s`,
    };
  }

  // Two Pair
  const pairs: Card[][] = [];
  for (const [, group] of sortedGroups) {
    if (group.length >= 2) pairs.push(group.slice(0, 2));
  }
  if (pairs.length >= 2) {
    const kicker = sorted.find(
      (c) => c.rank !== pairs[0][0].rank && c.rank !== pairs[1][0].rank
    )!;
    return {
      rank: "Two Pair",
      score:
        2000 +
        getRankValue(pairs[0][0].rank) * 15 +
        getRankValue(pairs[1][0].rank),
      cards: [...pairs[0], ...pairs[1], kicker],
      description: `Two Pair, ${pairs[0][0].rank}s and ${pairs[1][0].rank}s`,
    };
  }

  // One Pair
  if (pairs.length === 1) {
    const kickers = sorted
      .filter((c) => c.rank !== pairs[0][0].rank)
      .slice(0, 3);
    return {
      rank: "One Pair",
      score: 1000 + getRankValue(pairs[0][0].rank),
      cards: [...pairs[0], ...kickers],
      description: `Pair of ${pairs[0][0].rank}s`,
    };
  }

  // High Card
  return {
    rank: "High Card",
    score: getRankValue(sorted[0].rank),
    cards: sorted.slice(0, 5),
    description: `${sorted[0].rank} high`,
  };
}

export function compareHands(hand1: HandResult, hand2: HandResult): number {
  return hand1.score - hand2.score;
}
