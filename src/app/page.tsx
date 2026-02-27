"use client";

import { useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import WalletMultiButton from "@/components/WalletButton";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/gameStore";
import { solToLamports, lamportsToSol } from "@/lib/solana";
import { createMultiplayerGame, joinMultiplayerGame, disconnect, sendDelegationComplete, sendOnChainJoinComplete } from "@/lib/multiplayer";
import {
  createOnChainGame,
  joinOnChainGame,
  delegateToMagicBlock,
  playerActionOnChain,
  advancePhaseOnChain,
  revealWinnerOnChain,
  settlePotOnChain,
  settleGameOnChain,
  cancelGameOnChain,
  refundBetOnChain,
  retrySettlement,
  resetErRevealFlag,
  fetchGameState,
  getWalletBalance,
  getExplorerUrl,
  getGameExplorerUrl,
  WalletAdapter,
} from "@/lib/onChainGame";

import Navbar from "@/components/Navbar";
import GameLobby from "@/components/GameLobby";
import PokerTable from "@/components/PokerTable";
import BettingPanel from "@/components/BettingPanel";
import GameInfo from "@/components/GameInfo";
import TransactionFeed from "@/components/TransactionFeed";

export default function Home() {
  const { publicKey, connected, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { phase, mode, createGame, resetGame, isOnChain, isDelegated, player2JoinedOnChain, txHistory, txPending, txError, onChainGameId, gamePDA, winner, pot, player1, player2, myPlayerIndex, settledOnChain } = useGameStore();

  // Track whether we've already attempted delegation for this game
  const delegationAttempted = useRef(false);

  // Create wallet adapter for on-chain calls
  const getWalletAdapter = (): WalletAdapter | null => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    return { publicKey, signTransaction, signAllTransactions };
  };

  // ─── MagicBlock ER Delegation ─────────────────────────
  // When both players have joined (phase=preflop, mode=multiplayer, both players present),
  // Player 1 (the creator) automatically delegates the game PDA + hand PDAs to MagicBlock ER.
  // This makes the game run on the Ephemeral Rollup for fast, gasless gameplay.
  useEffect(() => {
    if (
      mode !== "multiplayer" ||
      !isOnChain ||
      isDelegated ||
      !onChainGameId ||
      myPlayerIndex !== 0 || // Only Player 1 (creator) delegates
      !player1 ||
      !player2 ||
      !publicKey ||
      !player2JoinedOnChain || // Wait for Player 2's on-chain buy-in before delegating
      delegationAttempted.current
    ) return;

    // Only delegate once we're past the waiting phase (both players joined)
    if (phase !== "preflop" && phase !== "flop" && phase !== "turn" && phase !== "river") return;

    delegationAttempted.current = true;

    const doDelegation = async () => {
      const wallet = getWalletAdapter();
      if (!wallet) return;

      try {
        const p1 = new PublicKey(player1.publicKey);
        const p2 = new PublicKey(player2.publicKey);

        useGameStore.setState({ lastAction: "🔮 Delegating to MagicBlock ER..." });
        console.log("🔮 Auto-delegating game to MagicBlock Ephemeral Rollup...");

        const result = await delegateToMagicBlock(wallet, onChainGameId, p1, p2);
        if (result.success) {
          console.log("✅ Game delegated to MagicBlock ER!");
          useGameStore.setState({ isDelegated: true, lastAction: "⚡ MagicBlock ER Active!" });
          useGameStore.getState().addTransaction({
            type: "delegate",
            signature: result.signature!,
            description: "Game delegated to MagicBlock Ephemeral Rollup",
            timestamp: Date.now(),
          });
          // Notify server that delegation is complete
          sendDelegationComplete();
        } else {
          console.warn("⚠️ Delegation failed (game continues via server):", result.error);
          useGameStore.setState({ lastAction: "Game active (delegation skipped)" });
        }
      } catch (err: any) {
        console.warn("⚠️ Delegation error (game continues):", err.message);
        useGameStore.setState({ lastAction: "Game active" });
      }
    };

    // Small delay to let the join TX finalize
    const timer = setTimeout(doDelegation, 3000);
    return () => clearTimeout(timer);
  }, [mode, isOnChain, isDelegated, onChainGameId, myPlayerIndex, player1, player2, phase, publicKey, player2JoinedOnChain]);

  // Reset delegation flag when going back to lobby
  useEffect(() => {
    if (phase === "lobby") {
      delegationAttempted.current = false;
    }
  }, [phase]);

  const handleCreateGame = async (buyIn: number, name: string) => {
    if (!publicKey) return;

    const wallet = getWalletAdapter();
    if (!wallet) return;

    // Set pending state
    useGameStore.setState({ txPending: true, txError: null, lastAction: "Creating game on Solana..." });

    try {
      // Get wallet balance before
      const balBefore = await getWalletBalance(publicKey);
      useGameStore.setState({ walletBalanceBefore: balBefore });

      // Create game on-chain (transfers real SOL)
      const result = await createOnChainGame(wallet, buyIn);
      if (!result) {
        useGameStore.setState({ txPending: false, txError: "Failed to create on-chain game" });
        return;
      }

      // Add tx to history
      useGameStore.getState().addTransaction({
        type: "create",
        signature: result.txSignature,
        description: `Game created — ${buyIn} SOL staked`,
        timestamp: Date.now(),
        solAmount: solToLamports(buyIn),
      });

      // Now also start the local AI game for gameplay
      const lamports = solToLamports(buyIn);
      createGame(lamports, publicKey.toBase58(), name);

      // Update on-chain state
      useGameStore.setState({
        isOnChain: true,
        onChainGameId: result.gameId,
        gamePDA: result.gamePDA,
        txPending: false,
        lastAction: `Game created on Solana! 🎮 ${buyIn} SOL staked`,
      });

    } catch (err: any) {
      console.error("Create game error:", err);
      useGameStore.setState({ txPending: false, txError: err.message });
      // Fallback to offline mode
      const lamports = solToLamports(buyIn);
      createGame(lamports, publicKey.toBase58(), name);
    }
  };

  const handleJoinGame = (name: string) => {
    // Legacy — not used in new UI
  };

  const handleCreateMultiplayer = async (buyIn: number, name: string) => {
    if (!publicKey) return;

    const wallet = getWalletAdapter();
    if (!wallet) return;

    useGameStore.setState({ txPending: true, txError: null, lastAction: "Creating on-chain game..." });

    try {
      // Get wallet balance before
      const balBefore = await getWalletBalance(publicKey);
      useGameStore.setState({ walletBalanceBefore: balBefore });

      // Create game on-chain first (real SOL transfer)
      const result = await createOnChainGame(wallet, buyIn);
      if (!result) {
        useGameStore.setState({ txPending: false, txError: "Failed to create on-chain game" });
        return;
      }

      useGameStore.getState().addTransaction({
        type: "create",
        signature: result.txSignature,
        description: `Game created — ${buyIn} SOL staked on-chain`,
        timestamp: Date.now(),
        solAmount: solToLamports(buyIn),
      });

      useGameStore.setState({
        isOnChain: true,
        onChainGameId: result.gameId,
        gamePDA: result.gamePDA,
        txPending: false,
      });

      // Then set up multiplayer WebSocket
      const lamports = solToLamports(buyIn);
      useGameStore.setState({ mode: "multiplayer" });
      await createMultiplayerGame(lamports, publicKey.toBase58(), name);

    } catch (err: any) {
      console.error("Create multiplayer error:", err);
      useGameStore.setState({ txPending: false, txError: err.message });
      // Fallback
      const lamports = solToLamports(buyIn);
      useGameStore.setState({ mode: "multiplayer" });
      await createMultiplayerGame(lamports, publicKey.toBase58(), name);
    }
  };

  const handleJoinMultiplayer = async (roomCode: string, name: string) => {
    if (!publicKey) return;

    const wallet = getWalletAdapter();
    useGameStore.setState({ mode: "multiplayer", txPending: true, txError: null, lastAction: "Joining game..." });

    // Join WebSocket room first
    const success = await joinMultiplayerGame(roomCode, publicKey.toBase58(), name);
    if (!success) {
      useGameStore.setState({ mode: "ai", phase: "lobby", txPending: false });
      throw new Error("Failed to join");
    }

    // Wait for onChainGameId to arrive from the server (comes in 'joined' or 'state' message)
    let onChainId: number | null = useGameStore.getState().onChainGameId;
    if (!onChainId) {
      // Give the server state broadcast a moment to arrive
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 200));
        onChainId = useGameStore.getState().onChainGameId;
        if (onChainId) break;
      }
    }

    // Now pay buy-in on-chain
    if (wallet && onChainId) {
      try {
        // Get wallet balance before
        const balBefore = await getWalletBalance(publicKey);
        useGameStore.setState({ walletBalanceBefore: balBefore, lastAction: "Paying buy-in on Solana..." });

        console.log("💰 Player 2 paying buy-in on-chain for game:", onChainId);
        const result = await joinOnChainGame(wallet, onChainId);
        if (result.success) {
          console.log("✅ Player 2 buy-in paid on-chain:", result.signature);
          const gameState = useGameStore.getState();
          useGameStore.getState().addTransaction({
            type: "join",
            signature: result.signature!,
            description: `Joined game — buy-in paid on-chain`,
            timestamp: Date.now(),
            solAmount: gameState.buyIn,
          });
          useGameStore.setState({ lastAction: "Buy-in paid! Game starting... 🎮" });
          // Notify Player 1 that on-chain join is complete so they can delegate
          sendOnChainJoinComplete();
        } else {
          console.error("⚠️ On-chain join failed:", result.error);
          useGameStore.setState({ txError: `On-chain buy-in failed: ${result.error}` });
        }
      } catch (err: any) {
        console.error("⚠️ Failed to pay buy-in on-chain:", err.message);
        useGameStore.setState({ txError: `Buy-in payment failed: ${err.message}` });
      }
    } else if (!onChainId) {
      console.warn("⚠️ No on-chain game ID found — game may not have on-chain buy-in");
    }
    useGameStore.setState({ txPending: false });
  };

  const handleNewGame = () => {
    if (mode === "multiplayer") {
      resetGame();
    } else {
      resetGame();
    }
  };

  // Handle on-chain settlement: winner clicks "Claim Winnings" button
  // Flow: If delegated to ER → reveal_winner (commit+undelegate to L1) → settle_game on L1
  //       If not delegated → settle_game directly on L1
  const handleClaimWinnings = async () => {
    if (!publicKey || !onChainGameId) return;
    const wallet = getWalletAdapter();
    if (!wallet) return;

    const gameState = useGameStore.getState();
    const winner = gameState.winner;
    const player1 = gameState.player1;
    const player2 = gameState.player2;
    if (!winner || !player1 || !player2) return;

    const winnerIndex = winner === player1.publicKey ? 0 : 1;
    const winnerPubkey = new PublicKey(winner);
    const loserPubkey = new PublicKey(winner === player1.publicKey ? player2.publicKey : player1.publicKey);
    const p1Pubkey = new PublicKey(player1.publicKey);
    const p2Pubkey = new PublicKey(player2.publicKey);

    // Calculate the actual in-game pot (total bets both players made)
    const actualPot = gameState.pot || 0;

    useGameStore.setState({ txPending: true, txError: null, lastAction: "Claiming winnings on-chain..." });

    // Step 1: If game was delegated to MagicBlock ER, commit+undelegate back to L1
    if (gameState.isDelegated) {
      try {
        useGameStore.setState({ lastAction: "🔮 Committing game state from MagicBlock ER to L1..." });
        console.log("🔮 Revealing winner on MagicBlock ER (commit+undelegate)...");

        const revealResult = await revealWinnerOnChain(wallet, onChainGameId, winnerIndex, p1Pubkey, p2Pubkey);
        if (revealResult.success) {
          console.log("✅ ER state committed to L1:", revealResult.signature);
          useGameStore.getState().addTransaction({
            type: "reveal",
            signature: revealResult.signature!,
            description: "Winner revealed on MagicBlock ER → committed to L1",
            timestamp: Date.now(),
          });

          if (revealResult.error === "UNDELEGATION_PENDING") {
            // ER reveal succeeded but undelegation is slow — user can retry later
            useGameStore.setState({
              settledOnChain: false,
              txPending: false,
              lastAction: "⏳ Game committed on ER. Undelegation pending — click Retry to settle SOL.",
              txError: "UNDELEGATION_PENDING",
            } as any);
          } else {
            // Full settlement completed (reveal + settle on L1)
            useGameStore.setState({ settledOnChain: true, txPending: false, lastAction: "🏆 Winnings claimed via MagicBlock ER!" } as any);
          }
          return;
        } else {
          console.warn("⚠️ ER reveal failed, falling back to L1 settle:", revealResult.error);
        }
      } catch (err: any) {
        console.warn("⚠️ ER reveal error, falling back to L1 settle:", err.message);
      }
    }

    // Step 2: Settle directly on L1 (either no delegation, or ER reveal failed)
    useGameStore.setState({ lastAction: "💰 Settling on Solana L1..." });
    const result = await settleGameOnChain(wallet, onChainGameId, winnerIndex, winnerPubkey, loserPubkey, actualPot);
    if (result.success) {
      console.log("✅ On-chain settlement completed:", result.signature);
      useGameStore.getState().addTransaction({
        type: "settle",
        signature: result.signature!,
        description: `Winnings claimed on-chain — loser refunded remaining SOL`,
        timestamp: Date.now(),
        solAmount: actualPot,
      });
      useGameStore.setState({ settledOnChain: true, txPending: false, lastAction: "🏆 Winnings claimed! Loser refunded." } as any);
    } else {
      console.error("❌ On-chain settlement failed:", result.error);
      useGameStore.setState({ txPending: false, txError: result.error || "Settlement failed" });
    }
  };

  const handleRetrySettlement = async () => {
    if (!publicKey || !onChainGameId) return;
    const wallet = getWalletAdapter();
    if (!wallet) return;

    const gameState = useGameStore.getState();
    const winnerKey = gameState.winner;
    if (!winnerKey || !gameState.player1 || !gameState.player2) return;

    const winnerPubkey = new PublicKey(winnerKey);

    useGameStore.setState({ txPending: true, txError: null, lastAction: "Retrying settlement..." });

    const result = await retrySettlement(wallet, onChainGameId, winnerPubkey);
    if (result.success) {
      useGameStore.getState().addTransaction({
        type: "settle",
        signature: result.signature!,
        description: "Winnings settled on L1 after undelegation",
        timestamp: Date.now(),
      });
      useGameStore.setState({ settledOnChain: true, txPending: false, txError: null, lastAction: "🏆 Winnings claimed!" } as any);
    } else {
      // Keep UNDELEGATION_PENDING status so button stays in retry mode (not "Claim" which re-sends reveal_winner)
      useGameStore.setState({ txPending: false, txError: "UNDELEGATION_PENDING", lastAction: "⏳ " + (result.error || "Still pending — try again in a moment.") });
    }
  };

  const handleBackToLobby = () => {
    if (mode === "multiplayer") {
      disconnect();
    }
    resetErRevealFlag();
    useGameStore.setState({
      gameId: "", onChainGameId: null, phase: "lobby", mode: "ai", pot: 0, buyIn: 0, currentBet: 0, dealer: 0, turn: 0,
      communityCards: [], deck: [], player1: null, player2: null, myPlayerIndex: -1,
      bettingPool: { totalPoolPlayer1: 0, totalPoolPlayer2: 0, bets: [], isSettled: false, winningPlayer: 0 },
      winner: null, winnerHandResult: null, isAnimating: false, showCards: false,
      lastAction: "", aiMessage: "", chatMessages: [],
      isOnChain: false, isDelegated: false, player2JoinedOnChain: false, txHistory: [], txPending: false, txError: null, gamePDA: null,
      walletBalanceBefore: 0, walletBalanceAfter: 0,
    });
  };

  // Cancel a game that hasn't started (Player 2 never joined) — refund Player 1
  const handleCancelGame = async () => {
    if (!publicKey || !onChainGameId) return;
    const wallet = getWalletAdapter();
    if (!wallet) return;

    useGameStore.setState({ txPending: true, txError: null, lastAction: "Cancelling game & refunding..." });

    const result = await cancelGameOnChain(wallet, onChainGameId);
    if (result.success) {
      useGameStore.getState().addTransaction({
        type: "cancel",
        signature: result.signature!,
        description: "Game cancelled — buy-in refunded",
        timestamp: Date.now(),
      });
      useGameStore.setState({ txPending: false, lastAction: "✅ Game cancelled, SOL refunded!" });
      // Wait a moment then go back to lobby
      setTimeout(() => handleBackToLobby(), 2000);
    } else {
      useGameStore.setState({ txPending: false, txError: result.error || "Cancel failed" });
    }
  };

  // Not connected — show advanced landing page
  if (!connected || !publicKey) {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        {/* Premium background */}
        <div className="bg-grain" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
        
        {/* Animated background orbs */}
        <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-gradient-to-br from-amber-600/20 to-transparent rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-emerald-600/20 to-transparent rounded-full blur-[150px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-gradient-to-l from-purple-600/10 to-transparent rounded-full blur-[120px]" />

        {/* Header Navigation */}
        <nav className="relative z-20 flex justify-between items-center px-8 py-6 backdrop-blur-md bg-slate-900/30 border-b border-slate-700/30">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🃏</span>
            <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-orange-400 to-red-500">
              PRIVATE POKER
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <a href="/docs" className="hover:text-amber-300 transition-colors font-medium">API Docs</a>
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              On-Chain Live
            </span>
          </div>
        </nav>

        {/* Main Content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="text-center max-w-3xl"
          >
            <motion.div
              animate={{ rotateY: [0, 360] }}
              transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
              className="text-9xl mb-8 drop-shadow-lg"
            >
              🎰
            </motion.div>

            <h1 className="text-6xl md:text-7xl font-black mb-4 leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-orange-300 to-red-400">
                Decentralized
              </span>
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-300 to-emerald-400">
                Privacy Poker
              </span>
            </h1>

            <p className="text-lg text-slate-300 mb-2 leading-relaxed max-w-2xl mx-auto">
              Play Texas Hold&apos;em with <span className="text-amber-300 font-semibold">provably fair</span> outcomes on the blockchain.
            </p>
            <p className="text-base text-slate-400 mb-8 max-w-2xl mx-auto">
              Your cards are encrypted in Intel TDX. Nobody—not even us—can see your hand until showdown.
            </p>
          </motion.div>

          {/* Key Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12 max-w-5xl w-full"
          >
            {[
              { icon: "🔐", title: "100% Private", desc: "Cards encrypted in TEE" },
              { icon: "⚡", title: "Instant Gameplay", desc: "5s MagicBlock ER blocks" },
              { icon: "💎", title: "Real Stakes", desc: "SOL winnings on-chain" },
              { icon: "🏆", title: "Fair & Auditable", desc: "All moves on Solana" },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="group relative p-6 rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-900/40 border border-slate-700/50 hover:border-amber-500/30 transition-all hover:shadow-lg hover:shadow-amber-500/10"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="text-4xl mb-3">{feature.icon}</div>
                  <h3 className="font-bold text-slate-100 mb-1">{feature.title}</h3>
                  <p className="text-xs text-slate-400">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Stats Bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex justify-center gap-12 mb-12 px-6 py-6 rounded-2xl bg-slate-800/30 backdrop-blur-md border border-slate-700/30"
          >
            {[
              { label: "Games Today", value: "247", color: "amber" },
              { label: "Total SOL Wagered", value: "1,234", color: "green" },
              { label: "Active Players", value: "89", color: "blue" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className={`text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-${stat.color}-300 to-${stat.color}-500 mb-1`}>
                  {stat.value}
                </div>
                <div className="text-xs text-slate-400">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 }}
            className="flex flex-col items-center gap-6 mb-12"
          >
            <div className="flex items-center gap-4 px-8 py-4 rounded-2xl bg-gradient-to-r from-slate-800/50 to-slate-900/50 border border-slate-700/50 backdrop-blur-md">
              <div className="flex flex-col">
                <span className="text-xs text-slate-400 uppercase tracking-wider">Get Started</span>
                <span className="text-sm text-slate-300 font-semibold">Connect your wallet</span>
              </div>
              <WalletMultiButton
                style={{
                  background: "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)",
                  borderRadius: "12px",
                  fontSize: "14px",
                  height: "44px",
                  padding: "0 24px",
                  fontWeight: "700",
                  letterSpacing: "0.5px",
                  border: "2px solid rgba(251, 191, 36, 0.3)",
                  boxShadow: "0 0 20px rgba(251, 146, 60, 0.3)",
                }}
              />
            </div>

            <p className="text-xs text-slate-500 text-center">
              Connect any Solana wallet • No KYC • Instant play • Secure on-chain
            </p>
          </motion.div>

          {/* Blockchain Integration Badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="flex flex-wrap justify-center gap-3"
          >
            {[
              { name: "Solana", icon: "⛓️" },
              { name: "MagicBlock", icon: "✨" },
              { name: "Intel TDX", icon: "🔒" },
            ].map((tech) => (
              <div
                key={tech.name}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-300 text-xs font-medium hover:border-slate-600 transition-colors"
              >
                <span>{tech.icon}</span>
                <span>{tech.name}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex justify-center items-center py-6 px-6 border-t border-slate-700/30 backdrop-blur-md bg-slate-900/20">
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-2">
              Powered by <span className="text-slate-400 font-semibold">MagicBlock Ephemeral Rollups</span> • Deployed on Solana Devnet
            </p>
            <p className="text-[10px] text-slate-600">
              Program ID: <span className="font-mono text-slate-500">7qRu72w...zkqK</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Connected — Lobby or Game
  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="bg-grain" />
      <div className="fixed inset-0 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 -z-10" />
      <div className="fixed top-0 left-1/3 w-[600px] h-[600px] bg-emerald-900/10 rounded-full blur-[120px] -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-yellow-900/10 rounded-full blur-[120px] -z-10" />

      {/* Navbar */}
      <Navbar />

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4">
        {(phase === "lobby" || (phase === "waiting" && mode === "multiplayer")) ? (
          <GameLobby
            walletAddress={publicKey.toBase58()}
            onCreateGame={handleCreateGame}
            onJoinGame={handleJoinGame}
            onCreateMultiplayer={handleCreateMultiplayer}
            onJoinMultiplayer={handleJoinMultiplayer}
          />
        ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-6 items-start">
            {/* Left Panel — Game Info + Transactions */}
            <div className="hidden lg:block space-y-4">
              <GameInfo />
              <TransactionFeed />
            </div>

            {/* Center — Poker Table */}
            <div className="flex flex-col items-center">
              <PokerTable />

              {/* Game Over buttons */}
              {(phase === "settled" || phase === "showdown") && (
                <div className="flex flex-col items-center gap-4 mt-6">
                  {/* Claim Winnings button — ALWAYS shown to the winner until claimed */}
                  {isOnChain && onChainGameId && winner && publicKey && (() => {
                    const isWinner = (myPlayerIndex === 0 && winner === player1?.publicKey) || 
                                     (myPlayerIndex === 1 && winner === player2?.publicKey);
                    if (isWinner && settledOnChain) {
                      return (
                        <div className="px-8 py-3 bg-green-900/50 border border-green-500/30 rounded-2xl text-green-400 font-bold text-lg">
                          ✅ Winnings Claimed!
                        </div>
                      );
                    }
                    if (isWinner && !settledOnChain) {
                      const isPendingUndelegation = txError === "UNDELEGATION_PENDING";
                      return (
                        <div className="flex flex-col items-center gap-2">
                          <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 1, type: "spring" }}
                            onClick={isPendingUndelegation ? handleRetrySettlement : handleClaimWinnings}
                            disabled={txPending}
                            className="px-10 py-4 bg-gradient-to-r from-green-400 to-emerald-500 text-black font-black
                              rounded-2xl text-xl hover:from-green-300 hover:to-emerald-400 transition-all
                              shadow-lg shadow-green-500/30 animate-pulse disabled:opacity-50 disabled:animate-none"
                          >
                            {txPending ? "⏳ Processing..." : isPendingUndelegation ? `🔄 Retry Settlement (${lamportsToSol(pot)} SOL)` : `💰 Claim ${lamportsToSol(pot)} SOL Winnings`}
                          </motion.button>
                          <p className="text-yellow-400/80 text-xs font-medium animate-pulse">
                            {isPendingUndelegation
                              ? "⏳ ER committed. Waiting for undelegation — retry in a moment."
                              : "⚠️ You must claim your winnings before leaving!"}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="flex gap-4">
                    <motion.button
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 2 }}
                      onClick={handleNewGame}
                      className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-black
                        rounded-2xl text-lg hover:from-yellow-400 hover:to-orange-400 transition-all
                        shadow-lg shadow-orange-500/20"
                    >
                      {mode === "multiplayer" ? "🔄 Rematch" : "🎮 New Game"}
                    </motion.button>
                    <motion.button
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 2.2 }}
                      onClick={handleBackToLobby}
                      className="px-6 py-3 bg-gray-800 text-gray-300 font-bold
                        rounded-2xl text-lg hover:bg-gray-700 transition-all border border-gray-700"
                    >
                      🏠 Lobby
                    </motion.button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel — Betting */}
            <div>
              <BettingPanel
                walletAddress={publicKey.toBase58()}
                walletName={publicKey.toBase58().slice(0, 6)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 py-2 text-center pointer-events-none z-0">
        <div className="text-gray-600 text-[10px]">
          Private Poker • Program: 7qRu72w...zkqK • {isDelegated ? "⚡ MagicBlock ER Active" : isOnChain ? `⛓️ Game #${onChainGameId} On-Chain` : "MagicBlock Ephemeral Rollup"} • Solana Devnet
        </div>
      </footer>
    </div>
  );
}
