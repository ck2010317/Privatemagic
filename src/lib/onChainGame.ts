/**
 * On-Chain Game Manager
 *
 * Wires every game action to the Solana program.
 * Real SOL is staked, cards are processed in MagicBlock TEE,
 * and the winner receives the pot on-chain.
 *
 * Flow:
 *   1. Create game → create_game (SOL transferred to game PDA)
 *   2. Join game → join_game (SOL transferred to game PDA)
 *   3. Delegate → delegate_pda to MagicBlock TEE
 *   4. Deal cards → deal_cards (in TEE)
 *   5. Player actions → player_action (check/call/raise/fold/allin)
 *   6. Phase advances → advance_phase
 *   7. Reveal winner → reveal_winner (commits to L1, SOL settled)
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  DEVNET_RPC,
  getGamePDA,
  getPlayerHandPDA,
  getBettingPoolPDA,
  getBetPDA,
  lamportsToSol,
  solToLamports,
} from "./solana";
import IDL from "./privatepoker_idl.json";

// =================== TYPES ===================

export interface OnChainGameState {
  gameId: number;
  gamePDA: string;
  player1: string | null;
  player2: string | null;
  buyIn: number; // lamports
  pot: number; // lamports
  phase: string;
  communityCards: number[];
  currentBet: number;
  dealer: number;
  turn: number;
  winner: string | null; // "player1_pubkey" | "player2_pubkey" | "tie" | null
  txSignatures: string[]; // all tx signatures for verification
  isOnChain: boolean;
  isDelegated: boolean;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// =================== WALLET TYPE ===================

export interface WalletAdapter {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
}

// =================== CONNECTION ===================

const connection = new Connection(DEVNET_RPC, "confirmed");

function getProvider(wallet: WalletAdapter): AnchorProvider {
  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

function getProgram(wallet: WalletAdapter): Program {
  const provider = getProvider(wallet);
  return new Program(IDL as Idl, provider);
}

function getReadOnlyProgram(): Program {
  const provider = new AnchorProvider(connection, {} as any, {
    commitment: "confirmed",
  });
  return new Program(IDL as Idl, provider);
}

// =================== GAME STATE TRACKING ===================

let currentGameState: OnChainGameState | null = null;

export function getCurrentOnChainState(): OnChainGameState | null {
  return currentGameState;
}

// =================== CORE GAME FUNCTIONS ===================

/**
 * Create a new on-chain poker game.
 * Transfers real SOL from the player's wallet to the game PDA.
 */
