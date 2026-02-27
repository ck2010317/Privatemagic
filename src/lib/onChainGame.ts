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

import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
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

// MagicBlock Magic Program constants
const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");

/**
 * Custom createCommitAndUndelegateInstruction — fixes the SDK bug where
 * accounts are passed as isWritable: false. The Magic Program requires
 * them to be writable for undelegation.
 */
function createCommitAndUndelegateIx(
  payer: PublicKey,
  accountsToCommitAndUndelegate: PublicKey[]
): TransactionInstruction {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
    ...accountsToCommitAndUndelegate.map((account) => ({
      pubkey: account,
      isSigner: false,
      isWritable: true, // FIXED: SDK passes false, Magic Program needs true
    })),
  ];
  const data = Buffer.alloc(4);
  data.writeUInt32LE(2, 0); // discriminator for commit+undelegate
  return new TransactionInstruction({
    keys,
    programId: MAGIC_PROGRAM_ID,
    data,
  });
}

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
let erRevealSent = false; // Prevent duplicate reveal_winner calls to ER
let lastRevealTxSig: string | null = null; // Track last ER reveal TX for retry

export function getCurrentOnChainState(): OnChainGameState | null {
  return currentGameState;
}

export function resetErRevealFlag() {
  erRevealSent = false;
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

    // Build 3 delegation instructions and combine into one transaction
    const instructions = [];

    // 1. Delegate game PDA instruction
    const ix1 = await program.methods
      .delegatePda({ game: { gameId: gameIdBN } })
      .accounts({
        pda: gamePDA,
        payer: wallet.publicKey,
        validator: ER_VALIDATOR,
      })
      .instruction();
    instructions.push(ix1);

    // 2. Delegate player 1 hand PDA instruction
    const ix2 = await program.methods
      .delegatePda({ playerHand: { gameId: gameIdBN, player: player1Pubkey } })
      .accounts({
        pda: hand1PDA,
        payer: wallet.publicKey,
        validator: ER_VALIDATOR,
      })
      .instruction();
    instructions.push(ix2);

    // 3. Delegate player 2 hand PDA instruction
    const ix3 = await program.methods
      .delegatePda({ playerHand: { gameId: gameIdBN, player: player2Pubkey } })
      .accounts({
        pda: hand2PDA,
        payer: wallet.publicKey,
        validator: ER_VALIDATOR,
      })
      .instruction();
    instructions.push(ix3);

    // Combine into a single transaction and sign
    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const tx = new Transaction({
      recentBlockhash,
      feePayer: wallet.publicKey,
    });
    tx.add(...instructions);

    // Sign transaction
    const signedTx = await wallet.signTransaction(tx);
    const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
    });

    console.log("✅ Delegation transaction sent:", txSignature);

    // Wait for confirmation
    await connection.confirmTransaction(txSignature, "confirmed");
    console.log("✅ All 3 PDAs delegated to ER!");

    if (currentGameState) {
      currentGameState.isDelegated = true;
      currentGameState.txSignatures.push(txSignature);
    }

    return { success: true, signature: txSignature };
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
 * Settle the game after it ends.
 *
 * NEW APPROACH (fixes InvalidPhase bug):
 * - Game actions (check, allin, fold) only go through the WebSocket server,
 *   NOT as on-chain instructions to the ER program. So the ER game state
 *   stays in PreFlop and reveal_winner always fails with InvalidPhase.
 * - Instead, we SKIP reveal_winner entirely and:
 *   1. Force-commit+undelegate all 3 PDAs from ER back to L1 via Magic Program
 *   2. Call settle_game on L1 (works from ANY phase except Settled)
 */
