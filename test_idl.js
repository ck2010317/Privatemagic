const anchor = require("@coral-xyz/anchor");
const fs = require("fs");

const PROGRAM_ID = "ErDUq4vQDtAWzmksTD4vxoh3AQFijNFVYLTxJCQaqybq";
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";

async function main() {
  console.log("Loading IDL...");
  const idlPath = "/Users/shaan/PrivateMagic/privatepoker/src/lib/privatepoker_idl.json";
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  
  console.log("IDL loaded. Program ID:", idl.address);
  console.log("Instructions:", idl.instructions.map(i => i.name).join(", "));
  
  const connection = new anchor.web3.Connection(DEVNET_RPC, "confirmed");
  const keyPath = process.env.HOME + "/.config/solana/id.json";
  const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const keypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(keyData));
  
  // Use custom wallet signer instead of anchor.Wallet
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => { tx.sign(keypair); return tx; },
    signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(keypair)); return txs; },
  };
  
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  
  console.log("\nCreating program instance...");
  try {
    const program = new anchor.Program(idl, provider);
    console.log("✅ Program loaded successfully!");
    console.log("Program methods:", Object.keys(program.methods).slice(0, 10).join(", "));
  } catch (err) {
    console.error("❌ Failed to load program:", err.message);
    console.error(err);
  }
}

main().catch(console.error);