export async function createOnChainGame(
  wallet: WalletAdapter,
  buyInSol: number
): Promise<{ gameId: number; gamePDA: string; txSignature: string } | null> {
  try {
    const program = getProgram(wallet);
    const gameId = Math.floor(Math.random() * 1_000_000_000);
    const buyInLamports = solToLamports(buyInSol);
    const gameIdBN = new BN(gameId);
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const [playerHandPDA] = getPlayerHandPDA(BigInt(gameId), wallet.publicKey);

    console.log("🎮 Creating on-chain game...");
    console.log("   Game ID:", gameId);
    console.log("   Buy-in:", buyInSol, "SOL (", buyInLamports, "lamports)");
    console.log("   Player:", wallet.publicKey.toBase58());
    console.log("   Game PDA:", gamePDA.toBase58());

    const tx = await program.methods
      .createGame(gameIdBN, new BN(buyInLamports))
      .accounts({
        game: gamePDA,
        playerHand: playerHandPDA,
        player1: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Game created on-chain! TX:", tx);

    currentGameState = {
      gameId,
      gamePDA: gamePDA.toBase58(),
      player1: wallet.publicKey.toBase58(),
      player2: null,
      buyIn: buyInLamports,
      pot: buyInLamports,
      phase: "waitingForPlayer",
      communityCards: [],
      currentBet: 0,
      dealer: 0,
      turn: 1,
      winner: null,
      txSignatures: [tx],
      isOnChain: true,
      isDelegated: false,
    };

    return { gameId, gamePDA: gamePDA.toBase58(), txSignature: tx };
  } catch (err: any) {
    console.error("❌ Failed to create on-chain game:", err);
    return null;
  }
}

/**
 * Join an existing on-chain game.
 * Transfers real SOL from player 2's wallet to the game PDA.
 */
export async function joinOnChainGame(
  wallet: WalletAdapter,
  gameId: number
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet);
    const gameIdBN = new BN(gameId);
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const [playerHandPDA] = getPlayerHandPDA(BigInt(gameId), wallet.publicKey);

    console.log("🎮 Joining on-chain game", gameId);

    const tx = await program.methods
      .joinGame(gameIdBN)
      .accounts({
        game: gamePDA,
        playerHand: playerHandPDA,
        player: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Joined game on-chain! TX:", tx);

    if (currentGameState) {
      currentGameState.player2 = wallet.publicKey.toBase58();
      currentGameState.phase = "preFlop";
      currentGameState.pot = currentGameState.buyIn * 2;
      currentGameState.txSignatures.push(tx);
    }

    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to join game:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Deal cards on-chain (should be called by the dealer/TEE)
 */
export async function dealCardsOnChain(
  wallet: WalletAdapter,
  gameId: number,
  player1Cards: [number, number],
  player2Cards: [number, number],
  communityCards: [number, number, number, number, number],
  player1Pubkey: PublicKey,
  player2Pubkey: PublicKey
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet);
    const gameIdBN = new BN(gameId);
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
    const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);

    console.log("🃏 Dealing cards on-chain...");

    const tx = await program.methods
      .dealCards(gameIdBN, player1Cards, player2Cards, communityCards)
      .accounts({
        game: gamePDA,
        player1Hand: hand1PDA,
        player2Hand: hand2PDA,
        dealer: wallet.publicKey,
      })
      .rpc();

    console.log("✅ Cards dealt on-chain! TX:", tx);

    if (currentGameState) {
      currentGameState.communityCards = Array.from(communityCards);
      currentGameState.txSignatures.push(tx);
    }

    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to deal cards:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Execute a player action on-chain (fold, check, call, raise, all-in)
 */
export async function playerActionOnChain(
  wallet: WalletAdapter,
  gameId: number,
  action: string,
  raiseAmount?: number
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet);
    const gameIdBN = new BN(gameId);
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const [handPDA] = getPlayerHandPDA(BigInt(gameId), wallet.publicKey);

    // Convert action string to on-chain Action enum
    let actionEnum: any;
    switch (action) {
      case "fold":
        actionEnum = { fold: {} };
        break;
      case "check":
        actionEnum = { check: {} };
        break;
      case "call":
        actionEnum = { call: {} };
        break;
      case "raise":
        actionEnum = { raise: { amount: new BN(raiseAmount || 0) } };
        break;
      case "allin":
        actionEnum = { allIn: {} };
        break;
      default:
        return { success: false, error: "Unknown action: " + action };
    }

    console.log(`🎯 Player action on-chain: ${action}`);

    const tx = await program.methods
      .playerAction(gameIdBN, actionEnum)
      .accounts({
        game: gamePDA,
        playerHand: handPDA,
        player: wallet.publicKey,
      })
      .rpc();

    console.log(`✅ Action "${action}" executed on-chain! TX:`, tx);

    if (currentGameState) {
      currentGameState.txSignatures.push(tx);
    }

    return { success: true, signature: tx };
  } catch (err: any) {
    console.error(`❌ Failed action "${action}":`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Advance the game phase on-chain
 */
export async function advancePhaseOnChain(
  wallet: WalletAdapter,
  gameId: number
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet);
    const gameIdBN = new BN(gameId);
    const [gamePDA] = getGamePDA(BigInt(gameId));

    console.log("⏭️ Advancing phase on-chain...");

    const tx = await program.methods
      .advancePhase(gameIdBN)
      .accounts({
        game: gamePDA,
        payer: wallet.publicKey,
      })
      .rpc();

    console.log("✅ Phase advanced on-chain! TX:", tx);

    if (currentGameState) {
      currentGameState.txSignatures.push(tx);
    }

    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to advance phase:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Reveal winner and settle the pot on-chain.
 * This commits the state back to Solana L1 and undelegates from ER.
 * The winner receives the pot SOL.
 */
export async function revealWinnerOnChain(
  wallet: WalletAdapter,
  gameId: number,
  winnerIndex: number, // 0=player1, 1=player2, 2=tie
  player1Pubkey: PublicKey,
  player2Pubkey: PublicKey
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet);
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
    const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);

    // Determine winner pubkey for payout
    const winnerPubkey = winnerIndex === 0 ? player1Pubkey : (winnerIndex === 1 ? player2Pubkey : wallet.publicKey);

    console.log("🏆 Revealing winner on-chain...", { winnerIndex, winnerPubkey: winnerPubkey.toString() });

    const tx = await program.methods
      .revealWinner(winnerIndex)
      .accounts({
        game: gamePDA,
        player1Hand: hand1PDA,
        player2Hand: hand2PDA,
        payer: wallet.publicKey,
        winner: winnerPubkey,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      })
      .rpc();

    console.log("✅ Winner revealed & pot settled on-chain! TX:", tx);

    if (currentGameState) {
      currentGameState.txSignatures.push(tx);
      currentGameState.phase = "settled";
    }

    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to reveal winner:", err);
    return { success: false, error: err.message };
  }
}

// =================== READ ON-CHAIN STATE ===================

/**
 * Fetch the current game state from the blockchain
 */
export async function fetchGameState(gameId: number): Promise<OnChainGameState | null> {
  try {
    const program = getReadOnlyProgram();
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const account = await (program.account as any).game.fetch(gamePDA);

    const phase = getPhaseFromAccount(account.phase);
    const winner = getWinnerFromAccount(account.winner);

    return {
      gameId: account.gameId.toNumber(),
      gamePDA: gamePDA.toBase58(),
      player1: account.player1?.toBase58() || null,
      player2: account.player2?.toBase58() || null,
      buyIn: account.buyIn.toNumber(),
      pot: account.pot.toNumber(),
      phase,
      communityCards: Array.from(account.communityCards as number[]).slice(0, account.communityCardCount),
      currentBet: account.currentBet.toNumber(),
      dealer: account.dealer,
      turn: account.turn,
      winner,
      txSignatures: [],
      isOnChain: true,
      isDelegated: false,
    };
  } catch (err) {
    console.error("Failed to fetch game state:", err);
    return null;
  }
}

/**
 * Fetch player hand from on-chain
 */
export async function fetchPlayerHand(
  gameId: number,
  player: PublicKey
): Promise<{ cards: number[]; hasFolded: boolean; currentBet: number; totalBet: number; isAllIn: boolean } | null> {
  try {
    const program = getReadOnlyProgram();
    const [handPDA] = getPlayerHandPDA(BigInt(gameId), player);
    const account = await (program.account as any).playerHand.fetch(handPDA);
    return {
      cards: Array.from(account.cards),
      hasFolded: account.hasFolded,
      currentBet: account.currentBet.toNumber(),
      totalBet: account.totalBet.toNumber(),
      isAllIn: account.isAllIn,
    };
  } catch {
    return null;
  }
}

/**
 * Get the SOL balance of a wallet
 */
export async function getWalletBalance(pubkey: PublicKey): Promise<number> {
  try {
    const balance = await connection.getBalance(pubkey);
    return balance;
  } catch {
    return 0;
  }
}

/**
 * Get the game PDA balance (total SOL staked)
 */
export async function getGamePDABalance(gameId: number): Promise<number> {
  try {
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const balance = await connection.getBalance(gamePDA);
    return balance;
  } catch {
    return 0;
  }
}

// =================== HELPERS ===================

function getPhaseFromAccount(phase: any): string {
  if (phase.waitingForPlayer !== undefined) return "waitingForPlayer";
  if (phase.preFlop !== undefined) return "preFlop";
  if (phase.flop !== undefined) return "flop";
  if (phase.turn !== undefined) return "turn";
  if (phase.river !== undefined) return "river";
  if (phase.showdown !== undefined) return "showdown";
  if (phase.settled !== undefined) return "settled";
  return "unknown";
}

function getWinnerFromAccount(winner: any): string | null {
  if (winner.winner) return winner.winner[0].toBase58();
  if (winner.tie !== undefined) return "tie";
  return null;
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

/**
 * Get explorer URL for the game PDA
 */
export function getGameExplorerUrl(gameId: number): string {
  const [gamePDA] = getGamePDA(BigInt(gameId));
  return `https://explorer.solana.com/address/${gamePDA.toBase58()}?cluster=devnet`;
}

/**
 * Verify a game exists on-chain
 */
export async function verifyGameOnChain(gameId: number): Promise<boolean> {
  const state = await fetchGameState(gameId);
  return state !== null;
}
