/**
 * On-Chain Game Manager with MagicBlock Ephemeral Rollups
 *
 * Uses MagicBlock's Delegation + Ephemeral Rollup architecture:
 * - Base layer (Solana devnet): Create, Join, Delegate, Settle
 * - Ephemeral Rollup (MagicBlock ER): Deal, Actions, Phases, Reveal Winner
 *
 * Flow:
 *   1. Create game → Solana L1 (SOL transferred to game PDA)
 *   2. Join game → Solana L1 (SOL transferred to game PDA)
 *   3. Delegate → Solana L1 (delegates game+hand PDAs to ER validator)
 *   4. Deal cards → MagicBlock ER (fast, gasless)
 *   5. Player actions → MagicBlock ER (fast, gasless)
 *   6. Phase advances → MagicBlock ER (fast, gasless)
 *   7. Reveal winner → MagicBlock ER (commits+undelegates back to L1)
 *   8. Settle pot → Solana L1 (transfers SOL to winner)
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  DEVNET_RPC,
  TEE_URL,
  ER_VALIDATOR,
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

// Base layer connection (Solana devnet) - for create, join, delegate, settle
const connection = new Connection(DEVNET_RPC, "confirmed");

// MagicBlock ER connection - for gameplay (deal, actions, phases, reveal)
const erConnection = new Connection(TEE_URL, "confirmed");

function getProvider(wallet: WalletAdapter): AnchorProvider {
  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

function getERProvider(wallet: WalletAdapter): AnchorProvider {
  return new AnchorProvider(erConnection, wallet as any, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

function getProgram(wallet: WalletAdapter): Program {
  const provider = getProvider(wallet);
  return new Program(IDL as Idl, provider);
}

function getERProgram(wallet: WalletAdapter): Program {
  const provider = getERProvider(wallet);
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
 * Delegate game and player hand PDAs to MagicBlock ER validator.
 * This runs on Solana base layer and transfers PDA ownership to the delegation program.
 * After delegation, gameplay transactions go to the ER RPC for fast, gasless execution.
 */
