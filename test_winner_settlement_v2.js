/**
 * Test: Complete Game with Winner Settlement
 * 
 * This test verifies:
 * 1. Two players create a game with real SOL buy-in
 * 2. Game completes with a winner
 * 3. Winner receives the pot in SOL
 */

const anchor = require("@coral-xyz/anchor");
const { SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const PROGRAM_ID = new PublicKey("ErDUq4vQDtAWzmksTD4vxoh3AQFijNFVYLTxJCQaqybq");

// Helper to derive PDAs
function getGamePDA(gameId) {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("poker_game"),
      new anchor.BN(gameId).toBuffer("le", 8),
    ],
    PROGRAM_ID
  );
  return pda;
}

function getPlayerHandPDA(gameId, playerPubkey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("player_hand"),
      new anchor.BN(gameId).toBuffer("le", 8),
      playerPubkey.toBuffer(),
    ],
    PROGRAM_ID
  );
  return pda;
}

async function main() {
  const connection = new anchor.web3.Connection(DEVNET_RPC, "confirmed");
  
  // Load player wallets
  const keyPath = process.env.HOME + "/.config/solana/id.json";
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const player1Keypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(keyData)
  );
  
  // Create a second player (for testing, we'll use a new keypair)
  const player2Keypair = anchor.web3.Keypair.generate();
  
  console.log("🎮 WINNER SETTLEMENT TEST");
  console.log("========================\n");
  
  console.log(`Player 1: ${player1Keypair.publicKey.toString()}`);
  console.log(`Player 2: ${player2Keypair.publicKey.toString()}\n`);
  
  // Check balances before
  const bal1Before = await connection.getBalance(player1Keypair.publicKey);
  const bal2Before = await connection.getBalance(player2Keypair.publicKey);
  
  console.log(`Player 1 balance before: ${(bal1Before / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`Player 2 balance before: ${(bal2Before / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);
  
  // Fund player 2 for testing
  const fundTx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({
      fromPubkey: player1Keypair.publicKey,
      toPubkey: player2Keypair.publicKey,
      lamports: 1 * LAMPORTS_PER_SOL,
    })
  );
  fundTx.feePayer = player1Keypair.publicKey;
  fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx.sign(player1Keypair);
  
  const fundSig = await connection.sendRawTransaction(fundTx.serialize());
  await connection.confirmTransaction(fundSig);
  console.log(`✅ Funded player 2 with 1 SOL\n`);
  
  // Load IDL
  const idlPath = "/Users/shaan/PrivateMagic/privatepoker/src/lib/privatepoker_idl.json";
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  
  // Create program instance for player 1
  const provider1 = new anchor.AnchorProvider(connection, {
    publicKey: player1Keypair.publicKey,
    signTransaction: async (tx) => { tx.sign(player1Keypair); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(player1Keypair)); return txs; },
  }, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  const program1 = new anchor.Program(idl, provider1);
  
  // Create program instance for player 2
  const provider2 = new anchor.AnchorProvider(connection, {
    publicKey: player2Keypair.publicKey,
    signTransaction: async (tx) => { tx.sign(player2Keypair); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(player2Keypair)); return txs; },
  }, {
    commitment: "confirmed",
    skipPreflight: false,
  });
  const program2 = new anchor.Program(idl, provider2);
  
  // Game setup
  const gameId = Math.floor(Math.random() * 1000000);
  const buyInLamports = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL buy-in
  
  console.log(`📊 Game Setup:`);
  console.log(`  Game ID: ${gameId}`);
  console.log(`  Buy-in: 0.1 SOL`);
  console.log(`  Pot: 0.2 SOL (2x buy-in)\n`);
  
  // Step 1: Create game
  console.log("1️⃣ Creating game...");
  const gamePDA = getGamePDA(gameId);
  
  try {
    const createTx = await program1.methods
      .createGame(new anchor.BN(gameId), new anchor.BN(buyInLamports))
      .accounts({
        game: gamePDA,
        payer: player1Keypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: false, maxRetries: 3 });
    
    console.log(`   ✅ Game created! TX: ${createTx}\n`);
  } catch (err) {
    console.error(`   ❌ Failed to create game: ${err.message}`);
    return;
  }
  
  // Step 2: Join game
  console.log("2️⃣ Player 2 joining game...");
  
  try {
    const joinTx = await program2.methods
      .joinGame(new anchor.BN(gameId))
      .accounts({
        game: gamePDA,
        payer: player2Keypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: false, maxRetries: 3 });
    
    console.log(`   ✅ Player 2 joined! TX: ${joinTx}\n`);
  } catch (err) {
    console.error(`   ❌ Failed to join game: ${err.message}`);
    return;
  }
  
  // Step 3: Get hand PDAs
  const hand1PDA = getPlayerHandPDA(gameId, player1Keypair.publicKey);
  const hand2PDA = getPlayerHandPDA(gameId, player2Keypair.publicKey);
  
  // Step 4: Reveal winner (player 1 wins = 0)
  console.log("3️⃣ Revealing winner (Player 1 wins)...");
  
  try {
    const winnerTx = await program1.methods
      .revealWinner(0) // 0 = player1 wins
      .accounts({
        game: gamePDA,
        player1Hand: hand1PDA,
        player2Hand: hand2PDA,
        payer: player1Keypair.publicKey,
        winner: player1Keypair.publicKey, // Player 1 receives pot
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: false, maxRetries: 3 });
    
    console.log(`   ✅ Winner revealed! TX: ${winnerTx}`);
    console.log(`   🎉 Player 1 should receive 0.2 SOL pot!\n`);
  } catch (err) {
    console.error(`   ❌ Failed to reveal winner: ${err.message}`);
    console.error(err);
    return;
  }
  
  // Wait for settlement
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 5: Check final balances
  console.log("4️⃣ Checking final balances...");
  const bal1After = await connection.getBalance(player1Keypair.publicKey);
  const bal2After = await connection.getBalance(player2Keypair.publicKey);
  
  const player1Change = (bal1After - bal1Before) / LAMPORTS_PER_SOL;
  const player2Change = (bal2After - bal2Before) / LAMPORTS_PER_SOL;
  
  console.log(`   Player 1 balance after: ${(bal1After / LAMPORTS_PER_SOL).toFixed(4)} SOL (change: ${player1Change > 0 ? '+' : ''}${player1Change.toFixed(4)} SOL)`);
  console.log(`   Player 2 balance after: ${(bal2After / LAMPORTS_PER_SOL).toFixed(4)} SOL (change: ${player2Change > 0 ? '+' : ''}${player2Change.toFixed(4)} SOL)\n`);
  
  // Verify settlement
  console.log("📋 SETTLEMENT VERIFICATION:");
  if (player1Change > 0.05) {
    console.log(`   ✅ Player 1 RECEIVED POT! (~0.2 SOL after fees)`);
    console.log(`   ✅ WINNER SETTLEMENT WORKING! 🎉`);
  } else {
    console.log(`   ❌ Player 1 did NOT receive pot (change: ${player1Change.toFixed(4)} SOL)`);
    console.log(`   ❌ WINNER SETTLEMENT BROKEN`);
  }
  
  if (player2Change < -0.05) {
    console.log(`   ✅ Player 2 spent buy-in + fees as expected`);
  }
}

main().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
