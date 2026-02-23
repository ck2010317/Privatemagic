const { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction } = require("@solana/web3.js");
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
const fs = require("fs");

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const PROGRAM_ID = new PublicKey("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");

const IDL = JSON.parse(fs.readFileSync("src/lib/privatepoker_idl.json", "utf8"));

// Load players
const keyPath = require("os").homedir() + "/.config/solana/id.json";
const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
const player1 = Keypair.fromSecretKey(Uint8Array.from(keyData));
const player2 = Keypair.generate();

const GAME_SEED = Buffer.from("poker_game");

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
  const PLAYER_HAND_SEED = Buffer.from("player_hand");
  const [pda] = PublicKey.findProgramAddressSync([PLAYER_HAND_SEED, toLEBytes(gameId), playerPubkey.toBuffer()], PROGRAM_ID);
  return pda;
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  
  const provider = new AnchorProvider(connection, {
    publicKey: player1.publicKey,
    signTransaction: async (tx) => { tx.sign(player1); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(player1)); return txs; },
  }, { commitment: "confirmed" });
  
  const program = new Program(IDL, provider);
  
  const gameId = Math.floor(Math.random() * 1_000_000_000);
  const gamePDA = getGamePDA(gameId);
  const hand1PDA = getPlayerHandPDA(gameId, player1.publicKey);
  const buyIn = 0.05 * LAMPORTS_PER_SOL;
  
  try {
    console.log("Creating game...");
    const createTx = await program.methods
      .createGame(new BN(gameId), new BN(buyIn))
      .accounts({
        game: gamePDA,
        playerHand: hand1PDA,
        player1: player1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Game created:", createTx);
    
    console.log("\nSettling game...");
    console.log("- Payer:", player1.publicKey.toBase58());
    console.log("- Game PDA:", gamePDA.toBase58());
    console.log("- Winner:", player1.publicKey.toBase58());
    console.log("- Loser:", player2.publicKey.toBase58());
    
    const settleTx = await program.methods
      .settleGame(0, new BN(buyIn))
      .accounts({
        payer: player1.publicKey,
        game: gamePDA,
        winner: player1.publicKey,
        loser: player2.publicKey,
      })
      .rpc();
    
    console.log("✅ Game settled:", settleTx);
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.logs) {
      console.error("\nLogs:");
      err.logs.forEach(l => console.error(`  ${l}`));
    }
  }
}

main().catch(console.error);
