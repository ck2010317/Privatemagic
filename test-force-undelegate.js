/**
 * Test the NEW settlement flow (matches browser behavior):
 *   1. Create game on L1
 *   2. Join game on L1
 *   3. Delegate PDAs to MagicBlock ER
 *   4. (SKIP game actions — browser plays via WebSocket, not on-chain)
 *   5. Force commit+undelegate via Magic Program (our custom writable-accounts fix)
 *   6. Poll for PDA ownership return
 *   7. settle_game on L1 (works from any phase)
 *
 * Usage: node test-force-undelegate.js
 */

const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

// =================== CONSTANTS ===================

const PROGRAM_ID = new PublicKey("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const TEE_URL = "https://devnet-us.magicblock.app";
const ER_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");

const GAME_SEED = Buffer.from("poker_game");
const PLAYER_HAND_SEED = Buffer.from("player_hand");

const BUY_IN_SOL = 0.01;
const BUY_IN_LAMPORTS = Math.floor(BUY_IN_SOL * LAMPORTS_PER_SOL);

// =================== HELPERS ===================

function toLEBytes(value) {
  const bn = typeof value === "number" ? BigInt(value) : value;
  const bytes = new Uint8Array(8);
  let v = bn;
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return Buffer.from(bytes);
}

function getGamePDA(gameId) {
  return PublicKey.findProgramAddressSync(
    [GAME_SEED, toLEBytes(BigInt(gameId))],
    PROGRAM_ID
  );
}

function getPlayerHandPDA(gameId, player) {
  return PublicKey.findProgramAddressSync(
    [PLAYER_HAND_SEED, toLEBytes(BigInt(gameId)), player.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Our custom commit+undelegate instruction with WRITABLE accounts.
 * Fixes the SDK bug (isWritable: false → true).
 */
function createCommitAndUndelegateIx(payer, accounts) {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
    ...accounts.map((account) => ({
      pubkey: account,
      isSigner: false,
      isWritable: true, // FIXED: SDK passes false, Magic Program needs true
    })),
  ];
  const data = Buffer.alloc(4);
  data.writeUInt32LE(2, 0);
  return new TransactionInstruction({ keys, programId: MAGIC_PROGRAM_ID, data });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function log(emoji, msg) { console.log(`${emoji} [${new Date().toISOString().slice(11, 19)}] ${msg}`); }

class NodeWallet {
  constructor(keypair) {
    this.payer = keypair;
    this.publicKey = keypair.publicKey;
  }
  async signTransaction(tx) { tx.partialSign(this.payer); return tx; }
  async signAllTransactions(txs) { return txs.map((tx) => { tx.partialSign(this.payer); return tx; }); }
}

// =================== MAIN TEST ===================

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Test: Force-Undelegate + Settle (Browser Flow)           ║");
  console.log("║  Skips reveal_winner — uses Magic Program directly        ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const erConnection = new Connection(TEE_URL, "confirmed");

  // Load keypairs
  const keypairPath = path.join(process.env.HOME, ".config/solana/id.json");
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const player1Keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const player1Wallet = new NodeWallet(player1Keypair);
  const player2Keypair = Keypair.generate();
  const player2Wallet = new NodeWallet(player2Keypair);

  log("👛", `Player 1: ${player1Keypair.publicKey.toBase58()}`);
  log("👛", `Player 2: ${player2Keypair.publicKey.toBase58()}`);

  // Check balance
  const p1Balance = await connection.getBalance(player1Keypair.publicKey);
  log("💰", `Player 1 balance: ${p1Balance / LAMPORTS_PER_SOL} SOL`);
  if (p1Balance < 0.1 * LAMPORTS_PER_SOL) {
    log("❌", "Need more SOL. Requesting airdrop...");
    const sig = await connection.requestAirdrop(player1Keypair.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    log("✅", "Airdrop complete");
  }

  // Fund Player 2
  log("💸", "Funding Player 2...");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: player1Keypair.publicKey,
      toPubkey: player2Keypair.publicKey,
      lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
    })
  );
  fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx.feePayer = player1Keypair.publicKey;
  fundTx.sign(player1Keypair);
  const fundSig = await connection.sendRawTransaction(fundTx.serialize());
  await connection.confirmTransaction(fundSig, "confirmed");
  log("✅", "Player 2 funded");

  // Load IDL + create programs
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "src/lib/privatepoker_idl.json"), "utf-8"));
  const provider1 = new anchor.AnchorProvider(connection, player1Wallet, { commitment: "confirmed" });
  const provider2 = new anchor.AnchorProvider(connection, player2Wallet, { commitment: "confirmed" });
  const program1 = new anchor.Program(idl, provider1);
  const program2 = new anchor.Program(idl, provider2);

  // Generate game
  const gameId = Math.floor(Math.random() * 1_000_000_000);
  const gameIdBN = new anchor.BN(gameId);
  const [gamePDA] = getGamePDA(gameId);
  const [hand1PDA] = getPlayerHandPDA(gameId, player1Keypair.publicKey);
  const [hand2PDA] = getPlayerHandPDA(gameId, player2Keypair.publicKey);

  log("🎲", `Game ID: ${gameId}`);
  log("📍", `Game PDA: ${gamePDA.toBase58()}`);

  // ══════════════════════════════════════════
  // STEP 1: CREATE GAME
  // ══════════════════════════════════════════
  console.log("\n━━━ STEP 1: Create Game on L1 ━━━");
  const createTx = await program1.methods
    .createGame(gameIdBN, new anchor.BN(BUY_IN_LAMPORTS))
    .accounts({ game: gamePDA, playerHand: hand1PDA, player1: player1Keypair.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  log("✅", `Game created: ${createTx.slice(0, 16)}...`);

  // ══════════════════════════════════════════
  // STEP 2: JOIN GAME
  // ══════════════════════════════════════════
  console.log("\n━━━ STEP 2: Join Game on L1 ━━━");
  const joinTx = await program2.methods
    .joinGame(gameIdBN)
    .accounts({ game: gamePDA, playerHand: hand2PDA, player: player2Keypair.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  log("✅", `Joined: ${joinTx.slice(0, 16)}...`);

  // Verify state
  const preState = await program1.account.game.fetch(gamePDA);
  log("📊", `Phase: ${JSON.stringify(preState.phase)}, Pot: ${preState.pot.toNumber()} lamports`);

  // ══════════════════════════════════════════
  // STEP 3: DELEGATE TO ER
  // ══════════════════════════════════════════
  console.log("\n━━━ STEP 3: Delegate PDAs to MagicBlock ER ━━━");
  const instructions = [];
  instructions.push(await program1.methods.delegatePda({ game: { gameId: gameIdBN } }).accounts({ pda: gamePDA, payer: player1Keypair.publicKey, validator: ER_VALIDATOR }).instruction());
  instructions.push(await program1.methods.delegatePda({ playerHand: { gameId: gameIdBN, player: player1Keypair.publicKey } }).accounts({ pda: hand1PDA, payer: player1Keypair.publicKey, validator: ER_VALIDATOR }).instruction());
  instructions.push(await program1.methods.delegatePda({ playerHand: { gameId: gameIdBN, player: player2Keypair.publicKey } }).accounts({ pda: hand2PDA, payer: player1Keypair.publicKey, validator: ER_VALIDATOR }).instruction());

  const { blockhash } = await connection.getLatestBlockhash();
  const delTx = new Transaction({ recentBlockhash: blockhash, feePayer: player1Keypair.publicKey });
  delTx.add(...instructions);
  delTx.sign(player1Keypair);
  const delSig = await connection.sendRawTransaction(delTx.serialize());
  await connection.confirmTransaction(delSig, "confirmed");
  log("✅", `Delegated! TX: ${delSig.slice(0, 16)}...`);

  // Verify delegation
  await sleep(2000);
  const postDelInfo = await connection.getAccountInfo(gamePDA);
  const isDelegated = postDelInfo.owner.equals(DELEGATION_PROGRAM_ID);
  log("🔍", `PDA owner: ${postDelInfo.owner.toBase58()} (delegated: ${isDelegated})`);
  if (!isDelegated) { log("❌", "Delegation failed!"); return; }

  // ══════════════════════════════════════════
  // STEP 4: SKIP ER GAMEPLAY (simulating browser WebSocket play)
  // ══════════════════════════════════════════
  console.log("\n━━━ STEP 4: SKIP ER gameplay (browser plays via WebSocket) ━━━");
  log("🎮", "In the browser, the game happens through WebSocket, NOT on-chain ER instructions.");
  log("🎮", "ER game state stays in PreFlop. This is expected.");

  // ══════════════════════════════════════════
  // STEP 5: FORCE COMMIT+UNDELEGATE via Magic Program
  // ══════════════════════════════════════════
  console.log("\n━━━ STEP 5: Force Commit+Undelegate via Magic Program ━━━");
  await sleep(3000); // Give ER time to pick up delegation

  const forceIx = createCommitAndUndelegateIx(
    player1Keypair.publicKey,
    [gamePDA, hand1PDA, hand2PDA]
  );

  const forceBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
  const forceTx = new Transaction({ recentBlockhash: forceBlockhash, feePayer: player1Keypair.publicKey });
  forceTx.add(forceIx);
  forceTx.sign(player1Keypair);

  const forceSig = await erConnection.sendRawTransaction(forceTx.serialize(), { skipPreflight: true });
  log("📤", `Force-undelegate TX sent to ER: ${forceSig}`);

  // Wait and dump logs
  await sleep(5000);
  try {
    const txInfo = await erConnection.getTransaction(forceSig, { maxSupportedTransactionVersion: 0 });
    if (txInfo?.meta) {
      log("📋", `TX logs: ${JSON.stringify(txInfo.meta.logMessages, null, 2)}`);
      if (txInfo.meta.err) {
        log("❌", `TX error: ${JSON.stringify(txInfo.meta.err)}`);
      } else {
        log("✅", "Force-undelegate TX succeeded on ER!");
      }
    } else {
      log("⚠️", "Could not fetch TX info (null meta)");
    }
  } catch (e) {
    log("⚠️", `Could not fetch TX logs: ${e.message}`);
  }

  // ══════════════════════════════════════════
  // STEP 6: POLL FOR UNDELEGATION
  // ══════════════════════════════════════════
  console.log("\n━━━ STEP 6: Poll for Undelegation ━━━");

  let undelegated = false;
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const info = await connection.getAccountInfo(gamePDA);
    if (info && info.owner.equals(PROGRAM_ID)) {
      log("✅", `PDA back on L1 after ${(i + 1) * 5}s!`);
      undelegated = true;
      break;
    }
    log("⏳", `Poll ${i + 1}/12: still delegated (owner: ${info?.owner.toBase58()})`);

    // Nudge at attempt 5
    if (i === 5) {
      log("🔄", "Sending another force-undelegate nudge...");
      try {
        const nudgeBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
        const nudgeTx = new Transaction({ recentBlockhash: nudgeBlockhash, feePayer: player1Keypair.publicKey });
        nudgeTx.add(createCommitAndUndelegateIx(player1Keypair.publicKey, [gamePDA, hand1PDA, hand2PDA]));
        nudgeTx.sign(player1Keypair);
        await erConnection.sendRawTransaction(nudgeTx.serialize(), { skipPreflight: true });
        log("📤", "Nudge sent");
      } catch (e) { log("⚠️", `Nudge failed: ${e.message}`); }
    }
  }

  if (!undelegated) {
    log("❌", "UNDELEGATION DID NOT COMPLETE in 60s.");
    log("💡", "This means the Magic Program force-undelegate may not work for accounts");
    log("💡", "that haven't been modified on the ER. Checking ER game account...");

    // Check if the ER even has the account
    try {
      const erInfo = await erConnection.getAccountInfo(gamePDA);
      if (erInfo) {
        log("📊", `ER account owner: ${erInfo.owner.toBase58()}, data len: ${erInfo.data.length}`);
      } else {
        log("⚠️", "ER does not have this account!");
      }
    } catch (e) {
      log("⚠️", `ER lookup failed: ${e.message}`);
    }
    return;
  }

  // ══════════════════════════════════════════
  // STEP 7: SETTLE GAME ON L1
  // ══════════════════════════════════════════
  console.log("\n━━━ STEP 7: Settle Game on L1 ━━━");

  const preP1 = await connection.getBalance(player1Keypair.publicKey);
  try {
    const settleTx = await program1.methods
      .settleGame(0, new anchor.BN(0)) // Player 1 wins, full pot
      .accounts({
        game: gamePDA,
        winner: player1Keypair.publicKey,
        loser: player2Keypair.publicKey,
      })
      .rpc();
    log("✅", `Game settled on L1! TX: ${settleTx.slice(0, 16)}...`);
  } catch (e) {
    log("❌", `Settle failed: ${e.message}`);
    return;
  }

  // ══════════════════════════════════════════
  // FINAL REPORT
  // ══════════════════════════════════════════
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  RESULTS                                                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const postP1 = await connection.getBalance(player1Keypair.publicKey);
  const postP2 = await connection.getBalance(player2Keypair.publicKey);
  const postGame = await connection.getBalance(gamePDA);

  log("💰", `Player 1: ${preP1 / LAMPORTS_PER_SOL} → ${postP1 / LAMPORTS_PER_SOL} SOL (${postP1 > preP1 ? "+" : ""}${(postP1 - preP1) / LAMPORTS_PER_SOL} SOL)`);
  log("💰", `Player 2: ${postP2 / LAMPORTS_PER_SOL} SOL`);
  log("💰", `Game PDA: ${postGame / LAMPORTS_PER_SOL} SOL`);

  try {
    const finalState = await program1.account.game.fetch(gamePDA);
    log("📊", `Final phase: ${JSON.stringify(finalState.phase)}`);
    log("📊", `Final pot: ${finalState.pot.toNumber()}`);
    log("📊", `Winner: ${JSON.stringify(finalState.winner)}`);
  } catch (e) {
    log("⚠️", `Could not read final state: ${e.message.slice(0, 80)}`);
  }

  if (postP1 > preP1) {
    log("🎉", "SUCCESS! Player 1 received pot winnings via force-undelegate + settle_game flow!");
  } else {
    log("⚠️", "Player 1 didn't gain SOL (may have lost to TX fees)");
  }

  log("🔗", `Game PDA: https://explorer.solana.com/address/${gamePDA.toBase58()}?cluster=devnet`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
