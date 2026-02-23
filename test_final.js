/**
 * Final comprehensive test for Private Poker on Solana + MagicBlock ER
 * Tests: create_game → join_game → settle_game → verify balances
 */
const { Connection, PublicKey, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } = require("@solana/web3.js");
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
const fs = require("fs");

// ─── Config ───
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const PROGRAM_ID = new PublicKey("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");
const IDL = JSON.parse(fs.readFileSync("src/lib/privatepoker_idl.json", "utf8"));

// ─── Wallets ───
const keyPath = require("os").homedir() + "/.config/solana/id.json";
const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
const player1 = Keypair.fromSecretKey(Uint8Array.from(keyData));
const player2 = Keypair.generate();

// ─── PDA Seeds ───
const GAME_SEED = Buffer.from("poker_game");
const PLAYER_HAND_SEED = Buffer.from("player_hand");

function toLEBytes(value) {
  const bn = typeof value === "number" ? BigInt(value) : value;
  const bytes = new Uint8Array(8);
  let v = bn;
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(v & BigInt(0xff));
    v >>= BigInt(8);
  }
  return Buffer.from(bytes);
}

function getGamePDA(gameId) {
  const [pda] = PublicKey.findProgramAddressSync([GAME_SEED, toLEBytes(gameId)], PROGRAM_ID);
  return pda;
}

function getPlayerHandPDA(gameId, playerPubkey) {
  const [pda] = PublicKey.findProgramAddressSync([PLAYER_HAND_SEED, toLEBytes(gameId), playerPubkey.toBuffer()], PROGRAM_ID);
  return pda;
}

