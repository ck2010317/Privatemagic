/**
 * Solana Poker - On-Chain Program Integration
 *
 * Connects the frontend to the deployed Anchor program on devnet.
 * Uses MagicBlock Ephemeral Rollups for real-time gameplay in TEE,
 * with settlement back to Solana L1.
 *
 * Program ID: 5c9wR99j8ouv3dyDXxnUEvijM2TGzg8VLHU15RTqwWFD
 */

import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  DEVNET_RPC,
  TEE_URL,
  TEE_WS_URL,
  ER_VALIDATOR,
  DELEGATION_PROGRAM_ID,
  getGamePDA,
  getPlayerHandPDA,
  getBettingPoolPDA,
  getBetPDA,
} from "./solana";
import IDL from "./privatepoker_idl.json";

// =================== TYPES ===================

export interface GameAccount {
  gameId: BN;
  player1: PublicKey | null;
  player2: PublicKey | null;
  buyIn: BN;
  pot: BN;
  phase: GamePhase;
  communityCards: number[];
  communityCardCount: number;
  currentBet: BN;
  dealer: number;
  turn: number;
  winner: GameResult;
  deckSeed: BN;
}

export interface PlayerHandAccount {
  gameId: BN;
  player: PublicKey;
  cards: number[];
  hasFolded: boolean;
  currentBet: BN;
  totalBet: BN;
  isAllIn: boolean;
}

export interface BettingPoolAccount {
  gameId: BN;
  totalPoolPlayer1: BN;
  totalPoolPlayer2: BN;
  totalBettors: number;
  isSettled: boolean;
  winningPlayer: number;
}

export type GamePhase =
  | { waitingForPlayer: Record<string, never> }
  | { preFlop: Record<string, never> }
  | { flop: Record<string, never> }
  | { turn: Record<string, never> }
  | { river: Record<string, never> }
  | { showdown: Record<string, never> }
  | { settled: Record<string, never> };

export type GameResult =
  | { winner: [PublicKey] }
  | { tie: Record<string, never> }
  | { none: Record<string, never> };

export type Action =
  | { fold: Record<string, never> }
  | { check: Record<string, never> }
  | { call: Record<string, never> }
  | { raise: { amount: BN } }
  | { allIn: Record<string, never> };

export type AccountType =
  | { game: { gameId: BN } }
  | { playerHand: { gameId: BN; player: PublicKey } }
  | { bettingPool: { gameId: BN } };

// =================== PROGRAM SETUP ===================

const DEVNET_CONNECTION = new Connection(DEVNET_RPC, "confirmed");

/**
 * Get the Anchor program instance.
 * For read-only operations, no wallet needed.
 * For transactions, pass a wallet adapter.
 */
