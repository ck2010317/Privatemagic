"use client";

import { motion } from "framer-motion";
import { Player } from "@/lib/gameStore";
import { CardHand } from "./PlayingCard";
import { shortenPubkey, lamportsToSol } from "@/lib/solana";

interface PlayerSeatProps {
  player: Player | null;
  position: "top" | "bottom";
  isCurrentTurn: boolean;
  isMe: boolean;
  showCards: boolean;
  phase: string;
}

export default function PlayerSeat({
  player,
  position,
  isCurrentTurn,
  isMe,
  showCards,
  phase,
}: PlayerSeatProps) {
  if (!player) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`
          flex flex-col items-center gap-2 p-4
          ${position === "top" ? "" : ""}
        `}
      >
        <div className="w-16 h-16 rounded-full bg-gray-800/60 border-2 border-dashed border-gray-600 flex items-center justify-center">
          <span className="text-gray-500 text-2xl">?</span>
        </div>
        <div className="text-gray-500 text-sm font-medium">Waiting for player...</div>
      </motion.div>
    );
  }

  const canSeeCards = isMe || showCards || phase === "settled" || phase === "showdown";

  return (
    <motion.div
      initial={{ opacity: 0, y: position === "top" ? -30 : 30 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center gap-2 ${position === "top" ? "" : ""}`}
    >
      {/* Player Info Bar */}
      <div
        className={`
          flex items-center gap-3 px-4 py-2 rounded-2xl backdrop-blur-md transition-all duration-300
          ${isCurrentTurn
            ? "bg-yellow-500/20 border-2 border-yellow-400 shadow-lg shadow-yellow-400/20"
            : "bg-gray-900/70 border border-gray-700"
          }
          ${player.hasFolded ? "opacity-50" : ""}
        `}
      >
        {/* Avatar */}
        <motion.div
          animate={isCurrentTurn ? { scale: [1, 1.1, 1] } : {}}
          transition={{ repeat: Infinity, duration: 2 }}
          className={`
            w-12 h-12 rounded-full flex items-center justify-center text-2xl
            ${isCurrentTurn
              ? "bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg"
              : "bg-gradient-to-br from-gray-700 to-gray-800"
            }
          `}
        >
          {player.avatar}
        </motion.div>

        {/* Name & Balance */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">
              {player.name}
            </span>
            {isMe && (
              <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded-full">
                YOU
              </span>
            )}
            {player.hasFolded && (
              <span className="text-[10px] bg-red-500/30 text-red-400 px-1.5 py-0.5 rounded-full">
                FOLDED
              </span>
            )}
            {player.isAllIn && (
              <motion.span
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full font-bold"
              >
                ALL IN
              </motion.span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">
              {shortenPubkey(player.publicKey)}
            </span>
            <span className="text-yellow-400 text-xs font-bold">
              {lamportsToSol(player.balance).toFixed(3)} SOL
            </span>
          </div>
        </div>

        {/* Current Bet */}
        {player.currentBet > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="ml-2 px-3 py-1 bg-orange-500/20 rounded-lg border border-orange-500/40"
          >
            <span className="text-orange-400 font-bold text-sm">
              {(player.currentBet / 1e9).toFixed(2)} SOL
            </span>
          </motion.div>
        )}
      </div>

      {/* Cards */}
      <div className="mt-1">
        {player.hand.length > 0 && (
          <CardHand
            cards={player.hand}
            faceUp={canSeeCards}
            size="md"
            highlight={isCurrentTurn}
          />
        )}
      </div>

      {/* Hand Result */}
      {player.handResult && (phase === "showdown" || phase === "settled") && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-3 py-1 bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-full border border-purple-400/50"
        >
          <span className="text-purple-200 font-bold text-xs">
            {player.handResult.rank} — {player.handResult.description}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
