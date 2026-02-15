"use client";

import { motion } from "framer-motion";
import { useGameStore } from "@/lib/gameStore";
import { lamportsToSol } from "@/lib/solana";

export default function GameInfo() {
  const { phase, pot, buyIn, player1, player2, bettingPool, isOnChain, onChainGameId, gamePDA, txHistory } = useGameStore();

  if (phase === "lobby") return null;

  const totalBettingPool = bettingPool.totalPoolPlayer1 + bettingPool.totalPoolPlayer2;

  return (
    <motion.div
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-3xl p-5 w-full"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">📊</span>
        <h3 className="text-white font-bold text-lg">Game Info</h3>
      </div>

      <div className="space-y-3">
        {/* On-Chain Status */}
        {isOnChain && (
          <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-400 text-sm font-bold">⛓️ On-Chain</span>
            </div>
            <span className="text-emerald-300 text-xs">{txHistory.length} TXs</span>
          </div>
        )}

        {/* Buy-in */}
        <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-xl">
          <span className="text-gray-400 text-sm">Buy-in</span>
          <span className="text-white font-bold">{lamportsToSol(buyIn).toFixed(2)} SOL</span>
        </div>

        {/* Pot */}
        <div className="flex items-center justify-between p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
          <span className="text-yellow-400 text-sm">💰 Pot</span>
          <span className="text-yellow-400 font-bold text-lg">{lamportsToSol(pot).toFixed(2)} SOL</span>
        </div>

        {/* Game ID */}
        {onChainGameId && (
          <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <span className="text-blue-400 text-sm">🆔 Game ID</span>
            <span className="text-blue-300 font-mono text-xs">{onChainGameId}</span>
          </div>
        )}

        {/* Betting Pool */}
        <div className="flex items-center justify-between p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
          <span className="text-purple-400 text-sm">🎰 Betting Pool</span>
          <span className="text-purple-400 font-bold">{lamportsToSol(totalBettingPool).toFixed(2)} SOL</span>
        </div>

        {/* Players */}
        <div className="space-y-2 mt-4">
          <h4 className="text-gray-400 text-xs font-medium">Players</h4>
          
          {player1 && (
            <div className="flex items-center gap-3 p-2 bg-gray-800/40 rounded-xl">
              <span className="text-lg">{player1.avatar}</span>
              <div className="flex-1">
                <div className="text-white text-sm font-medium">{player1.name}</div>
                <div className="text-gray-500 text-xs font-mono">{player1.publicKey.slice(0, 8)}...</div>
              </div>
              <div className="text-right">
                <div className="text-yellow-400 text-xs font-bold">{lamportsToSol(player1.balance).toFixed(3)} SOL</div>
                {player1.hasFolded ? (
                  <span className="text-red-400 text-xs">Folded</span>
                ) : player1.isAllIn ? (
                  <span className="text-purple-400 text-xs font-bold">ALL IN</span>
                ) : (
                  <span className="text-gray-400 text-xs">Active</span>
                )}
              </div>
            </div>
          )}

          {player2 ? (
            <div className="flex items-center gap-3 p-2 bg-gray-800/40 rounded-xl">
              <span className="text-lg">{player2.avatar}</span>
              <div className="flex-1">
                <div className="text-white text-sm font-medium">{player2.name}</div>
                <div className="text-gray-500 text-xs font-mono">{player2.publicKey.slice(0, 8)}...</div>
              </div>
              <div className="text-right">
                <div className="text-yellow-400 text-xs font-bold">{lamportsToSol(player2.balance).toFixed(3)} SOL</div>
                {player2.hasFolded ? (
                  <span className="text-red-400 text-xs">Folded</span>
                ) : player2.isAllIn ? (
                  <span className="text-purple-400 text-xs font-bold">ALL IN</span>
                ) : (
                  <span className="text-gray-400 text-xs">Active</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-3 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
              <span className="text-gray-600 text-sm">Waiting for opponent...</span>
            </div>
          )}
        </div>

        {/* Privacy Status */}
        <div className="mt-4 p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-300 text-xs font-medium">Privacy Status</span>
          </div>
          <div className="space-y-1 ml-4">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-[10px]">✓</span>
              <span className="text-gray-400 text-[10px]">Cards encrypted in TEE</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-[10px]">✓</span>
              <span className="text-gray-400 text-[10px]">Intel TDX attestation</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] ${isOnChain ? "text-emerald-400" : "text-gray-600"}`}>
                {isOnChain ? "✓" : "○"}
              </span>
              <span className="text-gray-400 text-[10px]">MagicBlock Ephemeral Rollup</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] ${isOnChain ? "text-emerald-400" : "text-gray-600"}`}>
                {isOnChain ? "✓" : "○"}
              </span>
              <span className="text-gray-400 text-[10px]">
                {isOnChain ? `SOL staked on-chain (${lamportsToSol(buyIn).toFixed(2)} SOL each)` : "Settlement on Solana L1"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
