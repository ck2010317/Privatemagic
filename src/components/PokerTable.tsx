"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/gameStore";
import PlayerSeat from "./PlayerSeat";
import CommunityCards from "./CommunityCards";
import ActionBar from "./ActionBar";

export default function PokerTable() {
  const {
    phase,
    pot,
    communityCards,
    player1,
    player2,
    turn,
    myPlayerIndex,
    showCards,
    lastAction,
    winner,
    winnerHandResult,
    isAnimating,
    aiMessage,
  } = useGameStore();

  const phaseLabels: Record<string, string> = {
    lobby: "Lobby",
    waiting: "Waiting for Player...",
    preflop: "Pre-Flop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    showdown: "Showdown",
    settled: "Game Over",
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Outer glow */}
      <div className="absolute -inset-4 bg-gradient-to-br from-emerald-900/20 via-transparent to-emerald-900/20 rounded-[3rem] blur-xl" />

      {/* Table */}
      <div
        className="relative rounded-[2.5rem] p-1"
        style={{
          background: "linear-gradient(135deg, #5c3d1e 0%, #8B6914 30%, #5c3d1e 70%, #3d2a11 100%)",
        }}
      >
        {/* Inner felt */}
        <div
          className="relative rounded-[2.2rem] overflow-hidden"
          style={{
            background: "radial-gradient(ellipse at center, #1a6b3c 0%, #145a30 40%, #0d4a25 70%, #0a3b1e 100%)",
            minHeight: "520px",
          }}
        >
          {/* Felt texture overlay */}
          <div
            className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M5 0h1L0 6V5zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />

          {/* Inner border line */}
          <div className="absolute inset-6 border-2 border-yellow-700/20 rounded-[2rem] pointer-events-none" />

          {/* Game Phase Badge */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <motion.div
              key={phase}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="px-4 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-yellow-500/30"
            >
              <span className="text-yellow-400 text-xs font-bold tracking-wider uppercase">
                {phaseLabels[phase]}
              </span>
            </motion.div>
          </div>

          {/* Privacy Badge */}
          <div className="absolute top-4 right-6 z-10">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 backdrop-blur-md rounded-full border border-emerald-500/30">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-300 text-[10px] font-medium">TEE Encrypted</span>
            </div>
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-between h-full min-h-[520px] py-12 px-6">
            {/* Opponent (top) */}
            <div className="relative">
              <PlayerSeat
                player={myPlayerIndex === 0 ? player2 : player1}
                position="top"
                isCurrentTurn={
                  myPlayerIndex === 0 ? turn === 1 : turn === 0
                }
                isMe={false}
                showCards={showCards}
                phase={phase}
              />
              {/* AI Message Bubble */}
              <AnimatePresence>
                {aiMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap
                      px-3 py-1 bg-gray-800/90 backdrop-blur-sm rounded-lg border border-gray-600
                      text-gray-200 text-xs font-medium shadow-lg z-20"
                  >
                    {aiMessage}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Center Area: Community Cards + Pot */}
            <div className="flex flex-col items-center gap-4 my-4">
              {/* Pot */}
              <AnimatePresence>
                {pot > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-2 px-5 py-2 bg-black/40 backdrop-blur-md rounded-2xl border border-yellow-500/30"
                  >
                    <span className="text-2xl">💰</span>
                    <div className="flex flex-col">
                      <span className="text-yellow-400 font-bold text-xl">
                        {(pot / 1e9).toFixed(2)} SOL
                      </span>
                      <span className="text-yellow-600 text-[10px]">
                        POT
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Community Cards */}
              <CommunityCards cards={communityCards} phase={phase} />

              {/* Last Action */}
              <AnimatePresence>
                {lastAction && (
                  <motion.div
                    key={lastAction}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-gray-300 text-sm bg-black/30 px-4 py-1 rounded-full"
                  >
                    {lastAction}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Me (bottom) */}
            <PlayerSeat
              player={myPlayerIndex === 0 ? player1 : player2}
              position="bottom"
              isCurrentTurn={turn === myPlayerIndex}
              isMe={true}
              showCards={true}
              phase={phase}
            />
          </div>

          {/* Winner Overlay */}
          <AnimatePresence>
            {(phase === "settled" || phase === "showdown") && winner && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex items-center justify-center"
              >
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="relative z-30 flex flex-col items-center gap-4 p-8 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-xl rounded-3xl border-2 border-yellow-400/50 shadow-2xl shadow-yellow-500/20"
                >
                  <motion.span
                    animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="text-6xl"
                  >
                    🏆
                  </motion.span>
                  <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">
                    {winner === player1?.publicKey
                      ? player1?.name
                      : player2?.name}{" "}
                    Wins!
                  </h2>
                  <div className="text-yellow-400 font-bold text-xl">
                    {(pot / 1e9).toFixed(2)} SOL 💰
                  </div>
                  {winnerHandResult && (
                    <div className="text-gray-300 text-sm">
                      {winnerHandResult.rank} — {winnerHandResult.description}
                    </div>
                  )}

                  {/* Confetti particles */}
                  {[...Array(12)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{
                        x: 0,
                        y: 0,
                        opacity: 1,
                        scale: 1,
                      }}
                      animate={{
                        x: (Math.random() - 0.5) * 300,
                        y: (Math.random() - 0.5) * 300,
                        opacity: 0,
                        scale: 0,
                        rotate: Math.random() * 720,
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.15,
                      }}
                      className="absolute text-2xl pointer-events-none"
                    >
                      {["✨", "🌟", "⭐", "💎", "🎉", "🎊"][i % 6]}
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Action Bar (below table) */}
      <div className="mt-4 relative z-50">
        <ActionBar disabled={isAnimating} />
      </div>
    </div>
  );
}
