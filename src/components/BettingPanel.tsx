"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/gameStore";

interface BettingPanelProps {
  walletAddress: string;
  walletName: string;
}

export default function BettingPanel({ walletAddress, walletName }: BettingPanelProps) {
  const { phase, player1, player2, bettingPool, placeBet } = useGameStore();
  const [betAmount, setBetAmount] = useState(0.1);
  const [selectedPlayer, setSelectedPlayer] = useState<1 | 2>(1);

  const totalPool = bettingPool.totalPoolPlayer1 + bettingPool.totalPoolPlayer2;
  const oddsPlayer1 =
    bettingPool.totalPoolPlayer1 > 0
      ? (totalPool / bettingPool.totalPoolPlayer1).toFixed(2)
      : "—";
  const oddsPlayer2 =
    bettingPool.totalPoolPlayer2 > 0
      ? (totalPool / bettingPool.totalPoolPlayer2).toFixed(2)
      : "—";

  const handlePlaceBet = () => {
    if (betAmount <= 0 || bettingPool.isSettled) return;
    const lamports = Math.floor(betAmount * 1e9);
    placeBet(walletAddress, walletName, selectedPlayer, lamports);
    setBetAmount(0.1);
  };

  const isBettingOpen = phase !== "lobby" && phase !== "settled" && !bettingPool.isSettled;

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-3xl p-5 w-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎰</span>
          <h3 className="text-white font-bold text-lg">Betting Pool</h3>
        </div>
        <div className={`px-2 py-1 rounded-full text-xs font-bold ${isBettingOpen ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
          {isBettingOpen ? "OPEN" : "CLOSED"}
        </div>
      </div>

      {/* Pool Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <motion.div
          whileHover={{ scale: 1.02 }}
          onClick={() => setSelectedPlayer(1)}
          className={`p-3 rounded-2xl cursor-pointer transition-all ${
            selectedPlayer === 1
              ? "bg-blue-500/20 border-2 border-blue-400"
              : "bg-gray-800/50 border-2 border-transparent hover:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{player1?.avatar || "🎭"}</span>
            <span className="text-white text-sm font-medium truncate">
              {player1?.name || "Player 1"}
            </span>
          </div>
          <div className="text-blue-400 font-bold text-lg">
            {(bettingPool.totalPoolPlayer1 / 1e9).toFixed(2)} SOL
          </div>
          <div className="text-gray-500 text-xs">Odds: {oddsPlayer1}x</div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          onClick={() => setSelectedPlayer(2)}
          className={`p-3 rounded-2xl cursor-pointer transition-all ${
            selectedPlayer === 2
              ? "bg-orange-500/20 border-2 border-orange-400"
              : "bg-gray-800/50 border-2 border-transparent hover:border-gray-600"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{player2?.avatar || "🎭"}</span>
            <span className="text-white text-sm font-medium truncate">
              {player2?.name || "Player 2"}
            </span>
          </div>
          <div className="text-orange-400 font-bold text-lg">
            {(bettingPool.totalPoolPlayer2 / 1e9).toFixed(2)} SOL
          </div>
          <div className="text-gray-500 text-xs">Odds: {oddsPlayer2}x</div>
        </motion.div>
      </div>

      {/* Total Pool */}
      <div className="bg-gray-800/50 rounded-xl p-3 mb-4 text-center">
        <span className="text-gray-400 text-xs">Total Pool</span>
        <div className="text-white font-bold text-2xl">
          {(totalPool / 1e9).toFixed(2)} <span className="text-sm text-gray-400">SOL</span>
        </div>
        <span className="text-gray-500 text-xs">{bettingPool.bets.length} bets placed</span>
      </div>

      {/* Place Bet */}
      {isBettingOpen && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-gray-400 text-xs mb-1 block">Bet Amount (SOL)</label>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0)}
                min={0.01}
                step={0.01}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm
                  focus:outline-none focus:border-yellow-400 transition-colors"
              />
            </div>
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2">
            {[0.05, 0.1, 0.25, 0.5, 1].map((amt) => (
              <button
                key={amt}
                onClick={() => setBetAmount(amt)}
                className={`flex-1 py-1 text-xs rounded-lg transition-colors ${
                  betAmount === amt
                    ? "bg-yellow-500/30 text-yellow-300 border border-yellow-500/50"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {amt}
              </button>
            ))}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePlaceBet}
            disabled={betAmount <= 0}
            className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-2xl
              hover:from-yellow-400 hover:to-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed
              shadow-lg shadow-orange-500/20"
          >
            Bet {betAmount} SOL on {selectedPlayer === 1 ? player1?.name || "Player 1" : player2?.name || "Player 2"}
          </motion.button>
        </div>
      )}

      {/* Settlement Result */}
      {bettingPool.isSettled && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mt-4 p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl border border-green-400/30 text-center"
        >
          <div className="text-green-400 font-bold text-lg">🏆 Pool Settled</div>
          <div className="text-gray-300 text-sm mt-1">
            {bettingPool.winningPlayer === 1 ? player1?.name : player2?.name} backers win!
          </div>
        </motion.div>
      )}

      {/* Recent Bets */}
      <div className="mt-4">
        <h4 className="text-gray-400 text-xs font-medium mb-2">Recent Bets</h4>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          <AnimatePresence>
            {bettingPool.bets.slice(-10).reverse().map((bet) => (
              <motion.div
                key={bet.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="flex items-center justify-between py-1.5 px-2 bg-gray-800/40 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${bet.betOnPlayer === 1 ? "bg-blue-400" : "bg-orange-400"}`} />
                  <span className="text-gray-300 text-xs truncate max-w-24">
                    {bet.bettorName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">→</span>
                  <span className={`text-xs font-medium ${bet.betOnPlayer === 1 ? "text-blue-400" : "text-orange-400"}`}>
                    {(bet.amount / 1e9).toFixed(2)} SOL
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {bettingPool.bets.length === 0 && (
            <div className="text-gray-600 text-xs text-center py-4">
              No bets yet. Be the first! 🎲
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
