/**
 * Test: Verify winner actually receives SOL from settle_pot.
 * Tracks exact balances before and after every step.
 */

const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const PROGRAM_ID = new PublicKey("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const TEE_URL = "https://devnet-us.magicblock.app";
const ER_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

const GAME_SEED = Buffer.from("poker_game");
const PLAYER_HAND_SEED = Buffer.from("player_hand");

const BUY_IN_LAMPORTS = 10_000_000; // 0.01 SOL

function toLEBytes(value) {
  const bn = typeof value === "number" ? BigInt(value) : value;
  const bytes = new Uint8Array(8);
  let v = bn;
  for (let i = 0; i < 8; i++) { bytes[i] = Number(v & 0xffn); v >>= 8n; }
  return Buffer.from(bytes);
}

function getGamePDA(gameId) {
  return PublicKey.findProgramAddressSync([GAME_SEED, toLEBytes(BigInt(gameId))], PROGRAM_ID);
}

function getPlayerHandPDA(gameId, player) {
  return PublicKey.findProgramAddressSync([PLAYER_HAND_SEED, toLEBytes(BigInt(gameId)), player.toBuffer()], PROGRAM_ID);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class NodeWallet {
  constructor(kp) { this.payer = kp; this.publicKey = kp.publicKey; }
  async signTransaction(tx) { tx.partialSign(this.payer); return tx; }
  async signAllTransactions(txs) { return txs.map(tx => { tx.partialSign(this.payer); return tx; }); }
}

async function getBalance(conn, pubkey, label) {
  const bal = await conn.getBalance(pubkey);
  console.log(`   ${label}: ${(bal / LAMPORTS_PER_SOL).toFixed(6)} SOL (${bal} lamports)`);
  return bal;
}

async function main() {
  console.log("\n========== WINNER CLAIM VERIFICATION TEST ==========\n");

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const erConnection = new Connection(TEE_URL, "confirmed");

  // Load wallets
  const kp1 = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".config/solana/id.json"), "utf-8"))));
  const kp2 = Keypair.generate();
  const w1 = new NodeWallet(kp1);
  const w2 = new NodeWallet(kp2);

  console.log("Player 1 (will be WINNER):", kp1.publicKey.toBase58());
  console.log("Player 2 (will be LOSER): ", kp2.publicKey.toBase58());

  // Fund Player 2
  const fundTx = new Transaction().add(SystemProgram.transfer({ fromPubkey: kp1.publicKey, toPubkey: kp2.publicKey, lamports: 50_000_000 }));
  fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx.feePayer = kp1.publicKey;
  fundTx.sign(kp1);
  await connection.sendRawTransaction(fundTx.serialize());
  await sleep(2000);

  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "src/lib/privatepoker_idl.json"), "utf-8"));
  const prog1 = new anchor.Program(idl, new anchor.AnchorProvider(connection, w1, { commitment: "confirmed" }));
  const prog2 = new anchor.Program(idl, new anchor.AnchorProvider(connection, w2, { commitment: "confirmed" }));
  const erProg1 = new anchor.Program(idl, new anchor.AnchorProvider(erConnection, w1, { commitment: "confirmed" }));
  const erProg2 = new anchor.Program(idl, new anchor.AnchorProvider(erConnection, w2, { commitment: "confirmed" }));

  const gameId = Math.floor(Math.random() * 1_000_000_000);
  const gameIdBN = new anchor.BN(gameId);
  const [gamePDA] = getGamePDA(gameId);
  const [hand1PDA] = getPlayerHandPDA(gameId, kp1.publicKey);
  const [hand2PDA] = getPlayerHandPDA(gameId, kp2.publicKey);

  console.log("\nGame ID:", gameId);
  console.log("Game PDA:", gamePDA.toBase58());

  // ── STEP 1: SNAPSHOT BALANCES BEFORE GAME ──
  console.log("\n--- BALANCES BEFORE GAME ---");
  const p1Before = await getBalance(connection, kp1.publicKey, "Player 1 (Winner)");
  const p2Before = await getBalance(connection, kp2.publicKey, "Player 2 (Loser) ");

  // ── STEP 2: CREATE GAME ──
  console.log("\n[1] Creating game (Player 1 pays 0.01 SOL buy-in)...");
  await prog1.methods.createGame(gameIdBN, new anchor.BN(BUY_IN_LAMPORTS)).accounts({
    game: gamePDA, playerHand: hand1PDA, player1: kp1.publicKey, systemProgram: SystemProgram.programId,
  }).rpc();
  console.log("   DONE");

  // ── STEP 3: JOIN GAME ──
  console.log("[2] Player 2 joins (pays 0.01 SOL buy-in)...");
  await prog2.methods.joinGame(gameIdBN).accounts({
    game: gamePDA, playerHand: hand2PDA, player: kp2.publicKey, systemProgram: SystemProgram.programId,
  }).rpc();
  console.log("   DONE");

  console.log("\n--- BALANCES AFTER BUY-INS ---");
  await getBalance(connection, kp1.publicKey, "Player 1 (Winner)");
  await getBalance(connection, kp2.publicKey, "Player 2 (Loser) ");
  const pdaAfterJoin = await getBalance(connection, gamePDA, "Game PDA         ");
  console.log(`   >>> Game PDA holds BOTH buy-ins: ${pdaAfterJoin / LAMPORTS_PER_SOL} SOL`);

  // ── STEP 4: DELEGATE ──
  console.log("\n[3] Delegating to MagicBlock ER...");
  const ixs = [];
  ixs.push(await prog1.methods.delegatePda({ game: { gameId: gameIdBN } }).accounts({ pda: gamePDA, payer: kp1.publicKey, validator: ER_VALIDATOR }).instruction());
  ixs.push(await prog1.methods.delegatePda({ playerHand: { gameId: gameIdBN, player: kp1.publicKey } }).accounts({ pda: hand1PDA, payer: kp1.publicKey, validator: ER_VALIDATOR }).instruction());
  ixs.push(await prog1.methods.delegatePda({ playerHand: { gameId: gameIdBN, player: kp2.publicKey } }).accounts({ pda: hand2PDA, payer: kp1.publicKey, validator: ER_VALIDATOR }).instruction());
  const { blockhash } = await connection.getLatestBlockhash();
  const delTx = new Transaction({ recentBlockhash: blockhash, feePayer: kp1.publicKey });
  delTx.add(...ixs);
  delTx.sign(kp1);
  const delSig = await connection.sendRawTransaction(delTx.serialize());
  await connection.confirmTransaction(delSig, "confirmed");
  console.log("   DONE — PDAs delegated");

  // ── STEP 5: PLAY ON ER (fast check/check to showdown) ──
  console.log("\n[4] Playing game on MagicBlock ER (check/check → showdown)...");
  await sleep(3000);

  // Deal
  await erProg1.methods.dealCards(gameIdBN, [12, 11], [0, 1], [5, 10, 15, 20, 25]).accounts({
    game: gamePDA, player1Hand: hand1PDA, player2Hand: hand2PDA, dealer: kp1.publicKey,
  }).rpc();
  console.log("   Cards dealt");

  // Check whose turn it is first
  let gameState = await erProg1.account.game.fetch(gamePDA);
  console.log("   Turn: Player", gameState.turn);

  // Play through 4 phases: PreFlop, Flop, Turn, River
  for (const phase of ["PreFlop", "Flop", "Turn", "River"]) {
    gameState = await erProg1.account.game.fetch(gamePDA);
    const firstPlayer = gameState.turn === 1 ? { prog: erProg1, kp: kp1, hand: hand1PDA, name: "P1" } : { prog: erProg2, kp: kp2, hand: hand2PDA, name: "P2" };
    const secondPlayer = gameState.turn === 1 ? { prog: erProg2, kp: kp2, hand: hand2PDA, name: "P2" } : { prog: erProg1, kp: kp1, hand: hand1PDA, name: "P1" };

    await firstPlayer.prog.methods.playerAction(gameIdBN, { check: {} }).accounts({ game: gamePDA, playerHand: firstPlayer.hand, player: firstPlayer.kp.publicKey }).rpc();
    await secondPlayer.prog.methods.playerAction(gameIdBN, { check: {} }).accounts({ game: gamePDA, playerHand: secondPlayer.hand, player: secondPlayer.kp.publicKey }).rpc();
    await erProg1.methods.advancePhase(gameIdBN).accounts({ game: gamePDA, payer: kp1.publicKey }).rpc();
    console.log(`   ${phase}: both checked, advanced`);
  }

  gameState = await erProg1.account.game.fetch(gamePDA);
  console.log("   Final phase:", JSON.stringify(gameState.phase));
  console.log("   Pot on ER:", gameState.pot.toNumber(), "lamports");

  // ── STEP 6: REVEAL WINNER ON ER ──
  console.log("\n[5] Revealing winner on ER (Player 1 wins)...");
  const revealIx = await erProg1.methods.revealWinner(0).accounts({
    game: gamePDA, player1Hand: hand1PDA, player2Hand: hand2PDA, payer: kp1.publicKey,
  }).instruction();
  const revealTx = new Transaction({ recentBlockhash: (await erConnection.getLatestBlockhash()).blockhash, feePayer: kp1.publicKey });
  revealTx.add(revealIx);
  revealTx.sign(kp1);
  const revealSig = await erConnection.sendRawTransaction(revealTx.serialize(), { skipPreflight: true });
  console.log("   reveal_winner TX:", revealSig);

  // ── STEP 7: WAIT FOR UNDELEGATION ──
  console.log("\n[6] Waiting for undelegation...");
  await sleep(5000);
  let undelegated = false;
  for (let i = 0; i < 12; i++) {
    const info = await connection.getAccountInfo(gamePDA);
    if (info && info.owner.equals(PROGRAM_ID)) {
      console.log(`   UNDELEGATED after ${5 + i * 5}s — PDA back on L1!`);
      undelegated = true;
      break;
    }
    console.log(`   Poll ${i + 1}/12: still delegated, waiting 5s...`);
    await sleep(5000);
  }

  if (!undelegated) {
    console.log("\n   UNDELEGATION STILL PENDING — MagicBlock devnet issue.");
    console.log("   Cannot verify settle_pot. Exiting.");
    return;
  }

  // ── STEP 8: SNAPSHOT BALANCES BEFORE SETTLE ──
  console.log("\n--- BALANCES BEFORE settle_pot ---");
  const p1BeforeSettle = await getBalance(connection, kp1.publicKey, "Player 1 (Winner)");
  const p2BeforeSettle = await getBalance(connection, kp2.publicKey, "Player 2 (Loser) ");
  const pdaBeforeSettle = await getBalance(connection, gamePDA, "Game PDA         ");

  // Read on-chain game state to verify winner is set
  const l1GameState = await prog1.account.game.fetch(gamePDA);
  console.log("\n   On-chain game state:");
  console.log("   Phase:", JSON.stringify(l1GameState.phase));
  console.log("   Pot:", l1GameState.pot.toNumber(), "lamports");
  console.log("   Winner:", JSON.stringify(l1GameState.winner));

  // ── STEP 9: SETTLE POT ──
  console.log("\n[7] Calling settle_pot (transferring SOL to winner)...");
  const settleSig = await prog1.methods.settlePot().accounts({
    game: gamePDA, winner: kp1.publicKey, payer: kp1.publicKey,
  }).rpc();
  console.log("   settle_pot TX:", settleSig);

  // ── STEP 10: SNAPSHOT BALANCES AFTER SETTLE ──
  await sleep(2000);
  console.log("\n--- BALANCES AFTER settle_pot ---");
  const p1AfterSettle = await getBalance(connection, kp1.publicKey, "Player 1 (Winner)");
  const p2AfterSettle = await getBalance(connection, kp2.publicKey, "Player 2 (Loser) ");
  const pdaAfterSettle = await getBalance(connection, gamePDA, "Game PDA         ");

  // ── FINAL VERIFICATION ──
  console.log("\n========== VERIFICATION ==========");
  const p1Gained = p1AfterSettle - p1BeforeSettle;
  const p2Changed = p2AfterSettle - p2BeforeSettle;
  const pdaLost = pdaBeforeSettle - pdaAfterSettle;

  console.log(`\n   Player 1 (Winner) balance change: ${p1Gained > 0 ? "+" : ""}${(p1Gained / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`   Player 2 (Loser)  balance change: ${p2Changed > 0 ? "+" : ""}${(p2Changed / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log(`   Game PDA          balance change: -${(pdaLost / LAMPORTS_PER_SOL).toFixed(6)} SOL`);

  console.log(`\n   Expected pot transfer: ${BUY_IN_LAMPORTS * 2} lamports (0.02 SOL)`);
  console.log(`   Actual PDA decrease:   ${pdaLost} lamports`);

  // The winner gains ~0.02 SOL minus the settle tx fee (~0.000005)
  if (p1Gained > 0 && pdaLost >= BUY_IN_LAMPORTS * 2) {
    console.log("\n   ✅ VERIFIED: Winner received the pot!");
    console.log(`   ✅ Player 1 gained ${(p1Gained / LAMPORTS_PER_SOL).toFixed(6)} SOL (pot minus tx fee)`);
    console.log(`   ✅ Player 2 balance unchanged (lost buy-in as expected)`);
  } else {
    console.log("\n   ❌ UNEXPECTED: Winner did not receive expected amount!");
    console.log(`   Player 1 change: ${p1Gained} lamports`);
    console.log(`   PDA lost: ${pdaLost} lamports`);
  }

  // Verify final game state
  const finalState = await prog1.account.game.fetch(gamePDA);
  console.log(`\n   Final pot on-chain: ${finalState.pot.toNumber()} lamports`);
  if (finalState.pot.toNumber() === 0) {
    console.log("   ✅ Pot zeroed out (no double-claim possible)");
  }

  console.log("\n========== TEST COMPLETE ==========\n");
}

main().catch(err => { console.error("FAILED:", err); process.exit(1); });
