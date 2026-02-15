"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/gameStore";
import { getExplorerUrl, getGameExplorerUrl } from "@/lib/onChainGame";
import { lamportsToSol } from "@/lib/solana";

export default function TransactionFeed() {
  const { txHistory, txPending, txError, isOnChain, onChainGameId, gamePDA } = useGameStore();

  if (!isOnChain && txHistory.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-3xl p-5 w-full"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">⛓️</span>
        <h3 className="text-white font-bold text-sm">On-Chain Activity</h3>
        {isOnChain && (
          <div className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 rounded-full">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-[10px] font-bold">LIVE</span>
          </div>
        )}
      </div>

      {/* Game PDA Link */}
      {onChainGameId && (
        <a
          href={getGameExplorerUrl(onChainGameId)}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-3 p-2 bg-purple-500/10 rounded-xl border border-purple-500/20 hover:border-purple-400/40 transition-all"
        >
          <div className="flex items-center gap-2">
            <span className="text-purple-400 text-xs">🔗 Game PDA</span>
            <span className="text-purple-300 text-[10px] font-mono truncate">
              {gamePDA?.slice(0, 12)}...{gamePDA?.slice(-8)}
            </span>
          </div>
        </a>
      )}

      {/* Pending Indicator */}
      {txPending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-3 p-2 bg-yellow-500/10 rounded-xl border border-yellow-500/20 flex items-center gap-2"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="text-yellow-400 text-sm"
          >
            ⏳
          </motion.div>
          <span className="text-yellow-400 text-xs font-medium">Transaction pending...</span>
        </motion.div>
      )}

      {/* Error */}
      {txError && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-3 p-2 bg-red-500/10 rounded-xl border border-red-500/20"
        >
          <span className="text-red-400 text-xs">{txError}</span>
        </motion.div>
      )}

      {/* Transaction History */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        <AnimatePresence>
          {txHistory.slice().reverse().map((tx, i) => (
            <motion.a
              key={tx.signature}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              href={getExplorerUrl(tx.signature)}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2 bg-gray-800/50 rounded-xl hover:bg-gray-800/80 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {tx.type === "create" ? "🎮" :
                     tx.type === "join" ? "🤝" :
                     tx.type === "deal" ? "🃏" :
                     tx.type === "action" ? "🎯" :
                     tx.type === "advance" ? "⏭️" :
                     tx.type === "settle" ? "🏆" : "📝"}
                  </span>
                  <div>
                    <div className="text-gray-300 text-xs font-medium">{tx.description}</div>
                    <div className="text-gray-600 text-[10px] font-mono group-hover:text-blue-400 transition-colors">
                      {tx.signature.slice(0, 16)}...
                    </div>
                  </div>
                </div>
                {tx.solAmount && tx.solAmount > 0 && (
                  <span className="text-yellow-400 text-xs font-bold">
                    {lamportsToSol(tx.solAmount).toFixed(3)} SOL
                  </span>
                )}
              </div>
            </motion.a>
          ))}
        </AnimatePresence>

        {txHistory.length === 0 && (
          <div className="text-center py-4">
            <span className="text-gray-600 text-xs">No transactions yet</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-gray-800 flex items-center justify-between">
        <span className="text-gray-600 text-[10px]">{txHistory.length} transactions</span>
        <span className="text-gray-600 text-[10px]">Solana Devnet</span>
      </div>
    </motion.div>
  );
}
