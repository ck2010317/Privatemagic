import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import pkg from "@coral-xyz/anchor";
const { Program, AnchorProvider, BN, Wallet } = pkg;
import fs from "fs";

const PROGRAM_ID = new PublicKey("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");
const RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const LAMPORTS_PER_SOL = 1000000000;

async function main() {
  const connection = new Connection(RPC, "confirmed");
  
  const keypairData = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log("Wallet:", wallet.publicKey.toBase58());
  
  const idl = JSON.parse(fs.readFileSync("src/lib/privatepoker_idl.json", "utf8"));
  console.log("IDL address:", idl.address);
  
  const provider = new AnchorProvider(connection, new Wallet(wallet), { commitment: "confirmed" });
  const program = new Program(idl, provider);
  console.log("Program ID:", program.programId.toBase58());
  
  const gameId = new BN(Math.floor(Math.random() * 1000000000));
  const buyIn = new BN(0.001 * LAMPORTS_PER_SOL);
  
  const [gamePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("poker_game"), gameId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
  
  const [playerHandPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player_hand"), gameId.toArrayLike(Buffer, "le", 8), wallet.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  console.log("Game PDA:", gamePda.toBase58());
  console.log("Calling create_game with gameId:", gameId.toString(), "buyIn:", buyIn.toString());
  
  try {
    const tx = await program.methods
      .createGame(gameId, buyIn)
      .accounts({
        game: gamePda,
        playerHand: playerHandPda,
        player1: wallet.publicKey,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      })
      .rpc();
    console.log("✅ SUCCESS! TX:", tx);
  } catch (e) {
    console.log("❌ FAILED:", e.message || e);
    if (e.logs) {
      console.log("Logs:");
      e.logs.forEach(l => console.log("  ", l));
    }
  }
}

main().catch(console.error);
