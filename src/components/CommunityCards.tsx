"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/lib/cards";
import PlayingCard from "./PlayingCard";

interface CommunityCardsProps {
  cards: Card[];
  phase: string;
}

export default function CommunityCards({ cards, phase }: CommunityCardsProps) {
  if (cards.length === 0 || phase === "waiting" || phase === "lobby") {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center gap-2"
    >
      <AnimatePresence>
        {cards.map((card, i) => (
          <div key={`community-${i}`}>
            <PlayingCard
              card={card}
              faceUp={card.faceUp}
              index={i}
              delay={0.1}
              size="md"
              highlight={card.faceUp}
            />
          </div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
