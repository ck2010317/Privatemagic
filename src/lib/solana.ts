import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as nacl from "tweetnacl";

// MagicBlock Constants
export const TEE_URL = "https://tee.magicblock.app";
export const TEE_WS_URL = "wss://tee.magicblock.app";
export const ER_VALIDATOR = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");
export const PERMISSION_PROGRAM_ID = new PublicKey("ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1");
export const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

// Program ID (deployed on devnet)
export const PROGRAM_ID = new PublicKey("ErDUq4vQDtAWzmksTD4vxoh3AQFijNFVYLTxJCQaqybq");

// Seeds
export const GAME_SEED = Buffer.from("poker_game");
export const PLAYER_HAND_SEED = Buffer.from("player_hand");
export const BETTING_POOL_SEED = Buffer.from("betting_pool");
export const BET_SEED = Buffer.from("bet");

// Connection endpoints
export const DEVNET_RPC = "https://api.devnet.solana.com";
export const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

// Derive PDAs
export function getGamePDA(gameId: bigint): [PublicKey, number] {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(gameId);
  return PublicKey.findProgramAddressSync(
    [GAME_SEED, buffer],
    PROGRAM_ID
  );
}

export function getPlayerHandPDA(gameId: bigint, player: PublicKey): [PublicKey, number] {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(gameId);
  return PublicKey.findProgramAddressSync(
    [PLAYER_HAND_SEED, buffer, player.toBuffer()],
    PROGRAM_ID
  );
}

export function getBettingPoolPDA(gameId: bigint): [PublicKey, number] {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(gameId);
  return PublicKey.findProgramAddressSync(
    [BETTING_POOL_SEED, buffer],
    PROGRAM_ID
  );
}

export function getBetPDA(gameId: bigint, bettor: PublicKey): [PublicKey, number] {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(gameId);
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
