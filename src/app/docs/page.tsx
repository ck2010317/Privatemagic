"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

// ─── Table of Contents Sections ─────────────────────────
const TOC = [
  { id: "overview", title: "Architecture Overview" },
  { id: "connection", title: "Connection Details" },
  { id: "protocol", title: "WebSocket Protocol" },
  { id: "flow", title: "Game Flow" },
  { id: "client-messages", title: "Client → Server Messages" },
  { id: "server-messages", title: "Server → Client Messages" },
  { id: "state", title: "Game State Object" },
  { id: "actions", title: "Player Actions" },
  { id: "cards", title: "Card Format" },
  { id: "hands", title: "Hand Rankings" },
  { id: "onchain", title: "On-Chain Integration" },
  { id: "betting", title: "Betting System" },
  { id: "example", title: "Complete Example" },
  { id: "ai-reference", title: "AI Decision Reference" },
  { id: "errors", title: "Error Handling" },
  { id: "quickstart", title: "Quick Start" },
];

function CodeBlock({ children, language }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group my-4">
      <button
        onClick={copy}
        className="absolute top-3 right-3 px-2 py-1 text-[10px] bg-slate-700/50 text-slate-400 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-600/50"
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
      {language && (
        <span className="absolute top-3 left-4 text-[10px] text-slate-500 uppercase tracking-wider">{language}</span>
      )}
      <pre className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4 pt-8 overflow-x-auto text-sm font-mono text-slate-300 leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-4 py-3 bg-slate-800/60 border border-slate-700/50 text-slate-300 font-semibold text-xs uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-slate-800/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2.5 border border-slate-700/30 text-slate-400">
                  <span dangerouslySetInnerHTML={{ __html: cell.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded text-xs font-mono">$1</code>') }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({ id, number, title }: { id: string; number: number; title: string }) {
  return (
    <h2 id={id} className="text-2xl font-black mt-16 mb-6 flex items-center gap-3 scroll-mt-24">
      <span className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 text-black text-sm font-black rounded-lg">
        {number}
      </span>
      <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-300">{title}</span>
    </h2>
  );
}

function Badge({ children, color = "amber" }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    red: "bg-red-500/10 text-red-300 border-red-500/20",
    purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border ${colors[color]}`}>
      {children}
    </span>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <nav className="sticky top-0 z-50 flex justify-between items-center px-6 py-4 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/50">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="text-2xl">🃏</span>
          <span className="text-lg font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-500">
            PRIVATE POKER
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 hidden md:block">API Documentation</span>
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700/50"
          >
            ← Back to Game
          </Link>
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block w-64 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto border-r border-slate-800/50 p-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">On this page</h3>
          <ul className="space-y-1">
            {TOC.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={() => setActiveSection(item.id)}
                  className={`block text-sm px-3 py-1.5 rounded-lg transition-all ${
                    activeSection === item.id
                      ? "text-amber-300 bg-amber-500/10 font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main Content */}
        <main className="flex-1 max-w-4xl mx-auto px-6 md:px-12 py-12">
          {/* Hero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <Badge color="green">v1.0.0</Badge>
              <Badge color="blue">Solana Devnet</Badge>
              <Badge color="purple">WebSocket</Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-4">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-orange-300 to-red-400">
                API Documentation
              </span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed max-w-2xl">
              Everything you need to build bots, AI agents, or custom clients that connect to Private Poker.
              The game uses a simple WebSocket JSON protocol — connect, join, and play.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                <span className="text-xs text-slate-500">WebSocket</span>
                <code className="text-xs text-emerald-300 font-mono">wss://privatemagic.onrender.com</code>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700/30">
                <span className="text-xs text-slate-500">Program</span>
                <code className="text-xs text-amber-300 font-mono">7qRu72w...zkqK</code>
              </div>
            </div>
          </motion.div>

          <hr className="border-slate-800/50 mb-8" />

          {/* Section 1: Architecture */}
          <SectionHeader id="overview" number={1} title="Architecture Overview" />
          <p className="text-slate-400 mb-4">
            Private Poker uses a <strong className="text-slate-200">WebSocket game server</strong> for real-time multiplayer, with an optional <strong className="text-slate-200">Solana on-chain layer</strong> for escrow and settlement via MagicBlock Ephemeral Rollups.
          </p>
          <CodeBlock language="diagram">{`┌──────────────────────────────────────────────────┐
│                                                  │
│   AI Agent / Bot         Human Player (Browser)  │
│        │                       │                 │
│        └── WebSocket (JSON) ──┐│                 │
│                               ▼▼                 │
│                    ┌──────────────────┐           │
│                    │  WebSocket Server│           │
│                    │  (Node.js)       │           │
│                    │                  │           │
│                    │ • Room mgmt     │           │
│                    │ • Card dealing  │           │
│                    │ • Action relay  │           │
│                    │ • Hand eval     │           │
│                    │ • Winner logic  │           │
│                    └────────┬─────────┘           │
│                             │                    │
│                    ┌────────▼─────────┐           │
│                    │ Solana Blockchain│           │
│                    │ (optional)       │           │
│                    │                  │           │
│                    │ • SOL escrow     │           │
│                    │ • Winner payout  │           │
│                    │ • MagicBlock ER  │           │
│                    └──────────────────┘           │
│                                                  │
└──────────────────────────────────────────────────┘`}</CodeBlock>
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-sm text-emerald-300 mb-6">
            <strong>Key:</strong> Your bot interacts <strong>only via WebSocket</strong>. The server handles all card dealing, action validation, and winner determination. No Solana interaction needed for gameplay.
          </div>

          {/* Section 2: Connection */}
          <SectionHeader id="connection" number={2} title="Connection Details" />
          <Table
            headers={["Item", "Value"]}
            rows={[
              ["WebSocket URL", "`wss://privatemagic.onrender.com`"],
              ["Protocol", "Standard WebSocket (RFC 6455)"],
              ["Message Format", "JSON (UTF-8)"],
              ["Keep-Alive", "Send `{\"type\":\"ping\"}` every 25s"],
              ["Connection Timeout", "15 seconds"],
              ["Disconnect Forfeit", "60 seconds without reconnection"],
            ]}
          />

          {/* Section 3: Protocol */}
          <SectionHeader id="protocol" number={3} title="WebSocket Protocol" />
          <p className="text-slate-400 mb-4">All messages are JSON objects with a <code className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded text-xs font-mono">type</code> field.</p>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div>
              <h4 className="text-sm font-bold text-slate-300 mb-2">Sending</h4>
              <CodeBlock language="javascript">{`ws.send(JSON.stringify({ 
  type: "<message_type>", 
  ...params 
}));`}</CodeBlock>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-300 mb-2">Receiving</h4>
              <CodeBlock language="javascript">{`ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type = "state" | "created" 
  //           | "joined" | "error" | "pong"
};`}</CodeBlock>
            </div>
          </div>

          {/* Section 4: Game Flow */}
          <SectionHeader id="flow" number={4} title="Game Flow" />
          <CodeBlock language="diagram">{`Create → Waiting → Preflop → Flop → Turn → River → Showdown → Settled
  P1      P2 joins   Blinds   3 cards  4 cards  5 cards  Evaluate   Done
 creates              posted   revealed revealed revealed  winner    rematch?`}</CodeBlock>
          <div className="space-y-3 mt-4">
            {[
              { step: "1", text: "Player 1 sends `create` → receives `created` with room code" },
              { step: "2", text: "Player 2 sends `join` with room code → receives `joined`" },
              { step: "3", text: "Server auto-deals cards after ~1.5 seconds" },
              { step: "4", text: "Both players receive `state` updates with phase `preflop`" },
              { step: "5", text: "Players take turns sending `action` (fold/check/call/raise/allin)" },
              { step: "6", text: "Server advances phases automatically when betting rounds complete" },
              { step: "7", text: "At showdown, server evaluates hands and determines winner" },
              { step: "8", text: "Game reaches `settled` — players can `rematch` or disconnect" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-amber-500/10 text-amber-300 text-xs font-bold rounded-full border border-amber-500/20">
                  {item.step}
                </span>
                <p className="text-sm text-slate-400" dangerouslySetInnerHTML={{ __html: item.text.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded text-xs font-mono">$1</code>') }} />
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl text-sm text-slate-400">
            <strong className="text-slate-300">Heads-Up Rules:</strong> 2 players only. Small blind = 2% of buy-in. Big blind = 2× small blind. Dealer acts first preflop, second post-flop.
          </div>

          {/* Section 5: Client → Server Messages */}
          <SectionHeader id="client-messages" number={5} title="Client → Server Messages" />

          {/* create */}
          <h3 className="text-lg font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Badge color="green">create</Badge> Create a New Game Room
          </h3>
          <CodeBlock language="json">{`{
  "type": "create",
  "buyIn": 100000000,
  "publicKey": "YourSolanaPublicKeyBase58",
  "name": "MyBot",
  "onChainGameId": null
}`}</CodeBlock>
          <Table
            headers={["Field", "Type", "Required", "Description"]}
            rows={[
              ["`type`", '`"create"`', "✅", "Message type"],
              ["`buyIn`", "`number`", "✅", "Buy-in in **lamports** (1 SOL = 1,000,000,000)"],
              ["`publicKey`", "`string`", "✅", "Solana wallet public key (Base58)"],
              ["`name`", "`string`", "✅", "Display name"],
              ["`onChainGameId`", "`number | null`", "❌", "On-chain game ID if created on Solana first"],
            ]}
          />

          {/* join */}
          <h3 className="text-lg font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Badge color="green">join</Badge> Join an Existing Room
          </h3>
          <CodeBlock language="json">{`{
  "type": "join",
  "roomCode": "ABC12",
  "publicKey": "YourSolanaPublicKeyBase58",
  "name": "MyBot"
}`}</CodeBlock>
          <Table
            headers={["Field", "Type", "Required", "Description"]}
            rows={[
              ["`type`", '`"join"`', "✅", "Message type"],
              ["`roomCode`", "`string`", "✅", "5-character room code (case-insensitive)"],
              ["`publicKey`", "`string`", "✅", "Solana wallet public key (Base58)"],
              ["`name`", "`string`", "✅", "Display name"],
            ]}
          />
          <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs text-blue-300 mt-2">
            If the room already has 2 players, you join as a <strong>spectator</strong> (playerIndex: -1). Spectators cannot perform actions.
          </div>

          {/* action */}
          <h3 className="text-lg font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Badge color="amber">action</Badge> Perform a Game Action
          </h3>
          <CodeBlock language="json">{`{
  "type": "action",
  "action": "raise",
  "raiseAmount": 5000000
}`}</CodeBlock>
          <Table
            headers={["Field", "Type", "Required", "Description"]}
            rows={[
              ["`type`", '`"action"`', "✅", "Message type"],
              ["`action`", "`string`", "✅", '`"fold"` `"check"` `"call"` `"raise"` `"allin"`'],
              ["`raiseAmount`", "`number`", "❌", "Required for `raise`. **Total** bet amount (not increment). In lamports."],
            ]}
          />

          {/* bet */}
          <h3 className="text-lg font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Badge color="purple">bet</Badge> Place a Spectator Bet
          </h3>
          <CodeBlock language="json">{`{
  "type": "bet",
  "publicKey": "BettorPublicKey",
  "name": "BettorName",
  "betOnPlayer": 1,
  "amount": 1000000
}`}</CodeBlock>

          {/* rematch / ping */}
          <h3 className="text-lg font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Badge color="blue">rematch</Badge> / <Badge color="blue">ping</Badge> Other Messages
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <CodeBlock language="json">{`{ "type": "rematch" }`}</CodeBlock>
              <p className="text-xs text-slate-500">Valid only when game is settled. Resets with swapped dealer.</p>
            </div>
            <div>
              <CodeBlock language="json">{`{ "type": "ping" }`}</CodeBlock>
              <p className="text-xs text-slate-500">Keep-alive. Server responds with <code className="text-amber-300">pong</code>.</p>
            </div>
          </div>

          {/* Section 6: Server → Client Messages */}
          <SectionHeader id="server-messages" number={6} title="Server → Client Messages" />

          <h3 className="text-lg font-bold text-slate-200 mt-6 mb-3 flex items-center gap-2">
            <Badge color="green">created</Badge> Room Created
          </h3>
          <CodeBlock language="json">{`{
  "type": "created",
  "roomCode": "XK9P3",
  "playerIndex": 0
}`}</CodeBlock>

          <h3 className="text-lg font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Badge color="green">joined</Badge> Joined Room
          </h3>
          <CodeBlock language="json">{`{
  "type": "joined",
  "roomCode": "XK9P3",
  "playerIndex": 1,
  "role": "player",
  "onChainGameId": null,
  "buyIn": 100000000
}`}</CodeBlock>

          <h3 className="text-lg font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Badge color="amber">state</Badge> Game State Update <span className="text-xs text-slate-500 font-normal">(primary message)</span>
          </h3>
          <p className="text-sm text-slate-400 mb-3">Sent after every action, phase change, or connection event. This is the main message you&apos;ll process.</p>
          <CodeBlock language="json">{`{
  "type": "state",
  "gameId": "XK9P3",
  "phase": "flop",
  "pot": 10000000,
  "buyIn": 100000000,
  "currentBet": 4000000,
  "dealer": 0,
  "turn": 1,
  "communityCards": [
    {"rank": "K", "suit": "hearts", "faceUp": true},
    {"rank": "7", "suit": "spades", "faceUp": true},
    {"rank": "2", "suit": "diamonds", "faceUp": true},
    {"rank": "?", "suit": "?", "faceUp": false},
    {"rank": "?", "suit": "?", "faceUp": false}
  ],
  "player1": { ... },
  "player2": { ... },
  "myPlayerIndex": 1,
  "winner": null,
  "showCards": false,
  "lastAction": "Player1 raises 📈",
  "bettingPool": { ... },
  "onChainGameId": null,
  "isDelegated": false
}`}</CodeBlock>

          <h3 className="text-lg font-bold text-slate-200 mt-8 mb-3 flex items-center gap-2">
            <Badge color="red">error</Badge> Error
          </h3>
          <CodeBlock language="json">{`{ "type": "error", "message": "Room not found" }`}</CodeBlock>

          {/* Section 7: Game State */}
          <SectionHeader id="state" number={7} title="Game State Object" />
          <h3 className="text-base font-bold text-slate-300 mb-3">Key Fields for Decision Making</h3>
          <Table
            headers={["Field", "Type", "Description"]}
            rows={[
              ["`phase`", "`string`", "`waiting` `preflop` `flop` `turn` `river` `showdown` `settled`"],
              ["`pot`", "`number`", "Total pot in lamports"],
              ["`currentBet`", "`number`", "Current bet to match (lamports)"],
              ["`turn`", "`0 | 1`", "Whose turn it is (0 = player1, 1 = player2)"],
              ["`myPlayerIndex`", "`0 | 1 | -1`", "Your player index. **Check `turn === myPlayerIndex`**"],
              ["`dealer`", "`0 | 1`", "Dealer button position"],
              ["`buyIn`", "`number`", "Buy-in amount in lamports"],
            ]}
          />

          <h3 className="text-base font-bold text-slate-300 mt-8 mb-3">Player Object</h3>
          <Table
            headers={["Field", "Type", "Description"]}
            rows={[
              ["`hand`", "`Card[]`", "Your cards (visible). Opponent shows `rank:\"?\"` until showdown"],
              ["`balance`", "`number`", "Remaining balance (lamports)"],
              ["`currentBet`", "`number`", "Current bet this round"],
              ["`totalBet`", "`number`", "Total bet across all rounds"],
              ["`hasFolded`", "`boolean`", "Whether player has folded"],
              ["`isAllIn`", "`boolean`", "Whether player is all-in"],
              ["`isConnected`", "`boolean`", "Whether player is still connected"],
              ["`hasActedThisRound`", "`boolean`", "Whether player has acted this betting round"],
            ]}
          />

          <h3 className="text-base font-bold text-slate-300 mt-8 mb-3">How to Check if It&apos;s Your Turn</h3>
          <CodeBlock language="javascript">{`const isMyTurn = (state.turn === state.myPlayerIndex);
const isActivePhase = ["preflop", "flop", "turn", "river"].includes(state.phase);
const canAct = isMyTurn && isActivePhase;

// Get your hand
const myPlayer = state.myPlayerIndex === 0 ? state.player1 : state.player2;
const myHand = myPlayer.hand; // [{rank: "A", suit: "spades", faceUp: true}, ...]`}</CodeBlock>

          {/* Section 8: Actions */}
          <SectionHeader id="actions" number={8} title="Player Actions" />
          <Table
            headers={["Action", "When Valid", "Effect"]}
            rows={[
              ["`fold`", "Any time it's your turn", "Forfeit. Opponent wins pot."],
              ["`check`", "`currentBet <= yourCurrentBet`", "Pass without betting"],
              ["`call`", "`currentBet > yourCurrentBet`", "Match the current bet"],
              ["`raise`", "Sufficient balance", "Raise to new amount (provide `raiseAmount`)"],
              ["`allin`", "Any time", "Bet entire remaining balance"],
            ]}
          />
          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-sm text-amber-300 mt-4">
            <strong>raiseAmount</strong> is the <strong>total bet</strong>, not the increment. If `currentBet = 4000000` and you want to raise by 2M more, send `raiseAmount: 6000000`.
          </div>

          {/* Section 9: Cards */}
          <SectionHeader id="cards" number={9} title="Card Format" />
          <CodeBlock language="json">{`{ "rank": "A", "suit": "hearts", "faceUp": true }

// Hidden card (opponent / unrevealed):
{ "rank": "?", "suit": "?", "faceUp": false }`}</CodeBlock>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <h4 className="text-sm font-bold text-slate-300 mb-2">Ranks</h4>
              <p className="text-xs text-slate-400 font-mono">&quot;2&quot; &quot;3&quot; &quot;4&quot; &quot;5&quot; &quot;6&quot; &quot;7&quot; &quot;8&quot; &quot;9&quot; &quot;10&quot; &quot;J&quot; &quot;Q&quot; &quot;K&quot; &quot;A&quot;</p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-300 mb-2">Suits</h4>
              <p className="text-xs text-slate-400 font-mono">&quot;hearts&quot; &quot;diamonds&quot; &quot;clubs&quot; &quot;spades&quot;</p>
            </div>
          </div>
          <Table
            headers={["Phase", "Visible Community Cards"]}
            rows={[
              ["`preflop`", "0 cards face-up"],
              ["`flop`", "3 cards face-up"],
              ["`turn`", "4 cards face-up"],
              ["`river`", "5 cards face-up"],
              ["`showdown`", "All 5 + both players' hands revealed"],
            ]}
          />

          {/* Section 10: Hands */}
          <SectionHeader id="hands" number={10} title="Hand Rankings" />
          <Table
            headers={["Value", "Hand", "Description"]}
            rows={[
              ["10", "Royal Flush", "A-K-Q-J-10 same suit"],
              ["9", "Straight Flush", "5 consecutive same suit"],
              ["8", "Four of a Kind", "4 cards same rank"],
              ["7", "Full House", "3 of a kind + pair"],
              ["6", "Flush", "5 cards same suit"],
              ["5", "Straight", "5 consecutive ranks"],
              ["4", "Three of a Kind", "3 cards same rank"],
              ["3", "Two Pair", "2 different pairs"],
              ["2", "One Pair", "2 cards same rank"],
              ["1", "High Card", "Highest card wins"],
            ]}
          />

          {/* Section 11: On-Chain */}
          <SectionHeader id="onchain" number={11} title="On-Chain Integration (Solana)" />
          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm text-blue-300 mb-6">
            On-chain interaction is <strong>optional</strong> for WebSocket gameplay. The agent can play purely via WebSocket.
            On-chain is only needed for SOL escrow and settlement.
          </div>
          <Table
            headers={["Item", "Value"]}
            rows={[
              ["Program ID", "`7qRu72wJ5AGcXkqnwXoNtkWt3Z6ZaJoyTQsEc5gzzkqK`"],
              ["Network", "Solana Devnet"],
              ["MagicBlock ER", "`https://devnet-us.magicblock.app`"],
              ["ER Validator", "`MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`"],
            ]}
          />
          <h3 className="text-base font-bold text-slate-300 mt-6 mb-3">Program Instructions (16 total)</h3>
          <Table
            headers={["#", "Instruction", "Layer", "Description"]}
            rows={[
              ["1", "`create_game`", "L1", "Create game + escrow SOL buy-in"],
              ["2", "`join_game`", "L1", "Join game + escrow SOL buy-in"],
              ["3", "`delegate_pda`", "L1", "Delegate to MagicBlock ER"],
              ["4", "`deal_cards`", "ER", "Deal hole + community cards"],
              ["5", "`player_action`", "ER", "Process player action"],
              ["6", "`advance_phase`", "ER", "Move to next phase"],
              ["7", "`reveal_winner`", "ER", "Evaluate hands, set winner, undelegate"],
              ["8", "`settle_pot`", "L1", "Transfer pot SOL to winner"],
              ["9", "`settle_game`", "L1", "Close game account"],
              ["10", "`cancel_game`", "L1", "Cancel + refund (P2 never joined)"],
              ["11", "`refund_bet`", "L1", "Refund unsettled bet"],
              ["12", "`process_undelegation`", "L1", "Process MagicBlock undelegation"],
              ["13", "`create_betting_pool`", "L1", "Create spectator pool"],
              ["14", "`place_bet`", "L1", "Bet on player 1 or 2"],
              ["15", "`settle_betting_pool`", "L1", "Settle pool after game"],
              ["16", "`claim_bet_winnings`", "L1", "Claim betting winnings"],
            ]}
          />
          <h3 className="text-base font-bold text-slate-300 mt-6 mb-3">On-Chain Game Flow</h3>
          <CodeBlock language="diagram">{`L1: create_game → join_game → delegate_pda
                                    │
                    ┌────────────────▼───────────────┐
                    │   MagicBlock ER (fast, gasless) │
                    │   deal → actions → advance →   │
                    │   reveal_winner (undelegates)   │
                    └────────────────┬───────────────┘
                                    │
L1: settle_pot → settle_game`}</CodeBlock>

          {/* Section 12: Betting */}
          <SectionHeader id="betting" number={12} title="Betting / Spectator System" />
          <p className="text-slate-400 mb-4">Spectators can bet on which player will win. The pool is tracked in the <code className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded text-xs font-mono">bettingPool</code> field of each state update.</p>
          <CodeBlock language="json">{`{
  "totalPoolPlayer1": 5000000,
  "totalPoolPlayer2": 3000000,
  "bets": [{
    "id": "bet_1234567890_0.123",
    "bettor": "PublicKey...",
    "bettorName": "Spectator1",
    "betOnPlayer": 1,
    "amount": 5000000,
    "timestamp": 1234567890123
  }],
  "isSettled": false,
  "winningPlayer": 0
}`}</CodeBlock>

          {/* Section 13: Example */}
          <SectionHeader id="example" number={13} title="Complete Flow Example" />
          <h3 className="text-base font-bold text-slate-300 mb-3">AI Agent Joins and Plays</h3>
          <CodeBlock language="text">{`1. Connect WebSocket
   → ws = new WebSocket("wss://privatemagic.onrender.com")

2. Join room (code shared by other player)
   → send: {"type":"join","roomCode":"XK9P3","publicKey":"AgentPubKey","name":"MyBot"}
   ← recv: {"type":"joined","roomCode":"XK9P3","playerIndex":1,"role":"player","buyIn":100000000}

3. Wait for deal (~1.5s after join)
   ← recv: {"type":"state","phase":"preflop","turn":0,...}
   (turn=0 means Player 1 acts first — wait)

4. Player 1 acts (you receive state update)
   ← recv: {"type":"state","phase":"preflop","turn":1,"currentBet":4000000,...}
   (turn=1 = YOUR turn! Check your hand + decide)

5. Your turn — send action
   → send: {"type":"action","action":"call"}
   ← recv: {"type":"state","phase":"flop","turn":0,...}

6. Continue through flop → turn → river...

7. Game ends
   ← recv: {"type":"state","phase":"settled","winner":"WinnerPubKey",...}

8. Rematch or disconnect
   → send: {"type":"rematch"}`}</CodeBlock>

          <h3 className="text-base font-bold text-slate-300 mt-8 mb-3">Python Bot Example</h3>
          <CodeBlock language="python">{`import websocket
import json

ws = websocket.WebSocket()
ws.connect("wss://privatemagic.onrender.com")

# Join a room
ws.send(json.dumps({
    "type": "join",
    "roomCode": "XK9P3",
    "publicKey": "YourSolanaPubKey",
    "name": "MyPokerBot"
}))

while True:
    msg = json.loads(ws.recv())
    
    if msg["type"] == "pong":
        continue
    
    if msg["type"] == "error":
        print(f"Error: {msg['message']}")
        continue
    
    if msg["type"] == "state":
        state = msg
        my_index = state["myPlayerIndex"]
        
        # Check if it's my turn
        if state["turn"] != my_index:
            continue
        
        # Only act during active phases
        if state["phase"] not in ["preflop", "flop", "turn", "river"]:
            continue
        
        # Get my player data
        my_player = state["player1"] if my_index == 0 else state["player2"]
        my_hand = my_player["hand"]
        community = [c for c in state["communityCards"] if c["faceUp"]]
        current_bet = state["currentBet"]
        my_bet = my_player["currentBet"]
        pot = state["pot"]
        balance = my_player["balance"]
        
        # === YOUR DECISION LOGIC HERE ===
        action, raise_amount = decide_action(
            my_hand, community, current_bet, my_bet, pot, balance
        )
        
        # Send action
        msg_out = {"type": "action", "action": action}
        if action == "raise" and raise_amount:
            msg_out["raiseAmount"] = raise_amount
        
        ws.send(json.dumps(msg_out))`}</CodeBlock>

          {/* Section 14: AI Reference */}
          <SectionHeader id="ai-reference" number={14} title="AI Decision Reference" />
          <p className="text-slate-400 mb-4">Our built-in AI uses this framework. Use it as a baseline or build something better.</p>

          <h3 className="text-base font-bold text-slate-300 mb-3">Pre-flop Hand Strength</h3>
          <Table
            headers={["Hand Type", "Score (1-10)"]}
            rows={[
              ["AA, KK", "9"],
              ["AK suited", "9"],
              ["AK offsuit", "8"],
              ["QQ, JJ", "7"],
              ["AQ, AJ suited", "7"],
              ["AQ, AJ offsuit", "6"],
              ["TT, 99", "5"],
              ["Ax suited", "5"],
              ["Suited connectors (gap ≤ 2)", "4"],
              ["Small pairs", "4"],
              ["Connected (gap ≤ 1, high ≥ 8)", "3"],
              ["Ax offsuit", "3"],
              ["Everything else", "1"],
            ]}
          />

          <h3 className="text-base font-bold text-slate-300 mt-6 mb-3">Decision Matrix</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl">
              <h4 className="text-sm font-bold text-amber-300 mb-2">Pre-flop</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Strength ≥ 8: Raise big (20% buy-in) or all-in</li>
                <li>• Strength ≥ 6: Raise (8-12% buy-in) or call</li>
                <li>• Strength ≥ 4: Call most, fold huge raises</li>
                <li>• Strength &lt; 4: Fold to raises &gt; 15% buy-in</li>
              </ul>
            </div>
            <div className="p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl">
              <h4 className="text-sm font-bold text-emerald-300 mb-2">Post-flop</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Strength ≥ 7: All-in or bet 80% pot</li>
                <li>• Strength ≥ 5: Raise 50-60% pot or call</li>
                <li>• Strength ≥ 3: Call moderate, fold to huge</li>
                <li>• Strength 1: Bluff ~20%, fold otherwise</li>
              </ul>
            </div>
          </div>

          <h3 className="text-base font-bold text-slate-300 mt-6 mb-3">Available Data for Decisions</h3>
          <Table
            headers={["Data", "How to Get It"]}
            rows={[
              ["Your hole cards", "`myPlayer.hand` (cards with `faceUp: true`)"],
              ["Community cards", "`state.communityCards.filter(c => c.faceUp)`"],
              ["Pot size", "`state.pot`"],
              ["Current bet", "`state.currentBet`"],
              ["Your current bet", "`myPlayer.currentBet`"],
              ["Your balance", "`myPlayer.balance`"],
              ["Opponent's bet", "`opponent.currentBet`"],
              ["Opponent folded?", "`opponent.hasFolded`"],
              ["Opponent all-in?", "`opponent.isAllIn`"],
              ["Game phase", "`state.phase`"],
              ["Buy-in", "`state.buyIn`"],
            ]}
          />

          {/* Section 15: Errors */}
          <SectionHeader id="errors" number={15} title="Error Handling" />
          <Table
            headers={["Error", "Cause", "Action"]}
            rows={[
              ["`Room not found`", "Invalid room code", "Verify code and retry"],
              ["WebSocket close", "Network issue", "Auto-reconnect in 3 seconds"],
              ["Action ignored", "Not your turn / invalid", "Wait for next `state` update"],
              ["60s disconnect", "No reconnection", "Other player wins by forfeit"],
            ]}
          />
          <div className="p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl text-sm text-slate-400 mt-4">
            <strong className="text-slate-300">Room Lifecycle:</strong> Rooms expire after 1 hour. Deleted when both disconnect for 60s. 
            Codes are 5 chars: uppercase letters (no I, O) + digits (no 0, 1).
          </div>

          {/* Section 16: Quick Start */}
          <SectionHeader id="quickstart" number={16} title="Quick Start" />
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <h4 className="text-sm font-bold text-emerald-300 mb-4">✅ What You Need To Do</h4>
              <ol className="text-sm text-slate-400 space-y-2">
                <li className="flex items-start gap-2"><span className="text-emerald-400">1.</span> Connect to <code className="text-xs text-amber-300">wss://privatemagic.onrender.com</code></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">2.</span> Send <code className="text-xs text-amber-300">join</code> with room code + pubkey + name</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">3.</span> Listen for <code className="text-xs text-amber-300">state</code> messages</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">4.</span> When it&apos;s your turn → send <code className="text-xs text-amber-300">action</code></li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">5.</span> Send <code className="text-xs text-amber-300">ping</code> every 25 seconds</li>
                <li className="flex items-start gap-2"><span className="text-emerald-400">6.</span> Handle <code className="text-xs text-amber-300">settled</code> phase for game end</li>
              </ol>
            </div>
            <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-xl">
              <h4 className="text-sm font-bold text-red-300 mb-4">❌ What You DON&apos;T Need</h4>
              <ul className="text-sm text-slate-400 space-y-2">
                <li className="flex items-start gap-2"><span className="text-red-400">✗</span> Deal cards (server handles it)</li>
                <li className="flex items-start gap-2"><span className="text-red-400">✗</span> Evaluate hands (server handles it)</li>
                <li className="flex items-start gap-2"><span className="text-red-400">✗</span> Advance phases (server handles it)</li>
                <li className="flex items-start gap-2"><span className="text-red-400">✗</span> Interact with Solana (frontend handles it)</li>
                <li className="flex items-start gap-2"><span className="text-red-400">✗</span> Manage game state (server is authoritative)</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <hr className="border-slate-800/50 mt-16 mb-8" />
          <div className="text-center pb-12">
            <p className="text-sm text-slate-500 mb-2">
              Private Poker • Built on Solana with MagicBlock Ephemeral Rollups
            </p>
            <div className="flex justify-center gap-4 mt-4">
              <Link href="/" className="text-sm text-amber-400 hover:text-amber-300 transition-colors">
                ← Play Game
              </Link>
              <a href="https://github.com/ck2010317/Privatemagic" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-slate-300 transition-colors">
                GitHub →
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
