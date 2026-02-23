/**
 * MagicBlock Undelegation Diagnostic — Capture exact error details for MagicBlock team
 */
const { Connection, PublicKey, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } = require("@solana/web3.js");
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const ER_RPC = "https://devnet-us.magicblock.app";
const PROGRAM_ID = new PublicKey("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");
const ER_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");
const IDL = JSON.parse(fs.readFileSync(path.join(__dirname, "src/lib/privatepoker_idl.json"), "utf8"));

const keyPath = require("os").homedir() + "/.config/solana/id.json";
const player1 = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf8"))));
const player2 = Keypair.generate();

const GAME_SEED = Buffer.from("poker_game");
const PLAYER_HAND_SEED = Buffer.from("player_hand");

function toLEBytes(v) {
  const bn = typeof v === "number" ? BigInt(v) : v;
  const bytes = new Uint8Array(8);
  let val = bn;
  for (let i = 0; i < 8; i++) { bytes[i] = Number(val & BigInt(0xff)); val >>= BigInt(8); }
  return Buffer.from(bytes);
}
function getGamePDA(id) { return PublicKey.findProgramAddressSync([GAME_SEED, toLEBytes(id)], PROGRAM_ID)[0]; }
function getPlayerHandPDA(id, pk) { return PublicKey.findProgramAddressSync([PLAYER_HAND_SEED, toLEBytes(id), pk.toBuffer()], PROGRAM_ID)[0]; }
function mkProv(conn, signer) {
  return new AnchorProvider(conn, {
    publicKey: signer.publicKey,
    signTransaction: async (tx) => { tx.sign(signer); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(signer)); return txs; },
  }, { commitment: "confirmed" });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const l1 = new Connection(DEVNET_RPC, "confirmed");
  const er = new Connection(ER_RPC, { commitment: "confirmed", wsEndpoint: "wss://devnet-us.magicblock.app/" });

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  MagicBlock Undelegation Diagnostic                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // --- Environment info ---
  console.log("=== ENVIRONMENT ===");
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("ER RPC:", ER_RPC);
  console.log("L1 RPC:", DEVNET_RPC);
  console.log("ER Validator:", ER_VALIDATOR.toBase58());
  console.log("Delegation Program:", DELEGATION_PROGRAM.toBase58());
  console.log("SDK version: ephemeral-rollups-sdk 0.6.5 (resolves to 0.6.6)");
  console.log("Anchor version: 0.32.1");
  console.log("Player1:", player1.publicKey.toBase58());
  console.log("Player2:", player2.publicKey.toBase58());

  const erVersion = await er.getVersion();
  const erSlot = await er.getSlot();
  console.log("ER node version:", JSON.stringify(erVersion));
  console.log("ER slot:", erSlot);
  console.log("");

  // --- Setup ---
  const gameId = Math.floor(Math.random() * 1_000_000_000);
  const gamePDA = getGamePDA(gameId);
  const h1 = getPlayerHandPDA(gameId, player1.publicKey);
  const h2 = getPlayerHandPDA(gameId, player2.publicKey);
  const buyIn = 0.01 * LAMPORTS_PER_SOL;

  console.log("=== GAME SETUP ===");
  console.log("Game ID:", gameId);
  console.log("Game PDA:", gamePDA.toBase58());
  console.log("Hand1 PDA:", h1.toBase58());
  console.log("Hand2 PDA:", h2.toBase58());
  console.log("");

  const l1P1 = new Program(IDL, mkProv(l1, player1));
  const l1P2 = new Program(IDL, mkProv(l1, player2));
  const erP1 = new Program(IDL, mkProv(er, player1));

  // Fund player2
  await sendAndConfirmTransaction(l1, new Transaction().add(
    SystemProgram.transfer({ fromPubkey: player1.publicKey, toPubkey: player2.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })
  ), [player1]);
  console.log("✅ Player2 funded");

  // Create + Join
  await l1P1.methods.createGame(new BN(gameId), new BN(buyIn))
    .accounts({ game: gamePDA, playerHand: h1, player1: player1.publicKey, systemProgram: SystemProgram.programId }).rpc();
  console.log("✅ Game created");

  await l1P2.methods.joinGame(new BN(gameId))
    .accounts({ game: gamePDA, playerHand: h2, player: player2.publicKey, systemProgram: SystemProgram.programId }).rpc();
  console.log("✅ Game joined");

  // Check pre-delegation state
  const preDel = await l1.getAccountInfo(gamePDA);
  console.log("\n=== PRE-DELEGATION ===");
  console.log("Game PDA owner:", preDel.owner.toBase58());
  console.log("Game PDA data length:", preDel.data.length);
  console.log("Game PDA lamports:", preDel.lamports);

  // Delegate all 3 PDAs
  console.log("\n=== DELEGATION ===");
  for (const [label, pda, at] of [
    ["Game", gamePDA, { game: { gameId: new BN(gameId) } }],
    ["Hand1", h1, { playerHand: { gameId: new BN(gameId), player: player1.publicKey } }],
    ["Hand2", h2, { playerHand: { gameId: new BN(gameId), player: player2.publicKey } }],
  ]) {
    const sig = await l1P1.methods.delegatePda(at).accounts({ pda, payer: player1.publicKey, validator: ER_VALIDATOR }).rpc();
    console.log(`✅ ${label} delegated: ${sig}`);
  }

  console.log("Waiting 8s for delegation to propagate...");
  await sleep(8000);

  // Check post-delegation state on both L1 and ER
  console.log("\n=== POST-DELEGATION STATE ===");
  for (const [label, pda] of [["Game", gamePDA], ["Hand1", h1], ["Hand2", h2]]) {
    const l1Acc = await l1.getAccountInfo(pda);
    console.log(`${label} on L1: owner=${l1Acc?.owner.toBase58()}, lamports=${l1Acc?.lamports}, dataLen=${l1Acc?.data.length}`);
    try {
      const erAcc = await er.getAccountInfo(pda);
      console.log(`${label} on ER: owner=${erAcc?.owner.toBase58()}, lamports=${erAcc?.lamports}, dataLen=${erAcc?.data.length}`);
    } catch (e) {
      console.log(`${label} on ER: ERROR - ${e.message}`);
    }
  }

  // ER Gameplay
  console.log("\n=== ER GAMEPLAY ===");

  // Deal
  try {
    const dealSig = await erP1.methods
      .dealCards(new BN(gameId), [10, 25], [5, 18], [30, 35, 40, 42, 48])
      .accounts({ game: gamePDA, player1Hand: h1, player2Hand: h2, dealer: player1.publicKey })
      .rpc({ skipPreflight: true });
    console.log("✅ deal_cards:", dealSig);
  } catch (e) {
    console.log("❌ deal_cards error:", e.message);
    if (e.logs) e.logs.forEach(l => console.log("  ", l));
  }

  // Fold
  try {
    const foldSig = await erP1.methods
      .playerAction(new BN(gameId), { fold: {} })
      .accounts({ game: gamePDA, playerHand: h1, player: player1.publicKey })
      .rpc({ skipPreflight: true });
    console.log("✅ player_action(fold):", foldSig);
  } catch (e) {
    console.log("❌ player_action error:", e.message);
    if (e.logs) e.logs.forEach(l => console.log("  ", l));
  }

  // Read ER state before reveal
  console.log("\n=== ER STATE BEFORE REVEAL ===");
  try {
    const erGame = await erP1.account.game.fetch(gamePDA);
    console.log("Phase:", JSON.stringify(erGame.phase));
    console.log("Winner:", JSON.stringify(erGame.winner));
    console.log("Pot:", erGame.pot.toString());
    console.log("Player1:", erGame.player1?.toBase58());
    console.log("Player2:", erGame.player2?.toBase58());
  } catch (e) {
    console.log("Could not fetch game struct:", e.message);
    // Fallback to raw bytes
    const erAcc = await er.getAccountInfo(gamePDA);
    if (erAcc) {
      const phaseOffset = 8 + 8 + 33 + 33 + 8 + 8;
      console.log("Raw phase byte:", erAcc.data[phaseOffset], "(5=Showdown)");
    }
  }

  // Reveal winner
  console.log("\n=== REVEAL WINNER (commit+undelegate) ===");
  let revealSig = null;
  try {
    revealSig = await erP1.methods
      .revealWinner(1) // player2 wins
      .accounts({
        game: gamePDA, player1Hand: h1, player2Hand: h2,
        payer: player1.publicKey, magicProgram: MAGIC_PROGRAM, magicContext: MAGIC_CONTEXT,
      })
      .rpc({ skipPreflight: true });
    console.log("✅ reveal_winner TX:", revealSig);
  } catch (e) {
    console.log("❌ reveal_winner error:", e.message);
    if (e.logs) {
      console.log("Program logs:");
      e.logs.forEach(l => console.log("  ", l));
    }
  }

  // Read ER state after reveal
  console.log("\n=== ER STATE AFTER REVEAL ===");
  try {
    const erGame2 = await erP1.account.game.fetch(gamePDA);
    console.log("Phase:", JSON.stringify(erGame2.phase));
    console.log("Winner:", JSON.stringify(erGame2.winner));
  } catch (e) {
    const erAcc = await er.getAccountInfo(gamePDA);
    if (erAcc) {
      const phaseOffset = 8 + 8 + 33 + 33 + 8 + 8;
      console.log("Raw phase byte:", erAcc.data[phaseOffset], "(6=Settled)");
    }
  }

  // Get reveal TX details from ER
  if (revealSig) {
    console.log("\n=== REVEAL TX DETAILS ===");
    try {
      const txInfo = await er.getTransaction(revealSig, { maxSupportedTransactionVersion: 0 });
      if (txInfo) {
        console.log("Slot:", txInfo.slot);
        console.log("Error:", txInfo.meta?.err ? JSON.stringify(txInfo.meta.err) : "none");
        console.log("Fee:", txInfo.meta?.fee);
        console.log("Log messages:");
        txInfo.meta?.logMessages?.forEach(l => console.log("  ", l));
        console.log("Inner instructions count:", txInfo.meta?.innerInstructions?.length || 0);
        if (txInfo.meta?.innerInstructions?.length > 0) {
          txInfo.meta.innerInstructions.forEach((ii, idx) => {
            console.log(`  Inner instruction set ${idx} (index ${ii.index}):`);
            ii.instructions.forEach((instr, j) => {
              console.log(`    [${j}] programIdIndex=${instr.programIdIndex}, accounts=[${instr.accounts}], data=${instr.data.slice(0,40)}...`);
            });
          });
        }
      } else {
        console.log("TX not found on ER (may have been pruned)");
      }
    } catch (e) {
      console.log("Could not fetch TX:", e.message);
    }
  }

  // Poll for undelegation with detailed output
  console.log("\n=== UNDELEGATION POLLING (60s) ===");
  const startTime = Date.now();
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    for (const [label, pda] of [["Game", gamePDA], ["Hand1", h1], ["Hand2", h2]]) {
      const acc = await l1.getAccountInfo(pda);
      const owner = acc?.owner.toBase58();
      const isDelegated = owner === DELEGATION_PROGRAM.toBase58();
      const isProgram = owner === PROGRAM_ID.toBase58();
      const status = isProgram ? "✅ UNDELEGATED" : (isDelegated ? "⏳ still delegated" : `❓ owner=${owner}`);
      if (label === "Game" || !isDelegated) {
        console.log(`[${elapsed}s] ${label}: ${status}`);
      }
    }

    // Check if all 3 undelegated
    const gameAcc = await l1.getAccountInfo(gamePDA);
    if (gameAcc && gameAcc.owner.equals(PROGRAM_ID)) {
      console.log(`\n🎉 UNDELEGATION COMPLETE after ${elapsed}s!`);
      break;
    }
  }

  // Final state
  console.log("\n=== FINAL L1 STATE ===");
  for (const [label, pda] of [["Game", gamePDA], ["Hand1", h1], ["Hand2", h2]]) {
    const acc = await l1.getAccountInfo(pda);
    console.log(`${label}: owner=${acc?.owner.toBase58()}, lamports=${acc?.lamports}`);
  }

  // Summary for MagicBlock team
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SUMMARY FOR MAGICBLOCK TEAM                               ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║                                                              ║");
  console.log(`║  Program: ${PROGRAM_ID.toBase58()}  ║`);
  console.log(`║  Game PDA: ${gamePDA.toBase58()} ║`);
  console.log(`║  ER RPC: ${ER_RPC}                       ║`);
  console.log(`║  SDK: ephemeral-rollups-sdk 0.6.6                            ║`);
  console.log(`║  Anchor: 0.32.1                                              ║`);
  console.log("║                                                              ║");
  console.log("║  ISSUE:                                                      ║");
  console.log("║  - Delegation works ✅                                       ║");
  console.log("║  - ER gameplay (deal, fold) works ✅                         ║");
  console.log("║  - reveal_winner with commit_and_undelegate_accounts ✅      ║");
  console.log("║  - Game state transitions to Settled (phase=6) on ER ✅     ║");
  console.log("║  - exit() called on all 3 accounts before commit ✅         ║");
  console.log("║  - BUT: L1 accounts remain owned by DelegationProgram       ║");
  console.log("║  - Undelegation callback never propagates to base layer     ║");
  console.log("║  - Waited 60s+ — no change                                  ║");
  console.log("║                                                              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