export async function revealWinnerOnChain(
  wallet: WalletAdapter,
  gameId: number,
  winnerIndex: number, // 0=player1, 1=player2, 2=tie
  player1Pubkey: PublicKey,
  player2Pubkey: PublicKey
): Promise<TransactionResult> {
  const winnerPubkey = winnerIndex === 0 ? player1Pubkey : (winnerIndex === 1 ? player2Pubkey : wallet.publicKey);
  const loserPubkey = winnerIndex === 0 ? player2Pubkey : player1Pubkey;
  const [gamePDA] = getGamePDA(BigInt(gameId));
  const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
  const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);

  // === Step 1: Try direct L1 settlement (works if already undelegated) ===
  try {
    console.log("🏆 Attempting direct L1 settlement...");
    const directResult = await settleGameOnChain(wallet, gameId, winnerIndex, winnerPubkey, loserPubkey, 0);
    if (directResult.success) {
      console.log("✅ Direct L1 settlement succeeded!");
      erRevealSent = false;
      return directResult;
    }
  } catch (directErr: any) {
    console.log("Direct L1 failed (game likely delegated):", directErr.message?.slice(0, 100));
  }

  // === Step 2: Force-commit+undelegate PDAs from ER via Magic Program ===
  console.log("🔄 Force-committing + undelegating PDAs from ER via Magic Program...");
  try {
    const undelegateTxSig = await sendForceUndelegate(wallet, gamePDA, hand1PDA, hand2PDA);
    if (undelegateTxSig) {
      console.log("✅ Force-undelegate TX sent:", undelegateTxSig);
      erRevealSent = true;
      lastRevealTxSig = undelegateTxSig;
    }
  } catch (undelegateErr: any) {
    console.log("⚠️ Force-undelegate TX failed:", undelegateErr.message);
  }

  // === Step 3: Poll for PDA ownership to return to our program (up to ~45s) ===
  console.log("⏳ Waiting for PDAs to return to L1...");
  for (let attempt = 0; attempt < 9; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
      const gameAccount = await connection.getAccountInfo(gamePDA);
      if (gameAccount && gameAccount.owner.equals(new PublicKey(PROGRAM_ID))) {
        console.log(`✅ Game PDA back on L1 after ${(attempt + 1) * 5}s!`);
        erRevealSent = false;

        // Settle on L1
        const settleTx = await settleGameOnChain(wallet, gameId, winnerIndex, winnerPubkey, loserPubkey, 0);
        if (currentGameState) {
          if (settleTx.signature) currentGameState.txSignatures.push(settleTx.signature);
          currentGameState.phase = "settled";
          currentGameState.winner = winnerPubkey.toString();
        }
        return settleTx;
      }
      console.log(`⏳ PDA still delegated (poll ${attempt + 1}/9)...`);
    } catch (e) {
      console.log(`⏳ Poll error (${attempt + 1}/9), retrying...`);
    }

    // On attempt 4, try sending another force-undelegate as a nudge
    if (attempt === 4) {
      console.log("🔄 Sending another force-undelegate nudge...");
      try {
        await sendForceUndelegate(wallet, gamePDA, hand1PDA, hand2PDA);
      } catch (e) { /* ignore */ }
    }
  }

  // All attempts failed — return pending for manual retry
  console.log("⚠️ Undelegation still pending after ~45s. User can retry.");
  if (currentGameState) {
    currentGameState.phase = "settled";
    currentGameState.winner = winnerPubkey.toString();
  }

  return {
    success: true,
    signature: lastRevealTxSig || "",
    error: "UNDELEGATION_PENDING"
  };
}

/**
 * Send a force commit+undelegate instruction to the ER Magic Program.
 * Uses our custom instruction with writable accounts (fixes SDK bug).
 * Returns the TX signature if successful, null otherwise.
 */
async function sendForceUndelegate(
  wallet: WalletAdapter,
  gamePDA: PublicKey,
  hand1PDA: PublicKey,
  hand2PDA: PublicKey
): Promise<string | null> {
  console.log("🔄 Sending force commit+undelegate to ER Magic Program...");
  console.log("   Accounts:", [gamePDA, hand1PDA, hand2PDA].map(p => p.toBase58()));

  const ix = createCommitAndUndelegateIx(
    wallet.publicKey,
    [gamePDA, hand1PDA, hand2PDA]
  );

  const recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
  const tx = new Transaction({ recentBlockhash, feePayer: wallet.publicKey });
  tx.add(ix);

  const signedTx = await wallet.signTransaction(tx);
  const txSig = await erConnection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: true,
  });

  console.log("✅ Force commit+undelegate TX sent to ER:", txSig);

  // Wait for ER to process, then dump logs for debugging
  await new Promise(resolve => setTimeout(resolve, 5000));
  try {
    const txInfo = await erConnection.getTransaction(txSig, { maxSupportedTransactionVersion: 0 });
    if (txInfo?.meta) {
      console.log("📋 Force-undelegate TX logs:", JSON.stringify(txInfo.meta.logMessages, null, 2));
      if (txInfo.meta.err) {
        console.log("❌ Force-undelegate TX had error:", JSON.stringify(txInfo.meta.err));
        return null;
      }
    } else {
      console.log("⚠️ Could not fetch TX info yet (null meta)");
    }
  } catch (logErr: any) {
    console.log("⚠️ Could not fetch TX logs:", logErr.message);
  }

  return txSig;
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

/**
 * Settle game directly on L1 — sets winner + transfers pot in one call.
 * Winner gets the actual in-game pot, loser gets remaining SOL refunded.
 * actualPot = total lamports both players bet during the hand.
 * If actualPot is 0 or not provided, falls back to winner-take-all.
 */
