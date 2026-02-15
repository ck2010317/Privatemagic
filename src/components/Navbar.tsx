"use client";

import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import WalletMultiButton from "@/components/WalletButton";
import { useGameStore } from "@/lib/gameStore";
import { shortenPubkey } from "@/lib/solana";

export default function Navbar() {
  const { publicKey, connected } = useWallet();
  const { phase, gameId, resetGame } = useGameStore();

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 px-4 py-3"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between bg-gray-900/80 backdrop-blur-xl rounded-2xl px-5 py-3 border border-gray-700/50">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <motion.span
            animate={{ rotateY: [0, 360] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="text-2xl"
          >
            🃏
          </motion.span>
          <div>
            <h1 className="text-white font-black text-lg leading-none">
              Private<span className="text-yellow-400">Poker</span>
            </h1>
            <span className="text-gray-500 text-[10px]">
              on MagicBlock TEE
            </span>
          </div>
        </div>

        {/* Center: Game Info */}
        {phase !== "lobby" && (
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-800/80 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-gray-300 text-xs">
                Game: {gameId.slice(-8)}
              </span>
            </div>
            <button
              onClick={resetGame}
              className="px-3 py-1 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-full transition-all"
            >
              Leave
            </button>
          </div>
        )}

        {/* Right: Wallet */}
        <div className="flex items-center gap-3">
          {connected && publicKey && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-800/80 rounded-full">
              <div className="w-2 h-2 bg-emerald-400 rounded-full" />
              <span className="text-gray-300 text-xs font-mono">
                {shortenPubkey(publicKey.toBase58())}
              </span>
            </div>
          )}
          <WalletMultiButton
            style={{
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              borderRadius: "12px",
              fontSize: "13px",
              height: "38px",
              padding: "0 16px",
              fontWeight: "bold",
            }}
          />
        </div>
      </div>
    </motion.nav>
  );
}