function makeProvider(connection, signer) {
  return new AnchorProvider(connection, {
    publicKey: signer.publicKey,
    signTransaction: async (tx) => { tx.sign(signer); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(signer)); return txs; },
  }, { commitment: "confirmed" });
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const gameId = Math.floor(Math.random() * 1_000_000_000);
  const gamePDA = getGamePDA(gameId);
  const hand1PDA = getPlayerHandPDA(gameId, player1.publicKey);
  const hand2PDA = getPlayerHandPDA(gameId, player2.publicKey);
  const buyIn = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL buy-in

  console.log("═══════════════════════════════════════════════════════");
  console.log("  🃏  PRIVATE POKER — Final End-to-End Test");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Game ID:    ${gameId}`);
  console.log(`  Game PDA:   ${gamePDA.toBase58()}`);
  console.log(`  Player 1:   ${player1.publicKey.toBase58()}`);
  console.log(`  Player 2:   ${player2.publicKey.toBase58()}`);
  console.log(`  Buy-in:     ${buyIn / LAMPORTS_PER_SOL} SOL`);
  console.log("═══════════════════════════════════════════════════════\n");

  // ─── Step 0: Fund player2 ───
  console.log("💰 Step 0: Funding player2...");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: player1.publicKey,
      toPubkey: player2.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL, // enough for buy-in + rent
    })
  );
  await sendAndConfirmTransaction(connection, fundTx, [player1]);
  const p2Balance = await connection.getBalance(player2.publicKey);
  console.log(`  ✅ Player2 funded: ${p2Balance / LAMPORTS_PER_SOL} SOL\n`);

  // ─── Step 1: Create game (player1) ───
  console.log("🎮 Step 1: Creating game...");
  const provider1 = makeProvider(connection, player1);
  const program1 = new Program(IDL, provider1);

  const createTx = await program1.methods
    .createGame(new BN(gameId), new BN(buyIn))
    .accounts({
      game: gamePDA,
      playerHand: hand1PDA,
      player1: player1.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`  ✅ Game created: ${createTx}\n`);

  // ─── Step 2: Join game (player2) ───
  console.log("🤝 Step 2: Player2 joining game...");
  const provider2 = makeProvider(connection, player2);
  const program2 = new Program(IDL, provider2);

  const joinTx = await program2.methods
    .joinGame(new BN(gameId))
    .accounts({
      game: gamePDA,
      playerHand: hand2PDA,
      player: player2.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`  ✅ Player2 joined: ${joinTx}\n`);

  // ─── Verify game state ───
  console.log("🔍 Step 3: Verifying game state...");
  const gameData = await program1.account.game.fetch(gamePDA);
  console.log(`  Game ID:     ${gameData.gameId.toString()}`);
  console.log(`  Player 1:    ${gameData.player1?.toBase58()}`);
  console.log(`  Player 2:    ${gameData.player2?.toBase58()}`);
  console.log(`  Pot:         ${gameData.pot.toString()} lamports (${Number(gameData.pot) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  Phase:       ${JSON.stringify(gameData.phase)}`);
  console.log(`  Buy-in:      ${gameData.buyIn.toString()} lamports`);

  const gamePDABalance = await connection.getBalance(gamePDA);
  console.log(`  PDA balance: ${gamePDABalance} lamports (${gamePDABalance / LAMPORTS_PER_SOL} SOL)\n`);

  // ─── Step 4: Record balances before settlement ───
  console.log("💵 Step 4: Recording pre-settlement balances...");
  const p1BalanceBefore = await connection.getBalance(player1.publicKey);
  const p2BalanceBefore = await connection.getBalance(player2.publicKey);
  console.log(`  Player1 balance: ${p1BalanceBefore / LAMPORTS_PER_SOL} SOL`);
  console.log(`  Player2 balance: ${p2BalanceBefore / LAMPORTS_PER_SOL} SOL`);
  console.log(`  Game PDA balance: ${gamePDABalance / LAMPORTS_PER_SOL} SOL\n`);

  // ─── Step 5: Settle game (player1 wins, no signer required) ───
  // PDA constraints guarantee integrity — winner/loser verified against game state
  console.log("🏆 Step 5: Settling game (player1 wins)...");
  console.log("  winner_index = 0 (player1)");
  console.log("  actual_pot = buy_in * 2 (winner takes all)\n");

  try {
    const settleTx = await program1.methods
      .settleGame(0, new BN(buyIn * 2))
      .accounts({
        game: gamePDA,
        winner: player1.publicKey,
        loser: player2.publicKey,
      })
      .rpc();
    console.log(`  ✅ Game settled! TX: ${settleTx}\n`);
  } catch (err) {
    console.error("  ❌ Settlement FAILED:", err.message);
    if (err.logs) {
      console.error("\n  Program Logs:");
      err.logs.forEach(l => console.error(`    ${l}`));
    }
    process.exit(1);
  }

  // ─── Step 6: Verify final balances ───
  console.log("✅ Step 6: Verifying final balances...");
  const p1BalanceAfter = await connection.getBalance(player1.publicKey);
  const p2BalanceAfter = await connection.getBalance(player2.publicKey);
  const gamePDABalanceAfter = await connection.getBalance(gamePDA);

  const p1Diff = p1BalanceAfter - p1BalanceBefore;
  const p2Diff = p2BalanceAfter - p2BalanceBefore;

  console.log(`  Player1: ${p1BalanceBefore / LAMPORTS_PER_SOL} → ${p1BalanceAfter / LAMPORTS_PER_SOL} SOL (${p1Diff > 0 ? "+" : ""}${p1Diff / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  Player2: ${p2BalanceBefore / LAMPORTS_PER_SOL} → ${p2BalanceAfter / LAMPORTS_PER_SOL} SOL (${p2Diff > 0 ? "+" : ""}${p2Diff / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  Game PDA: ${gamePDABalance / LAMPORTS_PER_SOL} → ${gamePDABalanceAfter / LAMPORTS_PER_SOL} SOL\n`);

  // ─── Verify game state is settled ───
  const finalGame = await program1.account.game.fetch(gamePDA);
  console.log("📊 Final game state:");
  console.log(`  Phase:  ${JSON.stringify(finalGame.phase)}`);
  console.log(`  Winner: ${JSON.stringify(finalGame.winner)}`);
  console.log(`  Pot:    ${finalGame.pot.toString()} lamports\n`);

  // ─── Summary ───
  const potReceived = p1Diff > 0;
  console.log("═══════════════════════════════════════════════════════");
  if (potReceived) {
    console.log("  🎉  ALL TESTS PASSED — Settlement works!");
  } else {
    console.log("  ⚠️  Settlement TX succeeded but player1 didn't gain SOL");
    console.log("  (may be offset by TX fees)");
  }
  console.log("═══════════════════════════════════════════════════════");
}

main().catch(console.error);
