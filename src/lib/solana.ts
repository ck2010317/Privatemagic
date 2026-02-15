import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as nacl from "tweetnacl";

// MagicBlock Constants
export const TEE_URL = "https://devnet-us.magicblock.app";
export const TEE_WS_URL = "wss://devnet-us.magicblock.app";
export const ER_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");
export const PERMISSION_PROGRAM_ID = new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
export const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

// Program ID (deployed on devnet)
export const PROGRAM_ID = new PublicKey("5c9wR99j8ouv3dyDXxnUEvijM2TGzg8VLHU15RTqwWFD");

// Seeds
export const GAME_SEED = Buffer.from("poker_game");
export const PLAYER_HAND_SEED = Buffer.from("player_hand");
export const BETTING_POOL_SEED = Buffer.from("betting_pool");
export const BET_SEED = Buffer.from("bet");

// Connection endpoints (Helius RPC for better reliability)
export const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58";
export const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

// Helper: convert a bigint (or number) to 8-byte little-endian Uint8Array
// Works in both Node.js and browser (no writeBigUInt64LE needed)
function toLEBytes(value: bigint | number): Buffer {
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

// Derive PDAs
export function getGamePDA(gameId: bigint): [PublicKey, number] {
  const buffer = toLEBytes(gameId);
  return PublicKey.findProgramAddressSync(
    [GAME_SEED, buffer],
    PROGRAM_ID
  );
}

export function getPlayerHandPDA(gameId: bigint, player: PublicKey): [PublicKey, number] {
  const buffer = toLEBytes(gameId);
  return PublicKey.findProgramAddressSync(
    [PLAYER_HAND_SEED, buffer, player.toBuffer()],
    PROGRAM_ID
  );
}

export function getBettingPoolPDA(gameId: bigint): [PublicKey, number] {
  const buffer = toLEBytes(gameId);
  return PublicKey.findProgramAddressSync(
    [BETTING_POOL_SEED, buffer],
    PROGRAM_ID
  );
}

export function getBetPDA(gameId: bigint, bettor: PublicKey): [PublicKey, number] {
  const buffer = toLEBytes(gameId);
  return PublicKey.findProgramAddressSync(
    [BET_SEED, buffer, bettor.toBuffer()],
    PROGRAM_ID
  );
}

// Auth token for TEE access
export async function getAuthToken(
  teeUrl: string,
  publicKey: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<{ token: string; expiresAt: number }> {
  // Request challenge
  const challengeRes = await fetch(`${teeUrl}/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey: publicKey.toBase58() }),
  });
  const { challenge } = await challengeRes.json();

  // Sign challenge
  const messageBytes = new TextEncoder().encode(challenge);
  const signature = await signMessage(messageBytes);

  // Submit signed challenge
  const tokenRes = await fetch(`${teeUrl}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: publicKey.toBase58(),
      signature: Buffer.from(signature).toString("base64"),
    }),
  });
  return tokenRes.json();
}

// Create TEE connection with auth token
export function createTeeConnection(authToken: string): Connection {
  return new Connection(`${TEE_URL}?token=${authToken}`, {
    wsEndpoint: `${TEE_WS_URL}?token=${authToken}`,
    commitment: "confirmed",
  });
}

// Airdrop SOL (devnet only)
export async function requestAirdrop(
  connection: Connection,
  publicKey: PublicKey,
  amount: number = 2
): Promise<string> {
  const sig = await connection.requestAirdrop(
    publicKey,
    amount * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// Format SOL from lamports
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

// Shorten public key for display
export function shortenPubkey(pubkey: string, chars: number = 4): string {
  return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}
