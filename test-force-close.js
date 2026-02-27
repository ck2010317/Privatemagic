/**
 * Test force_close: create game → join → delegate → SKIP gameplay → force_close → settle on L1
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
const BUY_IN_LAMPORTS = Math.floor(0.01 * LAMPORTS_PER_SOL);

function toLEBytes(value) {
  const bn = typeof value === "number" ? BigInt(value) : value;
  const bytes = new Uint8Array(8);
  let v = bn;
  for (let i = 0; i < 8; i++) { bytes[i] = Number(v & 0xffn); v >>= 8n; }
  return Buffer.from(bytes);
}
function getGamePDA(gameId) { return PublicKey.findProgramAddressSync([GAME_SEED, toLEBytes(BigInt(gameId))], PROGRAM_ID); }
function getPlayerHandPDA(gameId, player) { return PublicKey.findProgramAddressSync([PLAYER_HAND_SEED, toLEBytes(BigInt(gameId)), player.toBuffer()], PROGRAM_ID); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(e, m) { console.log(`${e} [${new Date().toISOString().slice(11,19)}] ${m}`); }

class NodeWallet {
  constructor(kp) { this.payer = kp; this.publicKey = kp.publicKey; }
  async signTransaction(tx) { tx.partialSign(this.payer); return tx; }
  async signAllTransactions(txs) { return txs.map(tx => { tx.partialSign(this.payer); return tx; }); }
}

async function main() {
  console.log("\n=== Test: force_close → settle_game (Browser Flow) ===\n");

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const erConnection = new Connection(TEE_URL, "confirmed");

  const kpData = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".config/solana/id.json"), "utf-8"));
  const p1 = Keypair.fromSecretKey(Uint8Array.from(kpData));
  const p2 = Keypair.generate();
  const w1 = new NodeWallet(p1), w2 = new NodeWallet(p2);

  log("👛", `P1: ${p1.publicKey.toBase58()}`);
  log("👛", `P2: ${p2.publicKey.toBase58()}`);

  // Fund P2
  const fundTx = new Transaction().add(SystemProgram.transfer({ fromPubkey: p1.publicKey, toPubkey: p2.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }));
  fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx.feePayer = p1.publicKey; fundTx.sign(p1);
  await connection.sendRawTransaction(fundTx.serialize()).then(s => connection.confirmTransaction(s, "confirmed"));
  log("✅", "P2 funded");

  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "src/lib/privatepoker_idl.json"), "utf-8"));
  const prov1 = new anchor.AnchorProvider(connection, w1, { commitment: "confirmed" });
  const prov2 = new anchor.AnchorProvider(connection, w2, { commitment: "confirmed" });
  const erProv1 = new anchor.AnchorProvider(erConnection, w1, { commitment: "confirmed" });
  const prog1 = new anchor.Program(idl, prov1);
  const prog2 = new anchor.Program(idl, prov2);
  const erProg1 = new anchor.Program(idl, erProv1);

  const gameId = Math.floor(Math.random() * 1e9);
  const gBN = new anchor.BN(gameId);
  const [gamePDA] = getGamePDA(gameId);
  const [h1] = getPlayerHandPDA(gameId, p1.publicKey);
  const [h2] = getPlayerHandPDA(gameId, p2.publicKey);
  log("🎲", `Game ID: ${gameId}, PDA: ${gamePDA.toBase58()}`);

  // Step 1: Create
  await prog1.methods.createGame(gBN, new anchor.BN(BUY_IN_LAMPORTS))
    .accounts({ game: gamePDA, playerHand: h1, player1: p1.publicKey, systemProgram: SystemProgram.programId }).rpc();
  log("✅", "Game created");

  // Step 2: Join
  await prog2.methods.joinGame(gBN)
    .accounts({ game: gamePDA, playerHand: h2, player: p2.publicKey, systemProgram: SystemProgram.programId }).rpc();
  log("✅", "P2 joined");

  // Step 3: Delegate
  const ixs = [];
  ixs.push(await prog1.methods.delegatePda({ game: { gameId: gBN } }).accounts({ pda: gamePDA, payer: p1.publicKey, validator: ER_VALIDATOR }).instruction());
  ixs.push(await prog1.methods.delegatePda({ playerHand: { gameId: gBN, player: p1.publicKey } }).accounts({ pda: h1, payer: p1.publicKey, validator: ER_VALIDATOR }).instruction());
  ixs.push(await prog1.methods.delegatePda({ playerHand: { gameId: gBN, player: p2.publicKey } }).accounts({ pda: h2, payer: p1.publicKey, validator: ER_VALIDATOR }).instruction());
  const { blockhash } = await connection.getLatestBlockhash();
  const delTx = new Transaction({ recentBlockhash: blockhash, feePayer: p1.publicKey });
  delTx.add(...ixs); delTx.sign(p1);
  const delSig = await connection.sendRawTransaction(delTx.serialize());
  await connection.confirmTransaction(delSig, "confirmed");
  log("✅", "Delegated to ER");

  await sleep(2000);
  const postDel = await connection.getAccountInfo(gamePDA);
  log("🔍", `PDA owner: ${postDel.owner.toBase58()} (delegated: ${postDel.owner.equals(DELEGATION_PROGRAM_ID)})`);

  // Step 4: SKIP gameplay (browser plays via WebSocket)
  log("🎮", "Skipping ER gameplay (browser uses WebSocket)");
  await sleep(3000);

  // Step 5: force_close on ER
  log("🔄", "Calling force_close on ER...");
  try {
    const fcIx = await erProg1.methods.forceClose()
      .accounts({ game: gamePDA, player1Hand: h1, player2Hand: h2, payer: p1.publicKey })
      .instruction();
    const fcBH = (await erConnection.getLatestBlockhash()).blockhash;
    const fcTx = new Transaction({ recentBlockhash: fcBH, feePayer: p1.publicKey });
    fcTx.add(fcIx); fcTx.sign(p1);
    const fcSig = await erConnection.sendRawTransaction(fcTx.serialize(), { skipPreflight: true });
    log("📤", `force_close TX: ${fcSig}`);

    await sleep(5000);
    try {
      const info = await erConnection.getTransaction(fcSig, { maxSupportedTransactionVersion: 0 });
      if (info?.meta) {
        console.log("📋 TX logs:", JSON.stringify(info.meta.logMessages, null, 2));
        if (info.meta.err) console.log("❌ TX error:", JSON.stringify(info.meta.err));
        else log("✅", "force_close succeeded on ER!");
      }
    } catch (e) { log("⚠️", `Could not fetch logs: ${e.message}`); }
  } catch (e) {
    log("❌", `force_close failed: ${e.message}`);
    return;
  }

  // Step 6: Poll for undelegation
  log("⏳", "Polling for PDA ownership return...");
  let undelegated = false;
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const info = await connection.getAccountInfo(gamePDA);
    if (info && info.owner.equals(PROGRAM_ID)) {
      log("✅", `PDA back on L1 after ${(i+1)*5}s!`);
      undelegated = true;
      break;
    }
    log("⏳", `Poll ${i+1}/12: owner=${info?.owner.toBase58()}`);
  }

  if (!undelegated) { log("❌", "Undelegation didn't complete in 60s"); return; }

  // Step 7: settle_game on L1
  const preBalance = await connection.getBalance(p1.publicKey);
  const tx = await prog1.methods.settleGame(0, new anchor.BN(0))
    .accounts({ game: gamePDA, winner: p1.publicKey, loser: p2.publicKey }).rpc();
  log("✅", `settle_game TX: ${tx.slice(0, 20)}...`);

  const postBalance = await connection.getBalance(p1.publicKey);
  log("💰", `P1: ${preBalance/LAMPORTS_PER_SOL} → ${postBalance/LAMPORTS_PER_SOL} SOL (+${(postBalance-preBalance)/LAMPORTS_PER_SOL})`);

  if (postBalance > preBalance) {
    log("🎉", "SUCCESS! Full flow: delegate → force_close → settle_game works!");
  }
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
