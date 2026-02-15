const { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
const fs = require("fs");

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const PROGRAM_ID = new PublicKey("ErDUq4vQDtAWzmksTD4vxoh3AQFijNFVYLTxJCQaqybq");

const IDL = JSON.parse(fs.readFileSync("src/lib/privatepoker_idl.json", "utf8"));
const walletKeyData = JSON.parse(fs.readFileSync(require("os").homedir() + "/.config/solana/id.json", "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(walletKeyData));

const GAME_SEED = Buffer.from("poker_game");
const PLAYER_HAND_SEED = Buffer.from("player_hand");

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  
  // Check wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`\n💰 Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`💰 Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  
  // Create game with real SOL buy-in
  const gameId = Math.floor(Math.random() * 1_000_000_000);
  const buyIn = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL
  
  const gameIdBuffer = Buffer.alloc(8);
  gameIdBuffer.writeBigUInt64LE(BigInt(gameId));
  
  const [gamePDA] = PublicKey.findProgramAddressSync([GAME_SEED, gameIdBuffer], PROGRAM_ID);
  const [playerHandPDA] = PublicKey.findProgramAddressSync(
    [PLAYER_HAND_SEED, gameIdBuffer, wallet.publicKey.toBuffer()], PROGRAM_ID
  );
  
  console.log(`\n🎮 Creating game ${gameId} with 0.01 SOL buy-in...`);
  console.log(`📍 Game PDA: ${gamePDA.toBase58()}`);
  
  const provider = new AnchorProvider(connection, {
    publicKey: wallet.publicKey,
    signTransaction: async (tx) => { tx.sign(wallet); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(wallet)); return txs; },
  }, { commitment: "confirmed" });
  
  const program = new Program(IDL, provider);
  
  try {
    const tx = await program.methods
      .createGame(new BN(gameId), new BN(buyIn))
      .accounts({
        game: gamePDA,
        playerHand: playerHandPDA,
        player1: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log(`✅ Game created! TX: ${tx}`);
    console.log(`🔗 Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    // Read game state
    const gameAccount = await program.account.game.fetch(gamePDA);
    console.log(`\n📊 Game State:`);
    console.log(`   Game ID: ${gameAccount.gameId.toNumber()}`);
    console.log(`   Player 1: ${gameAccount.player1?.toBase58()}`);
    console.log(`   Buy-in: ${gameAccount.buyIn.toNumber() / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Pot: ${gameAccount.pot.toNumber() / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Phase: ${JSON.stringify(gameAccount.phase)}`);
    
    // Check game PDA balance (should have the SOL)
    const pdaBalance = await connection.getBalance(gamePDA);
    console.log(`\n💎 Game PDA balance: ${pdaBalance / LAMPORTS_PER_SOL} SOL`);
    
    // Check wallet balance after
    const balAfter = await connection.getBalance(wallet.publicKey);
    console.log(`💰 Wallet balance after: ${balAfter / LAMPORTS_PER_SOL} SOL`);
    console.log(`📉 SOL spent: ${(balance - balAfter) / LAMPORTS_PER_SOL} SOL (buy-in + rent + fee)`);
    
    console.log(`\n🎉 REAL SOL IS BEING STAKED ON-CHAIN! ✅`);
    console.log(`🎉 Winner will receive the pot SOL on settlement!`);
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.logs) console.error("Logs:", err.logs.join("\n"));
  }
}

main();
