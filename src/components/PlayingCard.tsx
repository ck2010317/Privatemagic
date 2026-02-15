"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, SUIT_SYMBOLS, SUIT_COLORS } from "@/lib/cards";

interface PlayingCardProps {
  card: Card;
  faceUp?: boolean;
  index?: number;
  delay?: number;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "w-12 h-18 text-xs",
  md: "w-20 h-28 text-sm",
  lg: "w-24 h-36 text-base",
};

export default function PlayingCard({
  card,
  faceUp = true,
  index = 0,
  delay = 0,
  size = "md",
  highlight = false,
  className = "",
}: PlayingCardProps) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";

  return (
    <motion.div
      initial={{ rotateY: 180, x: -200, y: -200, opacity: 0 }}
      animate={{
        rotateY: faceUp ? 0 : 180,
        x: 0,
        y: 0,
        opacity: 1,
      }}
      exit={{ y: -100, opacity: 0 }}
      transition={{
        duration: 0.6,
        delay: delay + index * 0.15,
        type: "spring",
        stiffness: 200,
        damping: 20,
      }}
      className={`relative cursor-pointer select-none ${className}`}
      style={{ perspective: "1000px" }}
      whileHover={{ y: -8, scale: 1.05 }}
    >
      <div
        className={`
          ${size === "sm" ? "w-12 h-[72px]" : size === "md" ? "w-20 h-28" : "w-24 h-36"}
          rounded-xl shadow-xl transition-all duration-300
          ${highlight ? "ring-2 ring-yellow-400 shadow-yellow-400/50" : ""}
          ${faceUp ? "bg-white" : ""}
          relative overflow-hidden
        `}
        style={{ transformStyle: "preserve-3d" }}
      >
        {faceUp ? (
          /* Front of card */
          <div className="absolute inset-0 p-1.5 flex flex-col justify-between">
            {/* Top-left rank and suit */}
            <div className={`flex flex-col items-start leading-none ${isRed ? "text-red-600" : "text-gray-900"}`}>
              <span className={`font-bold ${size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-lg"}`}>
                {card.rank}
              </span>
              <span className={`${size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-base"}`}>
                {SUIT_SYMBOLS[card.suit]}
              </span>
            </div>

            {/* Center suit - large */}
            <div className="flex-1 flex items-center justify-center">
              <span
                className={`${size === "sm" ? "text-2xl" : size === "md" ? "text-4xl" : "text-5xl"} ${isRed ? "text-red-600" : "text-gray-900"}`}
              >
                {SUIT_SYMBOLS[card.suit]}
              </span>
            </div>

            {/* Bottom-right rank and suit (rotated) */}
            <div className={`flex flex-col items-end leading-none rotate-180 ${isRed ? "text-red-600" : "text-gray-900"}`}>
              <span className={`font-bold ${size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-lg"}`}>
                {card.rank}
              </span>
              <span className={`${size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-base"}`}>
                {SUIT_SYMBOLS[card.suit]}
              </span>
            </div>

            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none rounded-xl" />
          </div>
        ) : (
          /* Back of card */
          <div className="absolute inset-0 bg-gradient-to-br from-blue-800 via-blue-900 to-indigo-950 rounded-xl">
            <div className="absolute inset-1 border-2 border-blue-500/30 rounded-lg">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  {/* Diamond pattern */}
                  <div className="w-8 h-8 rotate-45 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-sm" />
                  <div className="absolute inset-1 rotate-45 bg-gradient-to-br from-blue-900 to-indigo-950 rounded-sm" />
                  <div className="absolute inset-2 rotate-45 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-sm" />
                </div>
              </div>
              {/* Subtle pattern */}
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `repeating-linear-gradient(
                    45deg,
                    transparent,
                    transparent 5px,
                    rgba(255,255,255,0.1) 5px,
                    rgba(255,255,255,0.1) 10px
                  )`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Component for showing a hand of cards
interface CardHandProps {
  cards: Card[];
  faceUp?: boolean;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
  overlap?: boolean;
}

export function CardHand({ cards, faceUp = true, size = "md", highlight = false, overlap = true }: CardHandProps) {
  return (
    <div className="flex items-center">
      {cards.map((card, i) => (
        <div
          key={`${card.rank}-${card.suit}-${i}`}
          className={overlap && i > 0 ? (size === "sm" ? "-ml-4" : size === "md" ? "-ml-6" : "-ml-8") : ""}
        >
          <PlayingCard
            card={card}
            faceUp={faceUp}
            index={i}
            size={size}
            highlight={highlight}
          />
        </div>
      ))}
    </div>
  );
}
