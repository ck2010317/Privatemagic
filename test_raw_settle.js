/**
 * Raw transaction test - bypasses Anchor client entirely
 */
const { Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } = require("@solana/web3.js");
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
const fs = require("fs");

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
const PROGRAM_ID = new PublicKey("7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK");
const IDL = JSON.parse(fs.readFileSync("src/lib/privatepoker_idl.json", "utf8"));

const keyPath = require("os").homedir() + "/.config/solana/id.json";
const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
const player1 = Keypair.fromSecretKey(Uint8Array.from(keyData));
const player2 = Keypair.generate();

const GAME_SEED = Buffer.from("poker_game");
const PLAYER_HAND_SEED = Buffer.from("player_hand");

function toLEBytes(value) {
  const bn = typeof value === "number" ? BigInt(value) : value;
  const bytes = new Uint8Array(8);
  let v = bn;
  for (let i = 0; i < 8; i++) { bytes[i] = Number(v & BigInt(0xff)); v >>= BigInt(8); }
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
  const buyIn = 0.01 * LAMPORTS_PER_SOL;

  console.log("Game ID:", gameId);
  console.log("Player 1:", player1.publicKey.toBase58());
  console.log("Player 2:", player2.publicKey.toBase58());

  // Fund player2
  console.log("\n💰 Funding player2...");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: player1.publicKey,
      toPubkey: player2.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  await sendAndConfirmTransaction(connection, fundTx, [player1]);
  console.log("  ✅ Funded");

  // Create game using Anchor
  console.log("\n🎮 Creating game...");
  const provider1 = makeProvider(connection, player1);
  const program1 = new Program(IDL, provider1);
  await program1.methods
    .createGame(new BN(gameId), new BN(buyIn))
    .accounts({ game: gamePDA, playerHand: hand1PDA, player1: player1.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  console.log("  ✅ Created");

  // Join game using Anchor
  console.log("\n🤝 Player2 joining...");
  const provider2 = makeProvider(connection, player2);
  const program2 = new Program(IDL, provider2);
  await program2.methods
    .joinGame(new BN(gameId))
    .accounts({ game: gamePDA, playerHand: hand2PDA, player: player2.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  console.log("  ✅ Joined");

  // Now settle using RAW TRANSACTION (no Anchor client for settle)
  console.log("\n🏆 Settling with RAW transaction...");

  // Build the settle_game instruction data manually
  // Discriminator: [96, 54, 24, 189, 239, 198, 86, 29]
  // Args: winner_index (u8) = 0, actual_pot (u64) = buyIn * 2
  const discriminator = Buffer.from([96, 54, 24, 189, 239, 198, 86, 29]);
  const winnerIndex = Buffer.from([0]); // u8
  const actualPot = Buffer.alloc(8);
  actualPot.writeBigUInt64LE(BigInt(buyIn * 2));

  const data = Buffer.concat([discriminator, winnerIndex, actualPot]);

  const settleIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: gamePDA, isSigner: false, isWritable: true },
      { pubkey: player1.publicKey, isSigner: true, isWritable: true },  // winner
      { pubkey: player2.publicKey, isSigner: false, isWritable: true },  // loser
    ],
    data: data,
  });

  console.log("  Raw instruction accounts:");
  settleIx.keys.forEach((k, i) => {
    console.log(`    [${i}] ${k.pubkey.toBase58().substring(0, 20)}... isSigner:${k.isSigner} isWritable:${k.isWritable}`);
  });

  const settleTx = new Transaction().add(settleIx);
  settleTx.feePayer = player1.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  settleTx.recentBlockhash = blockhash;

  console.log("  Fee payer:", settleTx.feePayer.toBase58());
  console.log("  Signing with player1...");

  try {
    const sig = await sendAndConfirmTransaction(connection, settleTx, [player1]);
    console.log("  ✅ Settlement SUCCESS:", sig);

    // Verify
    const gameData = await program1.account.game.fetch(gamePDA);
    console.log("\n📊 Final game state:");
    console.log("  Phase:", JSON.stringify(gameData.phase));
    console.log("  Winner:", JSON.stringify(gameData.winner));
    console.log("  Pot:", gameData.pot.toString());
  } catch (err) {
    console.error("  ❌ RAW Settlement FAILED:", err.message);
    if (err.logs) {
      console.error("\n  Program Logs:");
      err.logs.forEach(l => console.error("    " + l));
    }
  }
}

main().catch(console.error);