export async function delegateToMagicBlock(
  wallet: WalletAdapter,
  gameId: number,
  player1Pubkey: PublicKey,
  player2Pubkey: PublicKey
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet); // Base layer program
    const gameIdBN = new BN(gameId);
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
    const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);

    console.log("🔮 Delegating game PDA to MagicBlock ER...");

    // 1. Delegate game PDA
    const tx1 = await program.methods
      .delegatePda({ game: { gameId: gameIdBN } })
      .accounts({
        pda: gamePDA,
        payer: wallet.publicKey,
      })
      .remainingAccounts([
        { pubkey: ER_VALIDATOR, isWritable: false, isSigner: false },
      ])
      .rpc();

    console.log("✅ Game PDA delegated to ER:", tx1);

    // 2. Delegate player 1 hand PDA
    const tx2 = await program.methods
      .delegatePda({ playerHand: { gameId: gameIdBN, player: player1Pubkey } })
      .accounts({
        pda: hand1PDA,
        payer: wallet.publicKey,
      })
      .remainingAccounts([
        { pubkey: ER_VALIDATOR, isWritable: false, isSigner: false },
      ])
      .rpc();

    console.log("✅ Player 1 hand delegated to ER:", tx2);

    // 3. Delegate player 2 hand PDA
    const tx3 = await program.methods
      .delegatePda({ playerHand: { gameId: gameIdBN, player: player2Pubkey } })
      .accounts({
        pda: hand2PDA,
        payer: wallet.publicKey,
      })
      .remainingAccounts([
        { pubkey: ER_VALIDATOR, isWritable: false, isSigner: false },
      ])
      .rpc();

    console.log("✅ Player 2 hand delegated to ER:", tx3);

    if (currentGameState) {
      currentGameState.isDelegated = true;
      currentGameState.txSignatures.push(tx1, tx2, tx3);
    }

    return { success: true, signature: tx1 };
  } catch (err: any) {
    console.error("❌ Failed to delegate to MagicBlock:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Deal cards on MagicBlock ER (fast, gasless)
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
 * Reveal winner on MagicBlock ER.
 * This commits the game state back to Solana L1 and undelegates from ER.
 * After undelegation, call settlePotOnChain to transfer SOL to winner.
 */
export async function revealWinnerOnChain(
  wallet: WalletAdapter,
  gameId: number,
  winnerIndex: number, // 0=player1, 1=player2, 2=tie
  player1Pubkey: PublicKey,
  player2Pubkey: PublicKey
): Promise<TransactionResult> {
  try {
    // Use ER program for reveal_winner (runs on MagicBlock ER with commit+undelegate)
    const erProgram = getERProgram(wallet);
    const [gamePDA] = getGamePDA(BigInt(gameId));
    const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
    const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);

    const winnerPubkey = winnerIndex === 0 ? player1Pubkey : (winnerIndex === 1 ? player2Pubkey : wallet.publicKey);

    console.log("🏆 Revealing winner on MagicBlock ER (commit+undelegate to L1)...", {
      winnerIndex,
      winnerPubkey: winnerPubkey.toString(),
    });

    const tx = await erProgram.methods
      .revealWinner(winnerIndex)
      .accounts({
        game: gamePDA,
        player1Hand: hand1PDA,
        player2Hand: hand2PDA,
        payer: wallet.publicKey,
      })
      .rpc();

    console.log("✅ Winner revealed on ER & committed to L1! TX:", tx);

    // Now settle pot on base layer (after undelegation)
    console.log("⏳ Waiting for undelegation to complete...");
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for undelegation

    const settleTx = await settlePotOnChain(wallet, gameId, winnerPubkey);
    if (settleTx.success) {
      console.log("✅ Pot settled on L1! TX:", settleTx.signature);
    }

    if (currentGameState) {
      currentGameState.txSignatures.push(tx);
      if (settleTx.signature) currentGameState.txSignatures.push(settleTx.signature);
      currentGameState.phase = "settled";
    }

    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to reveal winner on ER:", err);
    // Fallback: try on base layer directly (if not delegated)
    try {
      console.log("🔄 Fallback: revealing winner on base layer...");
      const program = getProgram(wallet);
      const [gamePDA] = getGamePDA(BigInt(gameId));
      const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
      const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);
      const winnerPubkey = winnerIndex === 0 ? player1Pubkey : (winnerIndex === 1 ? player2Pubkey : wallet.publicKey);

      // On base layer, call settle_pot directly (no commit needed)
      const settleTx = await program.methods
        .settlePot()
        .accounts({
          game: gamePDA,
          winner: winnerPubkey,
          payer: wallet.publicKey,
        })
        .rpc();

      console.log("✅ Pot settled on base layer! TX:", settleTx);
      return { success: true, signature: settleTx };
    } catch (fallbackErr: any) {
      console.error("❌ Fallback also failed:", fallbackErr);
      return { success: false, error: err.message };
    }
  }
}

/**
 * Settle pot on Solana base layer (after undelegation from ER).
 * Transfers SOL from game PDA to the winner.
 */
export async function settlePotOnChain(
  wallet: WalletAdapter,
  gameId: number,
  winnerPubkey: PublicKey
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet); // Base layer
    const [gamePDA] = getGamePDA(BigInt(gameId));

    console.log("💰 Settling pot on Solana L1...", { winner: winnerPubkey.toString() });

    const tx = await program.methods
      .settlePot()
      .accounts({
        game: gamePDA,
        winner: winnerPubkey,
        payer: wallet.publicKey,
      })
      .rpc();

    console.log("✅ Pot settled! SOL transferred to winner. TX:", tx);

    if (currentGameState) {
      currentGameState.txSignatures.push(tx);
    }

    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to settle pot:", err);
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
