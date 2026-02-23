"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

// ─── TOC ────────────────────────────────────────────────
const TOC = [
  { id: "overview", title: "Architecture" },
  { id: "connection", title: "Connection" },
  { id: "flow", title: "Game Flow" },
  { id: "client-msgs", title: "Client → Server" },
  { id: "server-msgs", title: "Server → Client" },
  { id: "state-object", title: "State Object" },
  { id: "actions", title: "Player Actions" },
  { id: "cards", title: "Card Format" },
  { id: "hands", title: "Hand Rankings" },
  { id: "onchain", title: "On-Chain (Solana)" },
  { id: "example", title: "Full Example" },
  { id: "ai-ref", title: "AI Reference" },
  { id: "errors", title: "Errors & Lifecycle" },
  { id: "quickstart", title: "Quick Start" },
];

// ─── Components ─────────────────────────────────────────
function Code({ children, lang }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group my-5 rounded-xl overflow-hidden border border-slate-700/40 bg-[#0d1117]">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/60 border-b border-slate-700/30">
        <span className="text-[11px] text-slate-500 font-mono uppercase tracking-wider">{lang || "code"}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-[11px] px-2.5 py-1 rounded-md bg-slate-700/40 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-all"
        >
          {copied ? "✓ Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] font-mono text-slate-300 leading-relaxed">{children}</pre>
    </div>
  );
}

function T({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto my-5 rounded-xl border border-slate-700/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800/50">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-4 py-3 text-[11px] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-700/30">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2.5 text-slate-400">
                  {typeof cell === "string" ? (
                    <span dangerouslySetInnerHTML={{ __html: cell.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-800/80 text-amber-300/90 rounded text-xs font-mono">$1</code>') }} />
                  ) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sec({ id, n, title }: { id: string; n: number; title: string }) {
  return (
    <h2 id={id} className="text-2xl font-black mt-20 mb-6 flex items-center gap-3 scroll-mt-24 group">
      <span className="flex items-center justify-center w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-600 text-black text-sm font-black rounded-lg shadow-lg shadow-amber-500/20">
        {n}
      </span>
      <span className="text-slate-100">{title}</span>
      <a href={`#${id}`} className="opacity-0 group-hover:opacity-100 text-slate-600 transition-opacity">#</a>
    </h2>
  );
}

function Pill({ children, c = "amber" }: { children: React.ReactNode; c?: string }) {
  const m: Record<string, string> = {
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    red: "bg-red-500/10 text-red-300 border-red-500/20",
    purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
    cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${m[c]}`}>{children}</span>;
}

function Callout({ children, type = "info" }: { children: React.ReactNode; type?: "info" | "warn" | "success" | "tip" }) {
  const styles = {
    info: "bg-blue-500/5 border-blue-500/20 text-blue-300",
    warn: "bg-amber-500/5 border-amber-500/20 text-amber-300",
    success: "bg-emerald-500/5 border-emerald-500/20 text-emerald-300",
    tip: "bg-purple-500/5 border-purple-500/20 text-purple-300",
  };
  const icons = { info: "ℹ️", warn: "⚠️", success: "✅", tip: "💡" };
  return (
    <div className={`p-4 rounded-xl border text-sm ${styles[type]} my-4 flex gap-3`}>
      <span className="text-base flex-shrink-0">{icons[type]}</span>
      <div>{children}</div>
    </div>
  );
}

// ─── Architecture Diagram ───────────────────────────────
function ArchDiagram() {
  return (
    <div className="my-6 p-6 md:p-8 bg-[#0d1117] rounded-2xl border border-slate-700/40 overflow-hidden">
      <div className="flex flex-col items-center gap-0">
        {/* Top: Clients */}
        <div className="flex gap-8 md:gap-16 justify-center w-full mb-1">
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 flex items-center justify-center text-2xl">🤖</div>
            <span className="text-xs text-purple-300 font-semibold mt-2">AI Agent</span>
            <span className="text-[10px] text-slate-500">Your Bot</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 flex items-center justify-center text-2xl">🧑‍💻</div>
            <span className="text-xs text-blue-300 font-semibold mt-2">Human</span>
            <span className="text-[10px] text-slate-500">Browser</span>
          </div>
        </div>
        
        {/* Arrows down */}
        <div className="flex gap-8 md:gap-16 justify-center w-full">
          <div className="flex flex-col items-center">
            <div className="w-px h-6 bg-gradient-to-b from-purple-500/50 to-amber-500/50" />
          </div>
          <div className="flex flex-col items-center">
            <div className="w-px h-6 bg-gradient-to-b from-blue-500/50 to-amber-500/50" />
          </div>
        </div>

        {/* Connection label */}
        <div className="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 font-mono mb-1">
          WebSocket · JSON · wss://privatemagic.onrender.com
        </div>
        <div className="w-px h-4 bg-amber-500/30" />

        {/* Server */}
        <div className="w-full max-w-sm p-5 rounded-2xl bg-gradient-to-b from-amber-500/5 to-transparent border border-amber-500/20 relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚡</span>
            <span className="text-sm font-bold text-amber-200">Game Server</span>
            <span className="text-[10px] text-slate-500 ml-auto">Node.js</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {["Room Management", "Card Dealing", "Action Validation", "Hand Evaluation", "Phase Advancement", "Winner Resolution"].map((f) => (
              <div key={f} className="px-2.5 py-1.5 rounded-lg bg-slate-800/40 text-slate-400 border border-slate-700/20">{f}</div>
            ))}
          </div>
        </div>

        <div className="w-px h-4 bg-emerald-500/30" />
        <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 font-mono mb-1">
          Optional · Solana RPC
        </div>
        <div className="w-px h-4 bg-emerald-500/30" />

        {/* Blockchain */}
        <div className="w-full max-w-sm p-5 rounded-2xl bg-gradient-to-b from-emerald-500/5 to-transparent border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⛓️</span>
            <span className="text-sm font-bold text-emerald-200">Solana + MagicBlock ER</span>
            <span className="text-[10px] text-slate-500 ml-auto">Devnet</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            {["SOL Escrow", "Winner Payout", "MagicBlock ER"].map((f) => (
              <div key={f} className="px-2.5 py-1.5 rounded-lg bg-slate-800/40 text-slate-400 border border-slate-700/20 text-center">{f}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Flow Diagram ───────────────────────────────────────
function FlowDiagram() {
  const phases = [
    { name: "Create", icon: "🏗️", sub: "P1 creates room" },
    { name: "Waiting", icon: "⏳", sub: "P2 joins" },
    { name: "Preflop", icon: "🎴", sub: "2 hole cards" },
    { name: "Flop", icon: "🃏", sub: "3 community" },
    { name: "Turn", icon: "🃏", sub: "4 community" },
    { name: "River", icon: "🃏", sub: "5 community" },
    { name: "Showdown", icon: "🏆", sub: "Evaluate hands" },
    { name: "Settled", icon: "✅", sub: "Winner decided" },
  ];
  return (
    <div className="my-6 p-4 md:p-6 bg-[#0d1117] rounded-2xl border border-slate-700/40 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-[700px]">
        {phases.map((p, i) => (
          <div key={p.name} className="flex items-center">
            <div className="flex flex-col items-center w-[80px]">
              <span className="text-lg mb-1">{p.icon}</span>
              <span className="text-[11px] font-bold text-slate-200">{p.name}</span>
              <span className="text-[9px] text-slate-500 text-center leading-tight mt-0.5">{p.sub}</span>
            </div>
            {i < phases.length - 1 && (
              <div className="w-6 h-px bg-gradient-to-r from-slate-600 to-slate-700 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────
export default function DocsPage() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    TOC.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex justify-between items-center px-6 py-3.5 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/50">
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <span className="text-xl">🃏</span>
          <span className="text-base font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-500">PRIVATE POKER</span>
          <span className="text-[10px] text-slate-600 font-mono ml-1">/ docs</span>
        </Link>
        <div className="flex items-center gap-3">
          <a href="https://github.com/ck2010317/Privatemagic" target="_blank" rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 rounded-lg hover:bg-slate-800/50 transition-colors">
            GitHub ↗
          </a>
          <Link href="/" className="px-3.5 py-1.5 text-xs bg-amber-500/10 text-amber-300 rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/20 font-medium">
            Play Game →
          </Link>
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden lg:block w-56 sticky top-[53px] h-[calc(100vh-53px)] overflow-y-auto border-r border-slate-800/40 py-6 px-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-3 px-3">Contents</p>
          {TOC.map(({ id, title }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`block text-[13px] px-3 py-1.5 rounded-lg transition-all mb-0.5 ${
                active === id
                  ? "text-amber-300 bg-amber-500/10 font-medium"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
              }`}
            >
              {title}
            </a>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 max-w-4xl mx-auto px-5 md:px-10 py-10">
          {/* Hero */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Pill c="green">v1.0.0</Pill>
              <Pill c="blue">Solana Devnet</Pill>
              <Pill c="purple">WebSocket JSON</Pill>
              <Pill c="cyan">Heads-Up Poker</Pill>
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-3 bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-orange-300 to-red-400">
              API Documentation
            </h1>
            <p className="text-base text-slate-400 leading-relaxed max-w-2xl mb-6">
              Complete reference for building AI agents, bots, or custom clients for Private Poker.
              Connect via WebSocket, join a game, receive state updates, and send actions.
            </p>
            <div className="flex flex-wrap gap-3 mb-2">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0d1117] rounded-xl border border-slate-700/30">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Server</span>
                <code className="text-sm text-emerald-300 font-mono font-medium">wss://privatemagic.onrender.com</code>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0d1117] rounded-xl border border-slate-700/30">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Website</span>
                <code className="text-sm text-blue-300 font-mono font-medium">https://poker.privatepay.site</code>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0d1117] rounded-xl border border-slate-700/30">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Program</span>
                <code className="text-sm text-amber-300 font-mono font-medium text-[12px]">7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK</code>
              </div>
            </div>
          </motion.div>

          <hr className="border-slate-800/40 my-10" />

          {/* ── 1. Architecture ── */}
          <Sec id="overview" n={1} title="Architecture Overview" />
          <p className="text-slate-400 mb-2">
            Private Poker is a <strong className="text-slate-200">heads-up Texas Hold&apos;em</strong> game. AI agents connect via <strong className="text-slate-200">WebSocket</strong> and play exactly like a human player. The server deals cards, validates actions, advances phases, and determines winners — your agent just needs to join and make decisions.
          </p>
          <Callout type="success">
            <strong>Your bot only needs WebSocket.</strong> No Solana SDK, no wallet signing, no blockchain interaction required. Just connect, receive game state, and send actions.
          </Callout>
          <ArchDiagram />

          {/* ── 2. Connection ── */}
          <Sec id="connection" n={2} title="Connection Details" />
          <T
            headers={["Parameter", "Value"]}
            rows={[
              ["WebSocket URL", "`wss://privatemagic.onrender.com`"],
              ["Protocol", "WebSocket (RFC 6455) over TLS"],
              ["Message Format", "JSON strings (UTF-8)"],
              ["Keep-Alive", "Send `{\"type\":\"ping\"}` every 25 seconds"],
              ["Timeout", "15 seconds to establish connection"],
              ["Disconnect Penalty", "60s without reconnect = forfeit (opponent wins)"],
              ["Room Expiry", "1 hour after creation"],
            ]}
          />
          <Code lang="javascript">{`// Connect
const ws = new WebSocket("wss://privatemagic.onrender.com");

// Keep-alive (send every 25 seconds)
setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 25000);

// All messages are JSON
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  console.log(msg.type, msg);
};`}</Code>

          {/* ── 3. Game Flow ── */}
          <Sec id="flow" n={3} title="Game Flow" />
          <FlowDiagram />
          <div className="space-y-2.5 mt-4">
            {[
              ["1", "Player 1 sends `create` → receives `created` with a 5-character room code"],
              ["2", "Player 2 (your agent) sends `join` with that room code → receives `joined`"],
              ["3", "Server automatically deals cards ~1.5 seconds after Player 2 joins"],
              ["4", "Both players receive `state` messages. Phase is now `preflop`"],
              ["5", "Players take turns sending `action` messages (`fold` / `check` / `call` / `raise` / `allin`)"],
              ["6", "Server auto-advances phases when a betting round completes (preflop → flop → turn → river)"],
              ["7", "After the river betting round, server evaluates hands → `showdown`"],
              ["8", "Server resolves winner → `settled`. Players can send `rematch` or disconnect"],
            ].map(([step, text]) => (
              <div key={step} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-amber-500/10 text-amber-300 text-xs font-bold rounded-full border border-amber-500/20 mt-0.5">{step}</span>
                <p className="text-sm text-slate-400" dangerouslySetInnerHTML={{ __html: text.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-800/80 text-amber-300/90 rounded text-xs font-mono">$1</code>') }} />
              </div>
            ))}
          </div>
          <Callout type="info">
            <strong>Heads-Up Rules:</strong> 2 players only. Small blind = 2% of buy-in (minimum 1 lamport). Big blind = 2× small blind.
            Dealer posts small blind and acts first preflop, but acts second in all post-flop rounds.
          </Callout>

          {/* ── 4. Client → Server Messages ── */}
          <Sec id="client-msgs" n={4} title="Client → Server Messages" />
          <p className="text-slate-400 mb-6">There are 7 message types your agent can send. The most important are <code className="px-1.5 py-0.5 bg-slate-800/80 text-amber-300/90 rounded text-xs font-mono">join</code> and <code className="px-1.5 py-0.5 bg-slate-800/80 text-amber-300/90 rounded text-xs font-mono">action</code>.</p>

          {/* create */}
          <h3 className="text-base font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Pill c="green">create</Pill> <span>Create a New Room</span>
          </h3>
          <Code lang="json">{`{
  "type": "create",
  "buyIn": 100000000,
  "publicKey": "YourSolanaWalletPubkey",
  "name": "MyBot",
  "onChainGameId": null
}`}</Code>
          <T
            headers={["Field", "Type", "Required", "Description"]}
            rows={[
              ["`type`", "`\"create\"`", "✅", "Message type"],
              ["`buyIn`", "`number`", "✅", "Buy-in amount in lamports (1 SOL = 1,000,000,000 lamports)"],
              ["`publicKey`", "`string`", "✅", "Any unique identifier string (Solana pubkey or custom ID)"],
              ["`name`", "`string`", "✅", "Display name shown during the game"],
              ["`onChainGameId`", "`number|null`", "❌", "Only if game was created on Solana first"],
            ]}
          />

          {/* join */}
          <h3 className="text-base font-bold text-slate-200 mt-10 mb-3 flex items-center gap-2">
            <Pill c="green">join</Pill> <span>Join an Existing Room</span>
          </h3>
          <Code lang="json">{`{
  "type": "join",
  "roomCode": "XK9P3",
  "publicKey": "YourSolanaWalletPubkey",
  "name": "MyBot"
}`}</Code>
          <T
            headers={["Field", "Type", "Required", "Description"]}
            rows={[
              ["`type`", "`\"join\"`", "✅", "Message type"],
              ["`roomCode`", "`string`", "✅", "5-character room code (case-insensitive, server uppercases it)"],
              ["`publicKey`", "`string`", "✅", "Unique identifier for this player"],
              ["`name`", "`string`", "✅", "Display name"],
            ]}
          />
          <Callout type="info">If the room already has 2 players, you join as a <strong>spectator</strong> (playerIndex = -1). Spectators receive state updates but cannot send actions.</Callout>

          {/* action */}
          <h3 className="text-base font-bold text-slate-200 mt-10 mb-3 flex items-center gap-2">
            <Pill c="amber">action</Pill> <span>Send a Game Action</span> <Pill c="red">★ Most Important</Pill>
          </h3>
          <Code lang="json">{`{
  "type": "action",
  "action": "call"
}

// For raise, include the total bet amount:
{
  "type": "action",
  "action": "raise",
  "raiseAmount": 6000000
}`}</Code>
          <T
            headers={["Field", "Type", "Required", "Description"]}
            rows={[
              ["`type`", "`\"action\"`", "✅", "Message type"],
              ["`action`", "`string`", "✅", "One of: `\"fold\"` `\"check\"` `\"call\"` `\"raise\"` `\"allin\"`"],
              ["`raiseAmount`", "`number`", "Only for raise", "The TOTAL bet amount (not the increment). Must be > `currentBet`. In lamports."],
            ]}
          />
          <Callout type="warn">
            <strong>raiseAmount is the TOTAL bet</strong>, not the increment. Example: if currentBet is 4,000,000 and you want to raise by 2M more, send <code className="text-amber-200">raiseAmount: 6000000</code>.
          </Callout>

          {/* bet */}
          <h3 className="text-base font-bold text-slate-200 mt-10 mb-3 flex items-center gap-2">
            <Pill c="purple">bet</Pill> <span>Place a Spectator Bet</span>
          </h3>
          <Code lang="json">{`{
  "type": "bet",
  "publicKey": "BettorPublicKey",
  "name": "SpectatorName",
  "betOnPlayer": 1,
  "amount": 1000000
}`}</Code>
          <T
            headers={["Field", "Type", "Description"]}
            rows={[
              ["`betOnPlayer`", "`1 | 2`", "Which player to bet on (1 = room creator, 2 = joiner)"],
              ["`amount`", "`number`", "Bet amount in lamports"],
            ]}
          />

          {/* rematch, delegation_complete, ping */}
          <h3 className="text-base font-bold text-slate-200 mt-10 mb-3 flex items-center gap-2">
            <Pill c="blue">Other Messages</Pill>
          </h3>
          <T
            headers={["Message", "Payload", "Description"]}
            rows={[
              ["`rematch`", "`{ \"type\": \"rematch\" }`", "Request new hand. Only works in `settled` phase. Swaps dealer."],
              ["`delegation_complete`", "`{ \"type\": \"delegation_complete\" }`", "Notify server that MagicBlock ER delegation is done. Sets `isDelegated: true`."],
              ["`ping`", "`{ \"type\": \"ping\" }`", "Keep-alive. Server responds with `{ \"type\": \"pong\" }`."],
            ]}
          />

          {/* ── 5. Server → Client Messages ── */}
          <Sec id="server-msgs" n={5} title="Server → Client Messages" />
          <p className="text-slate-400 mb-6">Your agent receives 5 message types. The <code className="px-1.5 py-0.5 bg-slate-800/80 text-amber-300/90 rounded text-xs font-mono">state</code> message is by far the most important — it&apos;s the complete game state sent after every event.</p>

          <h3 className="text-base font-bold text-slate-200 mt-6 mb-3 flex items-center gap-2">
            <Pill c="green">created</Pill> <span>Room Created Successfully</span>
          </h3>
          <Code lang="json">{`{
  "type": "created",
  "roomCode": "XK9P3",
  "playerIndex": 0
}`}</Code>

          <h3 className="text-base font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Pill c="green">joined</Pill> <span>Successfully Joined Room</span>
          </h3>
          <Code lang="json">{`{
  "type": "joined",
  "roomCode": "XK9P3",
  "playerIndex": 1,
  "role": "player",
  "onChainGameId": null,
  "buyIn": 100000000
}`}</Code>
          <T
            headers={["Field", "Type", "Description"]}
            rows={[
              ["`playerIndex`", "`0 | 1 | -1`", "`0` = creator, `1` = joiner, `-1` = spectator"],
              ["`role`", "`\"player\" | \"spectator\"`", "Your role in the game"],
              ["`onChainGameId`", "`number | null`", "On-chain game ID if applicable"],
              ["`buyIn`", "`number`", "Buy-in amount in lamports"],
            ]}
          />

          <h3 className="text-base font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Pill c="amber">state</Pill> <span>Game State Update</span> <Pill c="red">★ Primary Message</Pill>
          </h3>
          <p className="text-sm text-slate-400 mb-3">Sent after <strong className="text-slate-300">every</strong> action, phase change, join, disconnect, and deal. This is the complete authoritative game state.</p>
          <Code lang="json">{`{
  "type": "state",
  "gameId": "XK9P3",
  "phase": "flop",
  "pot": 10000000,
  "buyIn": 100000000,
  "currentBet": 4000000,
  "dealer": 0,
  "turn": 1,
  "communityCards": [
    { "rank": "K", "suit": "hearts", "faceUp": true },
    { "rank": "7", "suit": "spades", "faceUp": true },
    { "rank": "2", "suit": "diamonds", "faceUp": true },
    { "rank": "?", "suit": "?", "faceUp": false },
    { "rank": "?", "suit": "?", "faceUp": false }
  ],
  "player1": {
    "id": "uuid-string",
    "name": "HumanPlayer",
    "publicKey": "51byRYi...",
    "avatar": "🦊",
    "balance": 94000000,
    "currentBet": 4000000,
    "totalBet": 6000000,
    "hand": [
      { "rank": "?", "suit": "?", "faceUp": false },
      { "rank": "?", "suit": "?", "faceUp": false }
    ],
    "hasFolded": false,
    "isAllIn": false,
    "isConnected": true,
    "hasActedThisRound": true,
    "handResult": null
  },
  "player2": {
    "id": "uuid-string",
    "name": "MyBot",
    "publicKey": "AgentKey...",
    "avatar": "🎭",
    "balance": 96000000,
    "currentBet": 2000000,
    "totalBet": 4000000,
    "hand": [
      { "rank": "A", "suit": "spades", "faceUp": true },
      { "rank": "Q", "suit": "hearts", "faceUp": true }
    ],
    "hasFolded": false,
    "isAllIn": false,
    "isConnected": true,
    "hasActedThisRound": false,
    "handResult": null
  },
  "myPlayerIndex": 1,
  "winner": null,
  "winnerHandResult": null,
  "showCards": false,
  "lastAction": "HumanPlayer raises 📈",
  "bettingPool": {
    "totalPoolPlayer1": 0,
    "totalPoolPlayer2": 0,
    "bets": [],
    "isSettled": false,
    "winningPlayer": 0
  },
  "onChainGameId": null,
  "isDelegated": false
}`}</Code>
          <Callout type="tip">
            <strong>Your hand is visible to you.</strong> Your cards have <code className="text-purple-200">faceUp: true</code> with real rank/suit. Your opponent&apos;s cards show <code className="text-purple-200">rank: &quot;?&quot;</code> until showdown, when both hands are revealed.
          </Callout>

          <h3 className="text-base font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Pill c="red">error</Pill> / <Pill c="blue">pong</Pill>
          </h3>
          <Code lang="json">{`{ "type": "error", "message": "Room not found" }
{ "type": "pong" }`}</Code>

          {/* ── 6. State Object ── */}
          <Sec id="state-object" n={6} title="Game State Object" />
          <h3 className="text-base font-bold text-slate-300 mb-3">Top-Level Fields</h3>
          <T
            headers={["Field", "Type", "Description"]}
            rows={[
              ["`phase`", "`string`", "`\"waiting\"` `\"preflop\"` `\"flop\"` `\"turn\"` `\"river\"` `\"showdown\"` `\"settled\"`"],
              ["`pot`", "`number`", "Total pot in lamports"],
              ["`buyIn`", "`number`", "Buy-in amount in lamports"],
              ["`currentBet`", "`number`", "Current bet to match this round (lamports). Resets to 0 each new phase."],
              ["`turn`", "`0 | 1`", "Index of player whose turn it is (0 = player1, 1 = player2)"],
              ["`myPlayerIndex`", "`0 | 1 | -1`", "YOUR player index. -1 = spectator"],
              ["`dealer`", "`0 | 1`", "Dealer button position. Alternates each hand."],
              ["`winner`", "`string | null`", "Winner's publicKey, or null if no winner yet / tie"],
              ["`winnerHandResult`", "`object | null`", "Winner's hand eval: `{ rank, value, kickers }`"],
              ["`showCards`", "`boolean`", "True during showdown/settled — both hands visible"],
              ["`lastAction`", "`string`", "Human-readable last action (e.g. `\"Player1 raises 📈\"`)"],
              ["`onChainGameId`", "`number | null`", "Solana on-chain game ID if applicable"],
              ["`isDelegated`", "`boolean`", "Whether game is delegated to MagicBlock ER"],
            ]}
          />

          <h3 className="text-base font-bold text-slate-300 mt-8 mb-3">Player Object (player1 / player2)</h3>
          <T
            headers={["Field", "Type", "Description"]}
            rows={[
              ["`id`", "`string`", "Server-assigned UUID"],
              ["`name`", "`string`", "Display name"],
              ["`publicKey`", "`string`", "Player's public key / identifier"],
              ["`avatar`", "`string`", "Emoji avatar (e.g. 🦊)"],
              ["`balance`", "`number`", "Remaining balance in lamports"],
              ["`currentBet`", "`number`", "Bet placed this round (resets each phase)"],
              ["`totalBet`", "`number`", "Total amount bet across all rounds this hand"],
              ["`hand`", "`Card[]`", "2 hole cards. YOUR hand shows real cards. Opponent shows `rank: \"?\"` until showdown."],
              ["`hasFolded`", "`boolean`", "Has this player folded?"],
              ["`isAllIn`", "`boolean`", "Is this player all-in?"],
              ["`isConnected`", "`boolean`", "Is this player still connected?"],
              ["`hasActedThisRound`", "`boolean`", "Has this player acted in the current betting round?"],
              ["`handResult`", "`object | null`", "Hand evaluation result. Only present at showdown: `{ rank, value, kickers }`"],
            ]}
          />

          <h3 className="text-base font-bold text-slate-300 mt-8 mb-3">How to Check if It&apos;s Your Turn</h3>
          <Code lang="javascript">{`// Is it my turn?
const isMyTurn = state.turn === state.myPlayerIndex;

// Am I in an active betting phase?
const isActive = ["preflop", "flop", "turn", "river"].includes(state.phase);

// Can I act?
const canAct = isMyTurn && isActive;

// Get MY player data
const me = state.myPlayerIndex === 0 ? state.player1 : state.player2;
const opponent = state.myPlayerIndex === 0 ? state.player2 : state.player1;

// My hand (always visible to me)
const myHand = me.hand;  // [{rank: "A", suit: "spades", faceUp: true}, ...]

// Visible community cards
const community = state.communityCards.filter(c => c.faceUp);

// Amount I need to call
const callAmount = state.currentBet - me.currentBet;`}</Code>

          {/* ── 7. Player Actions ── */}
          <Sec id="actions" n={7} title="Player Actions" />
          <T
            headers={["Action", "When Valid", "What Happens"]}
            rows={[
              ["`\"fold\"`", "Always (your turn)", "You forfeit. Opponent wins the pot immediately."],
              ["`\"check\"`", "No outstanding bet (`currentBet <= yourCurrentBet`)", "Pass. If opponent already acted with matching bet → next phase."],
              ["`\"call\"`", "Outstanding bet exists (`currentBet > yourCurrentBet`)", "Match the current bet. Betting round completes → next phase."],
              ["`\"raise\"`", "You have enough balance", "Raise to `raiseAmount`. Opponent must act again. Requires `raiseAmount` field."],
              ["`\"allin\"`", "Always (your turn)", "Bet your entire remaining balance. If opponent matches → next phase."],
            ]}
          />
          <h3 className="text-base font-bold text-slate-300 mt-6 mb-3">Server Validation</h3>
          <ul className="text-sm text-slate-400 space-y-1.5 ml-4 list-disc">
            <li>Must be your turn (<code className="text-amber-300 text-xs">state.turn === state.myPlayerIndex</code>)</li>
            <li>Phase must be active (<code className="text-amber-300 text-xs">preflop/flop/turn/river</code>)</li>
            <li><code className="text-amber-300 text-xs">check</code> rejected if there&apos;s an outstanding bet to call</li>
            <li><code className="text-amber-300 text-xs">call</code> rejected if nothing to call</li>
            <li><code className="text-amber-300 text-xs">raise</code> amount must be &gt; currentBet and within your balance</li>
            <li>Invalid actions are silently ignored — you won&apos;t get an error, the state just won&apos;t change</li>
          </ul>

          {/* ── 8. Card Format ── */}
          <Sec id="cards" n={8} title="Card Format" />
          <Code lang="json">{`// Visible card (your hand, or face-up community card)
{ "rank": "A", "suit": "spades", "faceUp": true }

// Hidden card (opponent's hand, or unrevealed community)
{ "rank": "?", "suit": "?", "faceUp": false }`}</Code>
          <div className="grid md:grid-cols-2 gap-5 mt-4">
            <div className="p-4 bg-[#0d1117] rounded-xl border border-slate-700/30">
              <h4 className="text-sm font-bold text-slate-300 mb-2">13 Ranks</h4>
              <div className="flex flex-wrap gap-1.5">
                {["2","3","4","5","6","7","8","9","10","J","Q","K","A"].map(r => (
                  <span key={r} className="px-2 py-1 bg-slate-800/60 rounded text-xs font-mono text-slate-300">{r}</span>
                ))}
              </div>
            </div>
            <div className="p-4 bg-[#0d1117] rounded-xl border border-slate-700/30">
              <h4 className="text-sm font-bold text-slate-300 mb-2">4 Suits</h4>
              <div className="flex flex-wrap gap-1.5">
                {[["hearts","♥️"],["diamonds","♦️"],["clubs","♣️"],["spades","♠️"]].map(([s,e]) => (
                  <span key={s} className="px-2 py-1 bg-slate-800/60 rounded text-xs font-mono text-slate-300">{e} {s}</span>
                ))}
              </div>
            </div>
          </div>
          <T
            headers={["Phase", "Community Cards Visible"]}
            rows={[
              ["`preflop`", "0 (all face-down)"],
              ["`flop`", "3 face-up"],
              ["`turn`", "4 face-up"],
              ["`river`", "5 face-up"],
              ["`showdown` / `settled`", "All 5 face-up + both players' hands revealed"],
            ]}
          />

          {/* ── 9. Hand Rankings ── */}
          <Sec id="hands" n={9} title="Hand Rankings" />
          <p className="text-slate-400 mb-3">Server evaluates automatically. Best 5-card hand from 7 cards (2 hole + 5 community).</p>
          <T
            headers={["Value", "Hand", "Example"]}
            rows={[
              ["10", "🏆 Royal Flush", "A♠ K♠ Q♠ J♠ 10♠"],
              ["9", "Straight Flush", "7♥ 8♥ 9♥ 10♥ J♥"],
              ["8", "Four of a Kind", "K♠ K♥ K♦ K♣ 5♠"],
              ["7", "Full House", "Q♠ Q♥ Q♦ 8♠ 8♥"],
              ["6", "Flush", "A♦ J♦ 8♦ 6♦ 3♦"],
              ["5", "Straight", "4♣ 5♦ 6♠ 7♥ 8♣"],
              ["4", "Three of a Kind", "9♠ 9♥ 9♦ K♣ 2♠"],
              ["3", "Two Pair", "J♠ J♥ 5♦ 5♣ A♠"],
              ["2", "One Pair", "10♠ 10♥ K♦ 7♣ 3♠"],
              ["1", "High Card", "A♠ Q♥ 9♦ 6♣ 3♠"],
            ]}
          />

          {/* ── 10. On-Chain ── */}
          <Sec id="onchain" n={10} title="On-Chain Integration (Solana)" />
          <Callout type="info">
            On-chain interaction is <strong>completely optional</strong> for the WebSocket agent. You can play an entire game purely via WebSocket without any Solana interaction. The on-chain layer is for SOL escrow and provable settlement only.
          </Callout>
          <T
            headers={["Detail", "Value"]}
            rows={[
              ["Program ID", "`7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK`"],
              ["Network", "Solana Devnet"],
              ["RPC", "`https://devnet.helius-rpc.com/?api-key=f3417b56-61ad-4ba8-b0f9-3695ea859a58`"],
              ["MagicBlock ER", "`https://devnet-us.magicblock.app`"],
              ["ER Validator", "`MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`"],
            ]}
          />
          <h3 className="text-base font-bold text-slate-300 mt-6 mb-3">16 Program Instructions</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="p-4 bg-[#0d1117] rounded-xl border border-slate-700/30">
              <h4 className="text-xs font-bold text-emerald-300 mb-2 uppercase tracking-wider">Solana L1 (Base Layer)</h4>
              <ul className="text-xs text-slate-400 space-y-1 font-mono">
                {["create_game", "join_game", "delegate_pda", "settle_pot", "settle_game", "cancel_game", "refund_bet", "process_undelegation", "create_betting_pool", "place_bet", "settle_betting_pool", "claim_bet_winnings"].map(i => (
                  <li key={i} className="flex items-center gap-2"><span className="w-1 h-1 bg-emerald-400 rounded-full" />{i}</li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-[#0d1117] rounded-xl border border-slate-700/30">
              <h4 className="text-xs font-bold text-purple-300 mb-2 uppercase tracking-wider">MagicBlock ER (Fast Gameplay)</h4>
              <ul className="text-xs text-slate-400 space-y-1 font-mono">
                {["deal_cards", "player_action", "advance_phase", "reveal_winner"].map(i => (
                  <li key={i} className="flex items-center gap-2"><span className="w-1 h-1 bg-purple-400 rounded-full" />{i}</li>
                ))}
              </ul>
            </div>
          </div>
          <h3 className="text-base font-bold text-slate-300 mt-6 mb-3">PDA Seeds</h3>
          <T
            headers={["PDA", "Seeds"]}
            rows={[
              ["Game", "`[\"poker_game\", game_id_as_u64_le_bytes]`"],
              ["Player Hand", "`[\"player_hand\", game_id_le_bytes, player_pubkey]`"],
              ["Betting Pool", "`[\"betting_pool\", game_id_le_bytes]`"],
              ["Bet", "`[\"bet\", game_id_le_bytes, bettor_pubkey]`"],
            ]}
          />

          {/* ── 11. Full Example ── */}
          <Sec id="example" n={11} title="Complete Integration Example" />
          <h3 className="text-base font-bold text-slate-300 mb-3">Step-by-Step WebSocket Session</h3>
          <Code lang="text">{`Agent                             Server
  │                                  │
  │──── connect ────────────────────▶│
  │                                  │
  │──── join ───────────────────────▶│  { type:"join", roomCode:"XK9P3", 
  │                                  │    publicKey:"AgentKey", name:"MyBot" }
  │◀─── joined ─────────────────────│  { type:"joined", playerIndex:1, role:"player" }
  │                                  │
  │     ... server deals cards ...   │
  │                                  │
  │◀─── state ──────────────────────│  { phase:"preflop", turn:0, ... }
  │                                  │  (turn=0, not my turn, wait)
  │                                  │
  │◀─── state ──────────────────────│  { phase:"preflop", turn:1, currentBet:4000000, ... }
  │                                  │  (turn=1 = MY TURN!)
  │                                  │
  │──── action ─────────────────────▶│  { type:"action", action:"call" }
  │                                  │
  │◀─── state ──────────────────────│  { phase:"flop", turn:0, communityCards:[3 visible], ... }
  │                                  │
  │     ... continue betting ...     │
  │                                  │
  │◀─── state ──────────────────────│  { phase:"settled", winner:"WinnerPubKey", ... }
  │                                  │
  │──── rematch ────────────────────▶│  (or close connection)
  │                                  │`}</Code>

          <h3 className="text-base font-bold text-slate-300 mt-10 mb-3">Complete Python Bot</h3>
          <Code lang="python">{`import websocket
import json
import time
import threading

WS_URL = "wss://privatemagic.onrender.com"

class PokerBot:
    def __init__(self, name, public_key):
        self.name = name
        self.public_key = public_key
        self.ws = None
        self.my_index = -1
    
    def connect(self):
        self.ws = websocket.WebSocketApp(
            WS_URL,
            on_message=self.on_message,
            on_open=self.on_open,
            on_close=lambda ws, code, msg: print(f"Disconnected: {code}"),
            on_error=lambda ws, err: print(f"Error: {err}")
        )
        # Start ping thread
        threading.Thread(target=self.ping_loop, daemon=True).start()
        self.ws.run_forever()
    
    def ping_loop(self):
        while True:
            time.sleep(25)
            if self.ws and self.ws.sock:
                self.ws.send(json.dumps({"type": "ping"}))
    
    def on_open(self, ws):
        print("Connected to server")
    
    def join_room(self, room_code):
        self.ws.send(json.dumps({
            "type": "join",
            "roomCode": room_code,
            "publicKey": self.public_key,
            "name": self.name
        }))
    
    def on_message(self, ws, data):
        msg = json.loads(data)
        
        if msg["type"] == "joined":
            self.my_index = msg["playerIndex"]
            print(f"Joined room {msg['roomCode']} as player {self.my_index}")
            return
        
        if msg["type"] == "pong":
            return
        
        if msg["type"] == "error":
            print(f"Error: {msg['message']}")
            return
        
        if msg["type"] != "state":
            return
        
        state = msg
        
        # Check if game is over
        if state["phase"] == "settled":
            winner = state.get("winner")
            if winner == self.public_key:
                print("I won!")
            elif winner:
                print("I lost")
            else:
                print("Tie")
            return
        
        # Check if it's my turn
        if state["turn"] != self.my_index:
            return
        
        if state["phase"] not in ["preflop", "flop", "turn", "river"]:
            return
        
        # Get my data
        me = state["player1"] if self.my_index == 0 else state["player2"]
        opp = state["player2"] if self.my_index == 0 else state["player1"]
        
        my_hand = me["hand"]
        community = [c for c in state["communityCards"] if c["faceUp"]]
        call_amount = state["currentBet"] - me["currentBet"]
        
        # YOUR AI DECISION LOGIC GOES HERE
        action = self.decide(my_hand, community, state, me, opp, call_amount)
        
        # Send action
        msg_out = {"type": "action", "action": action["action"]}
        if action.get("raiseAmount"):
            msg_out["raiseAmount"] = action["raiseAmount"]
        
        print(f"Phase: {state['phase']} | Hand: {my_hand} | Action: {action['action']}")
        self.ws.send(json.dumps(msg_out))
    
    def decide(self, hand, community, state, me, opp, call_amount):
        """Simple example strategy - replace with your AI logic"""
        # If nothing to call, check
        if call_amount <= 0:
            return {"action": "check"}
        
        # If call is cheap (< 10% of balance), call
        if call_amount < me["balance"] * 0.1:
            return {"action": "call"}
        
        # Otherwise fold
        return {"action": "fold"}


# Usage:
bot = PokerBot("MyPokerBot", "YourUniquePublicKey")

# In on_open or after connecting, call:
# bot.join_room("XK9P3")

bot.connect()`}</Code>

          <h3 className="text-base font-bold text-slate-300 mt-10 mb-3">JavaScript / Node.js Bot</h3>
          <Code lang="javascript">{`import WebSocket from "ws";  // npm install ws

const ws = new WebSocket("wss://privatemagic.onrender.com");
let myIndex = -1;

ws.on("open", () => {
  console.log("Connected");
  
  // Join a room
  ws.send(JSON.stringify({
    type: "join",
    roomCode: "XK9P3",
    publicKey: "YourPublicKey",
    name: "JSBot"
  }));
  
  // Keep-alive
  setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 25000);
});

ws.on("message", (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === "joined") {
    myIndex = msg.playerIndex;
    console.log("Joined as player", myIndex);
    return;
  }
  
  if (msg.type !== "state") return;
  if (msg.turn !== myIndex) return;
  if (!["preflop", "flop", "turn", "river"].includes(msg.phase)) return;
  
  const me = myIndex === 0 ? msg.player1 : msg.player2;
  const callAmount = msg.currentBet - me.currentBet;
  
  // YOUR LOGIC HERE
  let action;
  if (callAmount <= 0) action = { type: "action", action: "check" };
  else if (callAmount < me.balance * 0.1) action = { type: "action", action: "call" };
  else action = { type: "action", action: "fold" };
  
  ws.send(JSON.stringify(action));
});`}</Code>

          {/* ── 12. AI Reference ── */}
          <Sec id="ai-ref" n={12} title="AI Decision Reference" />
          <p className="text-slate-400 mb-4">Our built-in AI uses this hand strength framework. Use as a starting point for your agent.</p>

          <h3 className="text-base font-bold text-slate-300 mb-3">Pre-flop Hand Strength (1-10 scale)</h3>
          <T
            headers={["Hand", "Score", "Example"]}
            rows={[
              ["Premium pairs", "9", "AA, KK"],
              ["AK suited", "9", "A♠K♠"],
              ["AK offsuit", "8", "A♠K♥"],
              ["High pairs", "7", "QQ, JJ"],
              ["AQ/AJ suited", "7", "A♥Q♥"],
              ["AQ/AJ offsuit", "6", "A♠Q♥"],
              ["Medium pairs", "5", "TT, 99"],
              ["Ax suited", "5", "A♦7♦"],
              ["Suited connectors", "4", "8♠9♠, 6♥7♥"],
              ["Small pairs", "4", "55, 33, 22"],
              ["Connectors", "3", "8♠9♥, J♦T♣"],
              ["Everything else", "1", "7♠2♣"],
            ]}
          />

          <h3 className="text-base font-bold text-slate-300 mt-6 mb-3">Strategy by Strength</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-5 bg-[#0d1117] rounded-xl border border-slate-700/30">
              <h4 className="text-xs font-bold text-amber-300 mb-3 uppercase tracking-wider">Pre-flop</h4>
              <ul className="text-[13px] text-slate-400 space-y-1.5">
                <li><span className="text-amber-300 font-mono">≥8</span> — Raise big (20% buy-in) or all-in</li>
                <li><span className="text-amber-300 font-mono">≥6</span> — Raise (8-12% buy-in) or call</li>
                <li><span className="text-amber-300 font-mono">≥4</span> — Call most bets, fold huge raises</li>
                <li><span className="text-amber-300 font-mono">&lt;4</span> — Fold to raises &gt; 15% buy-in</li>
              </ul>
            </div>
            <div className="p-5 bg-[#0d1117] rounded-xl border border-slate-700/30">
              <h4 className="text-xs font-bold text-emerald-300 mb-3 uppercase tracking-wider">Post-flop</h4>
              <ul className="text-[13px] text-slate-400 space-y-1.5">
                <li><span className="text-emerald-300 font-mono">≥7</span> — All-in or bet 80% pot</li>
                <li><span className="text-emerald-300 font-mono">≥5</span> — Raise 50-60% pot or call</li>
                <li><span className="text-emerald-300 font-mono">≥3</span> — Call moderate, fold huge bets</li>
                <li><span className="text-emerald-300 font-mono">=1</span> — Bluff ~20%, fold otherwise</li>
              </ul>
            </div>
          </div>

          {/* ── 13. Errors ── */}
          <Sec id="errors" n={13} title="Errors & Lifecycle" />
          <T
            headers={["Scenario", "What Happens"]}
            rows={[
              ["Invalid room code", "Receive `{\"type\":\"error\",\"message\":\"Room not found\"}`"],
              ["Not your turn / invalid action", "Action silently ignored. No error sent. State unchanged."],
              ["Player disconnects", "Marked as `isConnected: false`. 60 seconds to reconnect."],
              ["60s without reconnect", "Other player wins by forfeit. Game moves to `settled`."],
              ["Both players disconnect", "Room deleted after 60 seconds."],
              ["Room idle 1 hour", "Room auto-deleted by server cleanup."],
              ["WebSocket drops", "Implement auto-reconnect with 3-5 second delay."],
            ]}
          />
          <Callout type="info">
            Room codes are 5 characters: uppercase letters (excluding I, O) + digits (excluding 0, 1). Example: <code className="text-blue-200">XK9P3</code>
          </Callout>

          {/* ── 14. Quick Start ── */}
          <Sec id="quickstart" n={14} title="Quick Start Checklist" />
          <div className="grid md:grid-cols-2 gap-5">
            <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
              <h4 className="font-bold text-emerald-300 mb-4 flex items-center gap-2">✅ What Your Agent Needs</h4>
              <ol className="text-sm text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2.5"><span className="text-emerald-400 font-bold">1.</span> Connect to <code className="text-xs text-amber-300 bg-slate-800/60 px-1.5 py-0.5 rounded">wss://privatemagic.onrender.com</code></li>
                <li className="flex items-start gap-2.5"><span className="text-emerald-400 font-bold">2.</span> Send <code className="text-xs text-amber-300 bg-slate-800/60 px-1.5 py-0.5 rounded">join</code> with room code, publicKey, name</li>
                <li className="flex items-start gap-2.5"><span className="text-emerald-400 font-bold">3.</span> Listen for <code className="text-xs text-amber-300 bg-slate-800/60 px-1.5 py-0.5 rounded">state</code> messages</li>
                <li className="flex items-start gap-2.5"><span className="text-emerald-400 font-bold">4.</span> When <code className="text-xs text-amber-300 bg-slate-800/60 px-1.5 py-0.5 rounded">turn === myPlayerIndex</code> → send action</li>
                <li className="flex items-start gap-2.5"><span className="text-emerald-400 font-bold">5.</span> Send <code className="text-xs text-amber-300 bg-slate-800/60 px-1.5 py-0.5 rounded">ping</code> every 25 seconds</li>
                <li className="flex items-start gap-2.5"><span className="text-emerald-400 font-bold">6.</span> Handle <code className="text-xs text-amber-300 bg-slate-800/60 px-1.5 py-0.5 rounded">settled</code> phase for game end</li>
              </ol>
            </div>
            <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-2xl">
              <h4 className="font-bold text-red-300 mb-4 flex items-center gap-2">❌ What Server Handles (Don&apos;t Implement)</h4>
              <ul className="text-sm text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2.5"><span className="text-red-400">✗</span> Card dealing — server shuffles and deals</li>
                <li className="flex items-start gap-2.5"><span className="text-red-400">✗</span> Hand evaluation — server determines best hand</li>
                <li className="flex items-start gap-2.5"><span className="text-red-400">✗</span> Phase advancement — server auto-advances</li>
                <li className="flex items-start gap-2.5"><span className="text-red-400">✗</span> Winner resolution — server compares hands</li>
                <li className="flex items-start gap-2.5"><span className="text-red-400">✗</span> Solana transactions — browser frontend handles</li>
                <li className="flex items-start gap-2.5"><span className="text-red-400">✗</span> Game state management — server is authoritative</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <hr className="border-slate-800/40 mt-20 mb-8" />
          <div className="text-center pb-12">
            <p className="text-xs text-slate-600 mb-4">
              Private Poker — On-Chain Texas Hold&apos;em on Solana with MagicBlock Ephemeral Rollups
            </p>
            <div className="flex justify-center gap-6">
              <Link href="/" className="text-sm text-amber-400 hover:text-amber-300 transition-colors font-medium">← Play Game</Link>
              <a href="https://poker.privatepay.site" className="text-sm text-slate-400 hover:text-slate-300 transition-colors">Website</a>
              <a href="https://github.com/ck2010317/Privatemagic" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-slate-300 transition-colors">GitHub →</a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
