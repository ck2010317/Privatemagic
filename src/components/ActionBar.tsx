"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore, PlayerAction } from "@/lib/gameStore";

interface ActionBarProps {
  disabled: boolean;
}

export default function ActionBar({ disabled }: ActionBarProps) {
  const { phase, currentBet, buyIn, turn, myPlayerIndex, player1, player2, performAction } =
    useGameStore();
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);

  const isMyTurn = turn === myPlayerIndex;
  const currentPlayer = myPlayerIndex === 0 ? player1 : player2;
  const canCheck = currentPlayer && currentBet <= currentPlayer.currentBet;
  const callAmount = currentPlayer ? currentBet - currentPlayer.currentBet : 0;
  const minRaise = currentBet > 0 ? currentBet * 2 : Math.floor(buyIn * 0.05);
  const maxRaise = buyIn;

  if (phase === "lobby" || phase === "waiting" || phase === "showdown" || phase === "settled") {
    return null;
  }

  if (!isMyTurn || disabled || (myPlayerIndex as number) === -1) {
    return (
      <div className="flex items-center justify-center py-4">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="px-6 py-3 bg-gray-800/50 rounded-2xl border border-gray-700"
        >
          <span className="text-gray-400 text-sm">
            {myPlayerIndex === -1 ? "👁️ Spectating..." : "⏳ Waiting for opponent..."}
          </span>
        </motion.div>
      </div>
    );
  }

  const handleAction = (action: PlayerAction, amount?: number) => {
    console.log("🎯 ACTION CLICKED:", action, amount);
    performAction(action, amount);
    setShowRaiseSlider(false);
    setRaiseAmount(0);
  };

  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="w-full"
    >
      {/* Raise Slider */}
      <AnimatePresence>
        {showRaiseSlider && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="bg-gray-800/80 backdrop-blur-md rounded-2xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-sm">Raise Amount</span>
                <span className="text-yellow-400 font-bold text-lg">
                  {(raiseAmount / 1e9).toFixed(3)} SOL
                </span>
              </div>
              <input
                type="range"
                min={minRaise}
                max={maxRaise}
                value={raiseAmount || minRaise}
                onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
              />
              <div className="flex justify-between mt-2">
                <button
                  onClick={() => setRaiseAmount(minRaise)}
                  className="text-xs px-3 py-1 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 transition-colors"
                >
                  Min
                </button>
                <button
                  onClick={() => setRaiseAmount(Math.floor(buyIn * 0.25))}
                  className="text-xs px-3 py-1 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 transition-colors"
                >
                  1/4 Pot
                </button>
                <button
                  onClick={() => setRaiseAmount(Math.floor(buyIn * 0.5))}
                  className="text-xs px-3 py-1 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 transition-colors"
                >
                  1/2 Pot
                </button>
                <button
                  onClick={() => setRaiseAmount(buyIn)}
                  className="text-xs px-3 py-1 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 transition-colors"
                >
                  Max
                </button>
              </div>
              <button
                onClick={() => handleAction("raise", raiseAmount || minRaise)}
                className="w-full mt-3 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-xl hover:from-yellow-400 hover:to-orange-400 transition-all"
              >
                Raise to {((raiseAmount || minRaise) / 1e9).toFixed(3)} SOL
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 justify-center">
        {/* Fold */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction("fold")}
          className="px-6 py-3 bg-gradient-to-br from-red-600 to-red-800 text-white font-bold rounded-2xl
            hover:from-red-500 hover:to-red-700 transition-all shadow-lg shadow-red-900/30
            border border-red-500/30"
        >
          <div className="flex flex-col items-center">
            <span className="text-lg">🏳️</span>
            <span className="text-xs">Fold</span>
          </div>
        </motion.button>

        {/* Check / Call */}
        {canCheck ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleAction("check")}
            className="px-8 py-3 bg-gradient-to-br from-blue-600 to-blue-800 text-white font-bold rounded-2xl
              hover:from-blue-500 hover:to-blue-700 transition-all shadow-lg shadow-blue-900/30
              border border-blue-500/30"
          >
            <div className="flex flex-col items-center">
              <span className="text-lg">✅</span>
              <span className="text-xs">Check</span>
            </div>
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleAction("call")}
            className="px-8 py-3 bg-gradient-to-br from-green-600 to-emerald-800 text-white font-bold rounded-2xl
              hover:from-green-500 hover:to-emerald-700 transition-all shadow-lg shadow-green-900/30
              border border-green-500/30"
          >
            <div className="flex flex-col items-center">
              <span className="text-lg">📞</span>
              <span className="text-xs">Call {(callAmount / 1e9).toFixed(3)}</span>
            </div>
          </motion.button>
        )}

        {/* Raise */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowRaiseSlider(!showRaiseSlider)}
          className={`px-6 py-3 font-bold rounded-2xl transition-all shadow-lg border
            ${showRaiseSlider
              ? "bg-gradient-to-br from-yellow-500 to-orange-600 text-black border-yellow-400/50 shadow-yellow-900/30"
              : "bg-gradient-to-br from-yellow-600 to-orange-800 text-white border-yellow-500/30 shadow-yellow-900/30 hover:from-yellow-500 hover:to-orange-700"
            }
          `}
        >
          <div className="flex flex-col items-center">
            <span className="text-lg">⬆️</span>
            <span className="text-xs">Raise</span>
          </div>
        </motion.button>

        {/* All In */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction("allin")}
          className="px-6 py-3 bg-gradient-to-br from-purple-600 to-pink-800 text-white font-bold rounded-2xl
            hover:from-purple-500 hover:to-pink-700 transition-all shadow-lg shadow-purple-900/30
            border border-purple-500/30"
        >
          <div className="flex flex-col items-center">
            <span className="text-lg">🔥</span>
            <span className="text-xs">All In</span>
          </div>
        </motion.button>
      </div>
    </motion.div>
  );
}