export function getProgram(
  wallet?: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction>; signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]> },
  connection?: Connection
): Program {
  const conn = connection || DEVNET_CONNECTION;

  if (wallet) {
    const provider = new AnchorProvider(conn, wallet as any, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    return new Program(IDL as Idl, provider);
  }

  // Read-only provider
  const provider = new AnchorProvider(conn, {} as any, {
    commitment: "confirmed",
  });
  return new Program(IDL as Idl, provider);
}

// =================== ON-CHAIN INSTRUCTIONS ===================

/**
 * Create a new poker game on-chain
 */
export async function createGameOnChain(
  program: Program,
  gameId: number,
  buyIn: number, // in lamports
  playerPubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [gamePDA] = getGamePDA(BigInt(gameId));
  const [playerHandPDA] = getPlayerHandPDA(BigInt(gameId), playerPubkey);

  const tx = await program.methods
    .createGame(gameIdBN, new BN(buyIn))
    .accounts({
      game: gamePDA,
      playerHand: playerHandPDA,
      player1: playerPubkey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Game created on-chain:", tx);
  return tx;
}

/**
 * Join an existing poker game
 */
export async function joinGameOnChain(
  program: Program,
  gameId: number,
  playerPubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [gamePDA] = getGamePDA(BigInt(gameId));
  const [playerHandPDA] = getPlayerHandPDA(BigInt(gameId), playerPubkey);

  const tx = await program.methods
    .joinGame(gameIdBN)
    .accounts({
      game: gamePDA,
      playerHand: playerHandPDA,
      player: playerPubkey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Joined game on-chain:", tx);
  return tx;
}

/**
 * Delegate game PDA to MagicBlock TEE validator for Ephemeral Rollup
 */
export async function delegateGameToER(
  program: Program,
  gameId: number,
  payerPubkey: PublicKey
): Promise<string> {
  const [gamePDA] = getGamePDA(BigInt(gameId));

  const tx = await program.methods
    .delegatePda({ game: { gameId: new BN(gameId) } })
    .accounts({
      pda: gamePDA,
      payer: payerPubkey,
    })
    .remainingAccounts([
      { pubkey: ER_VALIDATOR, isWritable: false, isSigner: false },
    ])
    .rpc();

  console.log("✅ Game delegated to TEE:", tx);
  return tx;
}

/**
 * Delegate player hand PDA to TEE for private card processing
 */
export async function delegateHandToER(
  program: Program,
  gameId: number,
  playerPubkey: PublicKey
): Promise<string> {
  const [handPDA] = getPlayerHandPDA(BigInt(gameId), playerPubkey);

  const tx = await program.methods
    .delegatePda({ playerHand: { gameId: new BN(gameId), player: playerPubkey } })
    .accounts({
      pda: handPDA,
      payer: playerPubkey,
    })
    .remainingAccounts([
      { pubkey: ER_VALIDATOR, isWritable: false, isSigner: false },
    ])
    .rpc();

  console.log("✅ Hand delegated to TEE:", tx);
  return tx;
}

/**
 * Deal cards (called on ER/TEE)
 */
export async function dealCardsOnChain(
  program: Program,
  gameId: number,
  player1Cards: [number, number],
  player2Cards: [number, number],
  communityCards: [number, number, number, number, number],
  dealerPubkey: PublicKey,
  player1Pubkey: PublicKey,
  player2Pubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [gamePDA] = getGamePDA(BigInt(gameId));
  const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
  const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);

  const tx = await program.methods
    .dealCards(gameIdBN, player1Cards, player2Cards, communityCards)
    .accounts({
      game: gamePDA,
      player1Hand: hand1PDA,
      player2Hand: hand2PDA,
      dealer: dealerPubkey,
    })
    .rpc();

  console.log("✅ Cards dealt on-chain:", tx);
  return tx;
}

/**
 * Perform a player action (check, call, raise, fold, all-in)
 */
export async function playerActionOnChain(
  program: Program,
  gameId: number,
  action: Action,
  playerPubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [gamePDA] = getGamePDA(BigInt(gameId));
  const [handPDA] = getPlayerHandPDA(BigInt(gameId), playerPubkey);

  const tx = await program.methods
    .playerAction(gameIdBN, action)
    .accounts({
      game: gamePDA,
      playerHand: handPDA,
      player: playerPubkey,
    })
    .rpc();

  console.log("✅ Player action on-chain:", tx);
  return tx;
}

/**
 * Advance the game phase (PreFlop -> Flop -> Turn -> River -> Showdown)
 */
export async function advancePhaseOnChain(
  program: Program,
  gameId: number,
  payerPubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [gamePDA] = getGamePDA(BigInt(gameId));

  const tx = await program.methods
    .advancePhase(gameIdBN)
    .accounts({
      game: gamePDA,
      payer: payerPubkey,
    })
    .rpc();

  console.log("✅ Phase advanced on-chain:", tx);
  return tx;
}

/**
 * Reveal winner and settle (commits state back to L1)
 */
export async function revealWinnerOnChain(
  program: Program,
  gameId: number,
  winnerIndex: number, // 0=player1, 1=player2, 2=tie
  payerPubkey: PublicKey,
  player1Pubkey: PublicKey,
  player2Pubkey: PublicKey
): Promise<string> {
  const [gamePDA] = getGamePDA(BigInt(gameId));
  const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
  const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);

  const tx = await program.methods
    .revealWinner(winnerIndex)
    .accounts({
      game: gamePDA,
      player1Hand: hand1PDA,
      player2Hand: hand2PDA,
      payer: payerPubkey,
    })
    .rpc();

  console.log("✅ Winner revealed on-chain:", tx);
  return tx;
}

// =================== BETTING POOL ===================

/**
 * Create a betting pool for spectators
 */
export async function createBettingPoolOnChain(
  program: Program,
  gameId: number,
  creatorPubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [poolPDA] = getBettingPoolPDA(BigInt(gameId));

  const tx = await program.methods
    .createBettingPool(gameIdBN)
    .accounts({
      bettingPool: poolPDA,
      creator: creatorPubkey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Betting pool created:", tx);
  return tx;
}

/**
 * Place a bet on a player
 */
export async function placeBetOnChain(
  program: Program,
  gameId: number,
  betOnPlayer: number, // 1 or 2
  amount: number, // lamports
  bettorPubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [poolPDA] = getBettingPoolPDA(BigInt(gameId));
  const [betPDA] = getBetPDA(BigInt(gameId), bettorPubkey);

  const tx = await program.methods
    .placeBet(gameIdBN, betOnPlayer, new BN(amount))
    .accounts({
      bettingPool: poolPDA,
      bet: betPDA,
      bettor: bettorPubkey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Bet placed:", tx);
  return tx;
}

/**
 * Settle the betting pool
 */
export async function settleBettingPoolOnChain(
  program: Program,
  gameId: number,
  winningPlayer: number,
  authorityPubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [poolPDA] = getBettingPoolPDA(BigInt(gameId));

  const tx = await program.methods
    .settleBettingPool(gameIdBN, winningPlayer)
    .accounts({
      bettingPool: poolPDA,
      authority: authorityPubkey,
    })
    .rpc();

  console.log("✅ Betting pool settled:", tx);
  return tx;
}

/**
 * Claim winnings from a bet
 */
export async function claimBetWinningsOnChain(
  program: Program,
  gameId: number,
  bettorPubkey: PublicKey
): Promise<string> {
  const gameIdBN = new BN(gameId);
  const [poolPDA] = getBettingPoolPDA(BigInt(gameId));
  const [betPDA] = getBetPDA(BigInt(gameId), bettorPubkey);

  const tx = await program.methods
    .claimBetWinnings(gameIdBN)
    .accounts({
      bettingPool: poolPDA,
      bet: betPDA,
      bettor: bettorPubkey,
    })
    .rpc();

  console.log("✅ Bet winnings claimed:", tx);
  return tx;
}

// =================== READ ACCOUNTS ===================

/**
 * Fetch game state from on-chain
 */
export async function fetchGameAccount(
  program: Program,
  gameId: number
): Promise<GameAccount | null> {
  try {
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const account = await (program.account as any).game.fetch(gamePDA);
    return account as unknown as GameAccount;
  } catch {
    return null;
  }
}

/**
 * Fetch player hand from on-chain
 */
export async function fetchPlayerHand(
  program: Program,
  gameId: number,
  player: PublicKey
): Promise<PlayerHandAccount | null> {
  try {
    const [handPDA] = getPlayerHandPDA(BigInt(gameId), player);
    const account = await (program.account as any).playerHand.fetch(handPDA);
    return account as unknown as PlayerHandAccount;
  } catch {
    return null;
  }
}

/**
 * Fetch betting pool state
 */
export async function fetchBettingPool(
  program: Program,
  gameId: number
): Promise<BettingPoolAccount | null> {
  try {
    const [poolPDA] = getBettingPoolPDA(BigInt(gameId));
    const account = await (program.account as any).bettingPool.fetch(poolPDA);
    return account as unknown as BettingPoolAccount;
  } catch {
    return null;
  }
}

// =================== HELPER FUNCTIONS ===================

/**
 * Get the game phase as a readable string
 */
export function getPhaseString(phase: GamePhase): string {
  if ("waitingForPlayer" in phase) return "Waiting";
  if ("preFlop" in phase) return "Pre-Flop";
  if ("flop" in phase) return "Flop";
  if ("turn" in phase) return "Turn";
  if ("river" in phase) return "River";
  if ("showdown" in phase) return "Showdown";
  if ("settled" in phase) return "Settled";
  return "Unknown";
}

/**
 * Get the winner from game result
 */
export function getWinnerString(result: GameResult): string {
  if ("winner" in result) return result.winner[0].toBase58();
  if ("tie" in result) return "Tie";
  return "None";
}

/**
 * Generate a random game ID
 */
export function generateGameId(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/**
 * Check if the program is deployed and reachable
 */
export async function checkProgramDeployed(): Promise<boolean> {
  try {
    const info = await DEVNET_CONNECTION.getAccountInfo(PROGRAM_ID);
    return info !== null && info.executable;
  } catch {
    return false;
  }
}

/**
 * TEE Connection info for MagicBlock
 */
export const MAGICBLOCK_CONFIG = {
  teeUrl: TEE_URL,
  teeWsUrl: TEE_WS_URL,
  erValidator: ER_VALIDATOR.toBase58(),
  delegationProgram: DELEGATION_PROGRAM_ID.toBase58(),
  programId: PROGRAM_ID.toBase58(),
  network: "devnet",
  features: [
    "Cards encrypted in Intel TDX TEE",
    "MagicBlock Ephemeral Rollup for real-time play",
    "Settlement on Solana L1",
    "On-chain betting pools",
    "Verifiable game outcomes",
  ],
};
