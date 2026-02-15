"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/lib/gameStore";

interface GameLobbyProps {
  walletAddress: string;
  onCreateGame: (buyIn: number, name: string) => void;
  onJoinGame: (name: string) => void;
  onCreateMultiplayer: (buyIn: number, name: string) => void;
  onJoinMultiplayer: (roomCode: string, name: string) => void;
}

export default function GameLobby({
  walletAddress,
  onCreateGame,
  onJoinGame,
  onCreateMultiplayer,
  onJoinMultiplayer,
}: GameLobbyProps) {
  const { phase, gameId, mode } = useGameStore();
  const [playerName, setPlayerName] = useState("");
  const [buyIn, setBuyIn] = useState(1);
  const [activeTab, setActiveTab] = useState<"multiplayer" | "ai">("multiplayer");
  const [roomCode, setRoomCode] = useState("");
  const [multiAction, setMultiAction] = useState<"create" | "join">("create");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");

  // Waiting room state
  if (phase === "waiting" && mode === "multiplayer" && gameId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg mx-auto"
      >
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
            className="text-7xl mb-4"
          >
            ⏳
          </motion.div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 mb-2">
            Waiting for Opponent
          </h1>
          <p className="text-gray-400 text-sm">
            Share the room code below with your opponent
          </p>
        </div>

        <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-3xl overflow-hidden p-8">
          {/* Room Code Display */}
          <div className="text-center mb-6">
            <p className="text-gray-500 text-xs font-medium mb-2 uppercase tracking-wider">Room Code</p>
            <div
              className="inline-flex items-center gap-3 px-8 py-4 bg-gray-800/80 rounded-2xl border-2 border-yellow-500/40 cursor-pointer hover:border-yellow-400/60 transition-all"
              onClick={() => navigator.clipboard.writeText(gameId)}
            >
              <span className="text-yellow-400 text-4xl font-black tracking-[0.3em] font-mono">
                {gameId}
              </span>
              <span className="text-gray-500 text-lg">📋</span>
            </div>
            <p className="text-gray-600 text-xs mt-2">Click to copy</p>
          </div>

          {/* Animated dots */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
                className="w-3 h-3 bg-yellow-400 rounded-full"
              />
            ))}
          </div>

          <p className="text-center text-gray-500 text-sm">
            Game will start automatically when opponent joins
          </p>

          <button
            onClick={() => {
              useGameStore.setState({ phase: "lobby", gameId: "", mode: "ai" });
              import("@/lib/multiplayer").then(({ disconnect }) => disconnect());
            }}
            className="w-full mt-6 py-3 bg-gray-800 text-gray-400 font-medium rounded-xl hover:bg-gray-700 hover:text-gray-300 transition-all"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    );
  }

  if (phase !== "lobby") return null;

  const handleCreateMultiplayer = async () => {
    if (!playerName || buyIn <= 0) return;
    setIsConnecting(true);
    setError("");
    try {
      await onCreateMultiplayer(buyIn, playerName);
    } catch {
      setError("Failed to connect to game server. Try again.");
    }
    setIsConnecting(false);
  };

  const handleJoinMultiplayer = async () => {
    if (!playerName || !roomCode) return;
    setIsConnecting(true);
    setError("");
    try {
      await onJoinMultiplayer(roomCode.toUpperCase(), playerName);
    } catch {
      setError("Failed to join game. Check the room code.");
    }
    setIsConnecting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-lg mx-auto"
    >
      {/* Hero */}
      <div className="text-center mb-8">
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          className="text-7xl mb-4"
        >
          🃏
        </motion.div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-400 to-red-500 mb-2">
          Private Poker
        </h1>
        <p className="text-gray-400 text-sm">
          Encrypted Texas Hold&apos;em on Solana • Powered by MagicBlock TEE
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-emerald-400 text-xs font-medium">Private Ephemeral Rollup Active</span>
        </div>
      </div>

      {/* Card */}
      <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-3xl overflow-hidden">
        {/* Mode Tabs */}
        <div className="flex border-b border-gray-700/50">
          <button
            onClick={() => setActiveTab("multiplayer")}
            className={`flex-1 py-3 text-sm font-bold transition-all ${
              activeTab === "multiplayer"
                ? "text-yellow-400 border-b-2 border-yellow-400 bg-yellow-400/5"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            🤝 Multiplayer
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={`flex-1 py-3 text-sm font-bold transition-all ${
              activeTab === "ai"
                ? "text-yellow-400 border-b-2 border-yellow-400 bg-yellow-400/5"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            🤖 vs AI
          </button>
        </div>

        <div className="p-6">
          {/* Player Name */}
          <div className="mb-5">
            <label className="text-gray-400 text-xs font-medium mb-2 block">
              Your Display Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name..."
              maxLength={20}
              className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-white
                placeholder-gray-600 focus:outline-none focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/20
                transition-all text-sm"
            />
          </div>

          {activeTab === "multiplayer" ? (
            <>
              {/* Multiplayer sub-tabs */}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setMultiAction("create")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    multiAction === "create"
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  🎮 Create Room
                </button>
                <button
                  onClick={() => setMultiAction("join")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    multiAction === "join"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  🚪 Join Room
                </button>
              </div>

              {multiAction === "create" ? (
                <>
                  {/* Buy-in Amount */}
                  <div className="mb-5">
                    <label className="text-gray-400 text-xs font-medium mb-2 block">
                      Buy-in Amount (SOL)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={buyIn}
                        onChange={(e) => setBuyIn(parseFloat(e.target.value) || 0)}
                        min={0.01}
                        step={0.1}
                        className="flex-1 bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-white
                          focus:outline-none focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/20
                          transition-all text-sm"
                      />
                      <span className="text-gray-400 text-sm font-medium">SOL</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {[0.1, 0.5, 1, 2, 5].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setBuyIn(amt)}
                          className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all ${
                            buyIn === amt
                              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                              : "bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700"
                          }`}
                        >
                          {amt} SOL
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Info box */}
                  <div className="mb-5 p-3 bg-blue-500/5 rounded-xl border border-blue-500/20">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-400 text-sm">⛓️</span>
                      <div>
                        <p className="text-blue-300 text-xs font-medium">
                          Real SOL On-Chain Game
                        </p>
                        <p className="text-blue-400/60 text-[11px] mt-0.5">
                          Your buy-in SOL is transferred to the game PDA on Solana.
                          Winner receives the full pot. All transactions are verifiable on-chain.
                        </p>
                      </div>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCreateMultiplayer}
                    disabled={!playerName || buyIn <= 0 || isConnecting}
                    className="w-full py-4 bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-black font-black
                      rounded-2xl text-lg hover:from-yellow-400 hover:via-orange-400 hover:to-red-400 transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-orange-500/20"
                  >
                    {isConnecting ? "Creating on Solana..." : `⛓️ Create Room — ${buyIn} SOL Stake`}
                  </motion.button>
                </>
              ) : (
                <>
                  {/* Room Code Input */}
                  <div className="mb-5">
                    <label className="text-gray-400 text-xs font-medium mb-2 block">
                      Room Code
                    </label>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="Enter 5-letter room code..."
                      maxLength={5}
                      className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-4 text-white text-center
                        text-2xl font-mono tracking-[0.4em] placeholder:text-sm placeholder:tracking-normal
                        focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20
                        transition-all uppercase"
                    />
                  </div>

                  {/* Info */}
                  <div className="mb-5 p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-400 text-sm">🔗</span>
                      <div>
                        <p className="text-emerald-300 text-xs font-medium">
                          Join an existing room
                        </p>
                        <p className="text-emerald-400/60 text-[11px] mt-0.5">
                          Enter the room code shared by the host. Buy-in matches the creator&apos;s amount.
                        </p>
                      </div>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleJoinMultiplayer}
                    disabled={!playerName || roomCode.length < 3 || isConnecting}
                    className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-black
                      rounded-2xl text-lg hover:from-emerald-400 hover:to-green-500 transition-all
                      disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-green-500/20"
                  >
                    {isConnecting ? "Joining..." : "Join Room"}
                  </motion.button>
                </>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-3 p-3 bg-red-500/10 rounded-xl border border-red-500/30 text-red-400 text-xs text-center"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <>
              {/* AI Mode */}
              <div className="mb-5">
                <label className="text-gray-400 text-xs font-medium mb-2 block">
                  Buy-in Amount (SOL)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={buyIn}
                    onChange={(e) => setBuyIn(parseFloat(e.target.value) || 0)}
                    min={0.01}
                    step={0.1}
                    className="flex-1 bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-white
                      focus:outline-none focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/20
                      transition-all text-sm"
                  />
                  <span className="text-gray-400 text-sm font-medium">SOL</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[0.1, 0.5, 1, 2, 5].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setBuyIn(amt)}
                      className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-all ${
                        buyIn === amt
                          ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                          : "bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {amt} SOL
                    </button>
                  ))}
                </div>
              </div>

              {/* Info box */}
              <div className="mb-5 p-3 bg-purple-500/5 rounded-xl border border-purple-500/20">
                <div className="flex items-start gap-2">
                  <span className="text-purple-400 text-sm">🤖</span>
                  <div>
                    <p className="text-purple-300 text-xs font-medium">
                      AI Opponent — Real SOL Staked
                    </p>
                    <p className="text-purple-400/60 text-[11px] mt-0.5">
                      Play against AI with real SOL on-chain. Your buy-in is staked
                      to the game PDA. Win to earn the pot!
                    </p>
                  </div>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onCreateGame(buyIn, playerName || "Anon")}
                disabled={!playerName || buyIn <= 0}
                className="w-full py-4 bg-gradient-to-r from-purple-500 via-violet-500 to-pink-500 text-white font-black
                  rounded-2xl text-lg hover:from-purple-400 hover:via-violet-400 hover:to-pink-400 transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
              >
                ⛓️ Play vs AI — {buyIn} SOL Stake
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-3 mt-6">
        {[
          { emoji: "🔐", title: "Private", desc: "TEE Encrypted" },
          { emoji: "⚡", title: "Fast", desc: "<50ms Latency" },
          { emoji: "🎰", title: "Betting", desc: "Live Spectator Bets" },
        ].map((f) => (
          <div
            key={f.title}
            className="flex flex-col items-center gap-1 p-3 bg-gray-900/50 rounded-xl border border-gray-800"
          >
            <span className="text-2xl">{f.emoji}</span>
            <span className="text-white text-xs font-bold">{f.title}</span>
            <span className="text-gray-500 text-[10px]">{f.desc}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
