/**
 * Test: advance_phase×4 → reveal_winner → settle_game
 * Uses EXISTING program on ER (no force_close needed)
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

function toLEBytes(v) { const bn=typeof v==="number"?BigInt(v):v; const b=new Uint8Array(8); let x=bn; for(let i=0;i<8;i++){b[i]=Number(x&0xffn);x>>=8n;} return Buffer.from(b); }
function getGamePDA(id) { return PublicKey.findProgramAddressSync([GAME_SEED, toLEBytes(BigInt(id))], PROGRAM_ID); }
function getPlayerHandPDA(id, p) { return PublicKey.findProgramAddressSync([PLAYER_HAND_SEED, toLEBytes(BigInt(id)), p.toBuffer()], PROGRAM_ID); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(e, m) { console.log(`${e} [${new Date().toISOString().slice(11,19)}] ${m}`); }

class W { constructor(k){this.payer=k;this.publicKey=k.publicKey;} async signTransaction(t){t.partialSign(this.payer);return t;} async signAllTransactions(t){return t.map(x=>{x.partialSign(this.payer);return x;});} }

async function main() {
  console.log("\n=== Test: advance_phase×4 → reveal_winner → settle_game ===\n");

  const conn = new Connection(DEVNET_RPC, "confirmed");
  const erConn = new Connection(TEE_URL, "confirmed");

  const kp = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".config/solana/id.json"), "utf-8"));
  const p1 = Keypair.fromSecretKey(Uint8Array.from(kp));
  const p2 = Keypair.generate();

  log("👛", `P1: ${p1.publicKey.toBase58()}`);
  log("👛", `P2: ${p2.publicKey.toBase58()}`);

  // Fund P2
  const ft = new Transaction().add(SystemProgram.transfer({fromPubkey:p1.publicKey,toPubkey:p2.publicKey,lamports:0.05*LAMPORTS_PER_SOL}));
  ft.recentBlockhash=(await conn.getLatestBlockhash()).blockhash; ft.feePayer=p1.publicKey; ft.sign(p1);
  await conn.sendRawTransaction(ft.serialize()).then(s=>conn.confirmTransaction(s,"confirmed"));

  // Use the OLD IDL (without force_close) since that's what the ER has
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "target/idl/privatepoker.json"), "utf-8"));
  const prov1 = new anchor.AnchorProvider(conn, new W(p1), {commitment:"confirmed"});
  const prov2 = new anchor.AnchorProvider(conn, new W(p2), {commitment:"confirmed"});
  const erProv1 = new anchor.AnchorProvider(erConn, new W(p1), {commitment:"confirmed"});
  const prog1 = new anchor.Program(idl, prov1);
  const prog2 = new anchor.Program(idl, prov2);
  const erProg1 = new anchor.Program(idl, erProv1);

  const gameId = Math.floor(Math.random()*1e9);
  const gBN = new anchor.BN(gameId);
  const [gPDA] = getGamePDA(gameId);
  const [h1] = getPlayerHandPDA(gameId, p1.publicKey);
  const [h2] = getPlayerHandPDA(gameId, p2.publicKey);
  log("🎲", `Game: ${gameId}, PDA: ${gPDA.toBase58()}`);

  // Create + Join + Delegate
  await prog1.methods.createGame(gBN, new anchor.BN(BUY_IN_LAMPORTS)).accounts({game:gPDA,playerHand:h1,player1:p1.publicKey,systemProgram:SystemProgram.programId}).rpc();
  log("✅", "Created");
  await prog2.methods.joinGame(gBN).accounts({game:gPDA,playerHand:h2,player:p2.publicKey,systemProgram:SystemProgram.programId}).rpc();
  log("✅", "Joined");

  const ixs = [];
  ixs.push(await prog1.methods.delegatePda({game:{gameId:gBN}}).accounts({pda:gPDA,payer:p1.publicKey,validator:ER_VALIDATOR}).instruction());
  ixs.push(await prog1.methods.delegatePda({playerHand:{gameId:gBN,player:p1.publicKey}}).accounts({pda:h1,payer:p1.publicKey,validator:ER_VALIDATOR}).instruction());
  ixs.push(await prog1.methods.delegatePda({playerHand:{gameId:gBN,player:p2.publicKey}}).accounts({pda:h2,payer:p1.publicKey,validator:ER_VALIDATOR}).instruction());
  const {blockhash} = await conn.getLatestBlockhash();
  const dt = new Transaction({recentBlockhash:blockhash,feePayer:p1.publicKey}); dt.add(...ixs); dt.sign(p1);
  const ds = await conn.sendRawTransaction(dt.serialize()); await conn.confirmTransaction(ds,"confirmed");
  log("✅", "Delegated");

  await sleep(3000);
  log("🔍", `PDA delegated: ${(await conn.getAccountInfo(gPDA)).owner.equals(DELEGATION_PROGRAM_ID)}`);

  // SKIP gameplay — advance_phase × 4 to reach Showdown
  log("⏭️", "Advancing phases on ER: PreFlop → Flop → Turn → River → Showdown");
  const phases = ["Flop", "Turn", "River", "Showdown"];
  for (const phase of phases) {
    try {
      const tx = await erProg1.methods.advancePhase(gBN).accounts({game:gPDA,payer:p1.publicKey}).rpc();
      log("✅", `Advanced to ${phase}: ${tx.slice(0,16)}...`);
    } catch (e) {
      log("❌", `advance_phase to ${phase} failed: ${e.message.slice(0,100)}`);
      // Dump ER game state
      try {
        const gs = await erProg1.account.game.fetch(gPDA);
        log("📊", `ER state: phase=${JSON.stringify(gs.phase)}, turn=${gs.turn}`);
      } catch(e2) { log("⚠️", `Can't read ER state: ${e2.message.slice(0,80)}`); }
      return;
    }
    await sleep(500);
  }

  // Verify Showdown
  try {
    const gs = await erProg1.account.game.fetch(gPDA);
    log("📊", `ER phase: ${JSON.stringify(gs.phase)} (should be Showdown)`);
  } catch(e) { log("⚠️", `Can't read ER state: ${e.message.slice(0,80)}`); }

  // reveal_winner on ER (P1 wins)
  log("🏆", "Calling reveal_winner on ER (P1 wins)...");
  let revealSig;
  try {
    const rIx = await erProg1.methods.revealWinner(0).accounts({game:gPDA,player1Hand:h1,player2Hand:h2,payer:p1.publicKey}).instruction();
    const rBH = (await erConn.getLatestBlockhash()).blockhash;
    const rTx = new Transaction({recentBlockhash:rBH,feePayer:p1.publicKey}); rTx.add(rIx); rTx.sign(p1);
    revealSig = await erConn.sendRawTransaction(rTx.serialize(),{skipPreflight:true});
    log("📤", `reveal_winner TX: ${revealSig}`);

    await sleep(5000);
    const info = await erConn.getTransaction(revealSig,{maxSupportedTransactionVersion:0});
    if (info?.meta) {
      console.log("📋 TX logs:", JSON.stringify(info.meta.logMessages, null, 2));
      if (info.meta.err) log("❌", `TX error: ${JSON.stringify(info.meta.err)}`);
      else log("✅", "reveal_winner succeeded! commit+undelegate fired!");
    }
  } catch(e) { log("❌", `reveal_winner failed: ${e.message}`); return; }

  // Poll for undelegation
  log("⏳", "Polling for undelegation...");
  let ok = false;
  for (let i=0; i<12; i++) {
    await sleep(5000);
    const info = await conn.getAccountInfo(gPDA);
    if (info && info.owner.equals(PROGRAM_ID)) { log("✅", `PDA back on L1 after ${(i+1)*5}s!`); ok=true; break; }
    log("⏳", `Poll ${i+1}/12: ${info?.owner.toBase58()}`);
  }
  if (!ok) { log("❌", "Undelegation timeout"); return; }

  // settle_pot on L1 (reveal_winner set phase=Settled + winner)
  const pre = await conn.getBalance(p1.publicKey);
  const stx = await prog1.methods.settlePot().accounts({game:gPDA,winner:p1.publicKey,payer:p1.publicKey}).rpc();
  log("✅", `settle_pot: ${stx.slice(0,20)}...`);
  const post = await conn.getBalance(p1.publicKey);
  log("💰", `P1: ${pre/LAMPORTS_PER_SOL} → ${post/LAMPORTS_PER_SOL} SOL (+${(post-pre)/LAMPORTS_PER_SOL})`);

  if (post > pre) log("🎉", "SUCCESS! Full flow works!");
}

main().catch(e => { console.error("FAILED:", e); process.exit(1); });