export async function settleGameOnChain(
  wallet: WalletAdapter,
  gameId: number,
  winnerIndex: number, // 0=player1, 1=player2
  winnerPubkey: PublicKey,
  loserPubkey: PublicKey,
  actualPot: number = 0
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet);
    const [gamePDA] = getGamePDA(BigInt(gameId));

    console.log("🏆 Settling game on Solana L1...", {
      gameId,
      winnerIndex,
      winner: winnerPubkey.toString(),
      loser: loserPubkey.toString(),
      actualPot,
    });

    const tx = await program.methods
      .settleGame(winnerIndex, new BN(actualPot))
      .accounts({
        game: gamePDA,
        winner: winnerPubkey,
        loser: loserPubkey,
      })
      .rpc();

    console.log("✅ Game settled! SOL transferred to winner, remainder refunded to loser. TX:", tx);

    if (currentGameState) {
      currentGameState.txSignatures.push(tx);
      currentGameState.phase = "settled";
      currentGameState.winner = winnerPubkey.toString();
    }

    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to settle game:", err);
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

// =================== RETRY SETTLEMENT ===================

/**
 * Retry settlement — force-undelegate PDAs and settle on L1.
 * Call this when the initial settlement attempt timed out.
 */
export async function retrySettlement(
  wallet: WalletAdapter,
  gameId: number,
  winnerPubkey: PublicKey,
  player1Pubkey?: PublicKey,
  player2Pubkey?: PublicKey
): Promise<TransactionResult> {
  try {
    const [gamePDA] = getGamePDA(BigInt(gameId));

    // Quick check — maybe PDA already came back to L1
    const gameAccount = await connection.getAccountInfo(gamePDA);
    if (!gameAccount) {
      return { success: false, error: "Game account not found" };
    }

    // Determine winner/loser for settle_game
    const winnerIndex = player1Pubkey && winnerPubkey.equals(player1Pubkey) ? 0 : 1;
    const loserPubkey = winnerIndex === 0
      ? (player2Pubkey || winnerPubkey)
      : (player1Pubkey || winnerPubkey);

    if (gameAccount.owner.equals(new PublicKey(PROGRAM_ID))) {
      console.log("✅ PDA is back on L1! Settling now...");
      erRevealSent = false;
      return await settleGameOnChain(wallet, gameId, winnerIndex, winnerPubkey, loserPubkey, 0);
    }

    // PDA still delegated — send force-undelegate
    if (player1Pubkey && player2Pubkey) {
      const [hand1PDA] = getPlayerHandPDA(BigInt(gameId), player1Pubkey);
      const [hand2PDA] = getPlayerHandPDA(BigInt(gameId), player2Pubkey);

      console.log("🔄 Force-undelegating PDAs via Magic Program...");
      try {
        await sendForceUndelegate(wallet, gamePDA, hand1PDA, hand2PDA);
      } catch (sdkErr: any) {
        console.log("⚠️ Force-undelegate failed:", sdkErr.message);
      }
    }

    // Poll for PDA ownership (up to ~30s)
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const pollAccount = await connection.getAccountInfo(gamePDA);
      if (pollAccount && pollAccount.owner.equals(new PublicKey(PROGRAM_ID))) {
        console.log("✅ PDA back on L1! Settling...");
        erRevealSent = false;
        return await settleGameOnChain(wallet, gameId, winnerIndex, winnerPubkey, loserPubkey, 0);
      }
      console.log(`⏳ PDA still delegated (poll ${i + 1}/6)...`);
    }

    console.log("⏳ Undelegation still pending. Try again in a moment.");
    return { success: false, error: "Undelegation still pending. Try again in a moment." };
  } catch (err: any) {
    console.error("❌ Retry settlement failed:", err);
    return { success: false, error: err.message };
  }
}

// =================== FUND RECOVERY ===================

/**
 * Cancel a game that hasn't started yet — Player 1 gets full refund.
 * Can only be called when game is in WaitingForPlayer phase (no opponent joined).
 */
export async function cancelGameOnChain(
  wallet: WalletAdapter,
  gameId: number
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet);
    const [gamePDA] = getGamePDA(BigInt(gameId));

    console.log("🚫 Cancelling game and refunding buy-in...");

    const tx = await program.methods
      .cancelGame()
      .accounts({
        game: gamePDA,
        player1: wallet.publicKey,
      })
      .rpc();

    console.log("✅ Game cancelled, buy-in refunded! TX:", tx);
    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to cancel game:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Refund a bet from an unsettled betting pool (game was abandoned).
 * Only works if the betting pool has NOT been settled yet.
 */
export async function refundBetOnChain(
  wallet: WalletAdapter,
  gameId: number
): Promise<TransactionResult> {
  try {
    const program = getProgram(wallet);
    const gameIdBN = new BN(gameId);
    const [poolPDA] = getBettingPoolPDA(BigInt(gameId));
    const [betPDA] = getBetPDA(BigInt(gameId), wallet.publicKey);

    console.log("💸 Refunding bet from unsettled pool...");

    const tx = await program.methods
      .refundBet(gameIdBN)
      .accounts({
        bettingPool: poolPDA,
        bet: betPDA,
        bettor: wallet.publicKey,
      })
      .rpc();

    console.log("✅ Bet refunded! TX:", tx);
    return { success: true, signature: tx };
  } catch (err: any) {
    console.error("❌ Failed to refund bet:", err);
    return { success: false, error: err.message };
  }
}
