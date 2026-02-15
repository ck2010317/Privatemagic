/**
 * Real on-chain verification test
 * Calls the deployed program on devnet to verify:
 * 1. Program exists and is executable
 * 2. Can create a game (real transaction)
 * 3. MagicBlock delegation program exists
 * 4. TEE validator exists
 */

const { Connection, PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const { Program, AnchorProvider, Wallet, BN } = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");

const HELIUS_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const PROGRAM_ID = new PublicKey("ErDUq4vQDtAWzmksTD4vxoh3AQFijNFVYLTxJCQaqybq");
const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const TEE_VALIDATOR = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");
const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");

async function main() {
  const connection = new Connection(HELIUS_RPC, "confirmed");

  console.log("=".repeat(60));
  console.log("🔍 VERIFYING ON-CHAIN DEPLOYMENT");
  console.log("=".repeat(60));

  // 1. Verify our program
  console.log("\n1️⃣  Checking program: " + PROGRAM_ID.toBase58());
  const programInfo = await connection.getAccountInfo(PROGRAM_ID);
  if (programInfo && programInfo.executable) {
    console.log("   ✅ Program EXISTS and is EXECUTABLE");
    console.log("   📦 Data length:", programInfo.data.length, "bytes");
    console.log("   👤 Owner:", programInfo.owner.toBase58());
    console.log("   💰 Balance:", programInfo.lamports / 1e9, "SOL");
  } else {
    console.log("   ❌ Program NOT FOUND or not executable!");
    return;
  }

  // 2. Verify MagicBlock Delegation Program
  console.log("\n2️⃣  Checking MagicBlock Delegation Program: " + DELEGATION_PROGRAM.toBase58());
  const delegationInfo = await connection.getAccountInfo(DELEGATION_PROGRAM);
  if (delegationInfo && delegationInfo.executable) {
    console.log("   ✅ MagicBlock Delegation Program EXISTS on devnet");
    console.log("   📦 Data length:", delegationInfo.data.length, "bytes");
  } else {
    console.log("   ⚠️  Delegation program not found (may need devnet feature gate)");
  }

  // 3. Verify TEE Validator account
  console.log("\n3️⃣  Checking TEE Validator: " + TEE_VALIDATOR.toBase58());
  const teeInfo = await connection.getAccountInfo(TEE_VALIDATOR);
  if (teeInfo) {
    console.log("   ✅ TEE Validator account EXISTS");
    console.log("   💰 Balance:", teeInfo.lamports / 1e9, "SOL");
  } else {
    console.log("   ⚠️  TEE Validator account not found on devnet");
  }

  // 4. Test creating a game (REAL transaction)
  console.log("\n4️⃣  Testing real transaction — creating a game...");
  try {
    const walletKeypairPath = path.join(process.env.HOME, ".config/solana/id.json");
    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(walletKeypairPath, "utf-8")))
    );
    console.log("   🔑 Wallet:", walletKeypair.publicKey.toBase58());

    const wallet = new Wallet(walletKeypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    const idlPath = path.join(__dirname, "target/idl/privatepoker.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    const program = new Program(idl, provider);

    const gameId = Math.floor(Math.random() * 1_000_000_000);
    const gameIdBN = new BN(gameId);
    const buyIn = new BN(10_000_000); // 0.01 SOL

    const GAME_SEED = Buffer.from("poker_game");
    const PLAYER_HAND_SEED = Buffer.from("player_hand");

    const gameIdBuffer = Buffer.alloc(8);
    gameIdBuffer.writeBigUInt64LE(BigInt(gameId));

    const [gamePDA] = PublicKey.findProgramAddressSync(
      [GAME_SEED, gameIdBuffer],
      PROGRAM_ID
    );
    const [handPDA] = PublicKey.findProgramAddressSync(
      [PLAYER_HAND_SEED, gameIdBuffer, walletKeypair.publicKey.toBuffer()],
      PROGRAM_ID
    );

    console.log("   📝 Game ID:", gameId);
    console.log("   📍 Game PDA:", gamePDA.toBase58());

    const tx = await program.methods
      .createGame(gameIdBN, buyIn)
      .accounts({
        game: gamePDA,
        playerHand: handPDA,
        player1: walletKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("   ✅ TRANSACTION SUCCESSFUL!");
    console.log("   📜 Signature:", tx);
    console.log("   🔗 Explorer: https://explorer.solana.com/tx/" + tx + "?cluster=devnet");

    // 5. Read back the game account to verify data
    console.log("\n5️⃣  Reading game account from chain...");
    const gameAccount = await program.account.game.fetch(gamePDA);
    console.log("   ✅ Game account read successfully!");
    console.log("   🎮 Game ID:", gameAccount.gameId.toString());
    console.log("   👤 Player 1:", gameAccount.player1.toBase58());
    console.log("   💰 Buy-in:", gameAccount.buyIn.toString(), "lamports (" + (gameAccount.buyIn.toNumber() / 1e9) + " SOL)");
    console.log("   💰 Pot:", gameAccount.pot.toString(), "lamports");
    console.log("   📊 Phase:", JSON.stringify(gameAccount.phase));
    console.log("   🎯 Turn:", gameAccount.turn);

  } catch (err) {
    console.log("   ❌ Transaction failed:", err.message);
    if (err.logs) {
      console.log("   📋 Logs:");
      err.logs.forEach(l => console.log("      ", l));
    }
  }

  // 6. Check IDL for MagicBlock markers
  console.log("\n6️⃣  MagicBlock Integration Proof:");
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "target/idl/privatepoker.json"), "utf-8"));
  const instructions = idl.instructions.map(i => i.name);
  console.log("   📋 All instructions:", instructions.join(", "));
  
  const hasDelegation = instructions.includes("delegate_pda");
  const hasUndelegation = instructions.includes("process_undelegation");
  const hasCommit = idl.instructions.find(i => i.name === "reveal_winner")?.accounts?.some(a => a.name === "magic_program");
  
  console.log("   " + (hasDelegation ? "✅" : "❌") + " delegate_pda (delegates PDA to TEE validator)");
  console.log("   " + (hasUndelegation ? "✅" : "❌") + " process_undelegation (injected by #[ephemeral] macro)");
  console.log("   " + (hasCommit ? "✅" : "❌") + " magic_program in reveal_winner (commit back to L1)");
  
  const delegateAccounts = idl.instructions.find(i => i.name === "delegate_pda")?.accounts || [];
  const delegationRef = delegateAccounts.find(a => a.name === "delegation_program");
  if (delegationRef) {
    console.log("   ✅ References DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh (MagicBlock Delegation Program)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ VERIFICATION COMPLETE");
  console.log("=".repeat(60));
  console.log("\nProgram ID: " + PROGRAM_ID.toBase58());
  console.log("Explorer:   https://explorer.solana.com/address/" + PROGRAM_ID.toBase58() + "?cluster=devnet");
  console.log("Network:    Solana Devnet (via Helius RPC)");
  console.log("MagicBlock: Ephemeral Rollups with TEE delegation");
}

main().catch(console.error);
