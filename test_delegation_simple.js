/**
 * Test: MagicBlock Delegation Works ✅
 * 
 * This test verifies that delegation works correctly.
 * Full undelegation requires actual ER transaction processing which 
 * happens during real gameplay.
 */

const { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction } = require("@solana/web3.js");
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
const fs = require("fs");

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const PROGRAM_ID = new PublicKey("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");
const ER_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

const IDL = JSON.parse(fs.readFileSync("src/lib/privatepoker_idl.json", "utf8"));
const walletKeyData = JSON.parse(fs.readFileSync(require("os").homedir() + "/.config/solana/id.json", "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(walletKeyData));

const GAME_SEED = Buffer.from("poker_game");
const PLAYER_HAND_SEED = Buffer.from("player_hand");

function toLEBytes(value) {
  const bn = typeof value === "number" ? BigInt(value) : value;
  const bytes = new Uint8Array(8);
  let v = bn;
  const mask = BigInt(0xff);
  const shift = BigInt(8);
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(v & mask);
    v >>= shift;
  }
  return Buffer.from(bytes);
}

function getGamePDA(gameId) {
  const [pda] = PublicKey.findProgramAddressSync([GAME_SEED, toLEBytes(gameId)], PROGRAM_ID);
  return pda;
}

function getPlayerHandPDA(gameId, playerPubkey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [PLAYER_HAND_SEED, toLEBytes(gameId), playerPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║   MagicBlock Delegation Flow - Terminal Test    ║");
  console.log("║   (Full undelegation requires live ER gameplay)    ║");
  console.log("╚════════════════════════════════════════════════════╝\n");

  const connection = new Connection(DEVNET_RPC, "confirmed");
  
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`💰 Player: ${wallet.publicKey.toBase58()}`);
  console.log(`💰 Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);
  
  if (balance < 0.2 * LAMPORTS_PER_SOL) {
    console.error("❌ Need at least 0.2 SOL");
    process.exit(1);
  }
  
  // Create test game
  const gameId = Math.floor(Math.random() * 1_000_000_000);
  const buyIn = 0.1 * LAMPORTS_PER_SOL;
  
  const gamePDA = getGamePDA(gameId);
  const hand1PDA = getPlayerHandPDA(gameId, wallet.publicKey);
  
  console.log(`📌 Test Setup:`);
  console.log(`   Game ID: ${gameId}`);
  console.log(`   Game PDA: ${gamePDA.toBase58()}`);
  console.log(`   Buy-in: 0.1 SOL\n`);
  
  const provider = new AnchorProvider(connection, {
    publicKey: wallet.publicKey,
    signTransaction: async (tx) => { tx.sign(wallet); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(wallet)); return txs; },
  }, { commitment: "confirmed" });
  
  const program = new Program(IDL, provider);
  
  try {
    // Step 1: Create game
    console.log("📍 Step 1: Creating game on Solana L1");
    const createTx = await program.methods
      .createGame(new BN(gameId), new BN(buyIn))
      .accounts({
        game: gamePDA,
        playerHand: hand1PDA,
        player1: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log(`   ✅ TX: ${createTx.slice(0, 20)}...\n`);
    
    // Check initial ownership
    let account = await connection.getAccountInfo(gamePDA);
    console.log(`📍 Step 2: Verify initial ownership (L1 program)`);
    console.log(`   Owner: ${account.owner.toBase58()}`);
    console.log(`   ✅ Owned by poker program\n`);
    
    if (!account.owner.equals(PROGRAM_ID)) {
      console.error("❌ Initial owner should be poker program");
      process.exit(1);
    }
    
    // Step 2: Delegate to MagicBlock
    console.log(`📍 Step 3: Delegate PDA to MagicBlock ER Validator`);
    console.log(`   ER Validator: ${ER_VALIDATOR.toBase58()}`);
    
    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const delegateTx = new Transaction({
      recentBlockhash,
      feePayer: wallet.publicKey,
    });
    
    const delegateIx = await program.methods
      .delegatePda({ game: { gameId: new BN(gameId) } })
      .accounts({
        pda: gamePDA,
        payer: wallet.publicKey,
        validator: ER_VALIDATOR,
      })
      .instruction();
    
    delegateTx.add(delegateIx);
    delegateTx.sign(wallet);
    
    const delegateTxSig = await connection.sendRawTransaction(delegateTx.serialize(), {
      skipPreflight: false,
    });
    
    console.log(`   ✅ Delegation TX: ${delegateTxSig.slice(0, 20)}...\n`);
    
    await connection.confirmTransaction(delegateTxSig, "confirmed");
    
    // Check ownership after delegation
    account = await connection.getAccountInfo(gamePDA);
    console.log(`📍 Step 4: Verify post-delegation ownership`);
    console.log(`   Owner: ${account.owner.toBase58()}`);
    console.log(`   Expected: ${DELEGATION_PROGRAM.toBase58()}`);
    
    if (account.owner.equals(DELEGATION_PROGRAM)) {
      console.log(`   ✅ Ownership transferred to Delegation Program!\n`);
    } else {
      console.error("   ❌ Delegation failed");
      process.exit(1);
    }
    
    // Step 3: Explain the ER flow
    console.log(`📍 Step 5: MagicBlock Ephemeral Rollup Flow`);
    console.log(`   During live gameplay:`);
    console.log(`   1. Game runs on ER RPC (devnet-us.magicblock.app)`);
    console.log(`   2. Player actions are fast & gasless on ER`);
    console.log(`   3. Game completion: reveal_winner on ER calls:`);
    console.log(`      - commit_and_undelegate_accounts()`);
    console.log(`      - Schedules undelegation back to L1`);
    console.log(`   4. MagicBlock validator CPIs process_undelegation`);
    console.log(`   5. Account ownership returns to poker program`);
    console.log(`   6. Settlement TX calls settle_game on L1\n`);
    
    console.log(`📍 Step 6: Expected undelegation timeline`);
    console.log(`   - reveal_winner sent to ER RPC`);
    console.log(`   - Validator processes commit+undelegate (5-10s)`);
    console.log(`   - Callback CPI process_undelegation (5-15s)`);
    console.log(`   - Account ownership returns (20-30s total)\n`);
    
    console.log("╔════════════════════════════════════════════════════╗");
    console.log("║     ✅ DELEGATION WORKS CORRECTLY!                ║");
    console.log("║                                                    ║");
    console.log("║  For full end-to-end test, run the game UI with:  ║");
    console.log("║  - Player 1 creates multiplayer game              ║");
    console.log("║  - Player 2 joins with room code                  ║");
    console.log("║  - Both play a hand                               ║");
    console.log("║  - Delegation happens automatically               ║");
    console.log("║  - Winner claims winnings                         ║");
    console.log("║  - Watch logs for delegation→undelegation→settle  ║");
    console.log("╚════════════════════════════════════════════════════╝\n");
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.logs) console.error("Logs:", err.logs.join("\n"));
    process.exit(1);
  }
}

main().catch(console.error);
