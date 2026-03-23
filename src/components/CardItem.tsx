import React from 'react';
import { motion } from 'motion/react';
import { ScryfallCard } from '../lib/scryfall';

interface CardItemProps {
  card: ScryfallCard;
  onClick: (card: ScryfallCard) => void;
}

export const CardItem: React.FC<CardItemProps> = ({ card, onClick }) => {
  const cardImage = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -5 }}
      className="relative group cursor-pointer"
      onClick={() => onClick(card)}
    >
      <div className="aspect-[2.5/3.5] overflow-hidden rounded-[4.75% / 3.5%] bg-white/5 border border-white/10 transition-all group-hover:border-white/30 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]">
        {cardImage ? (
          <img
            src={cardImage}
            alt={card.name}
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 text-center">
            <p className="text-xs text-white/40 font-mono uppercase tracking-widest">{card.name}</p>
          </div>
        )}
      </div>
      
      <div className="mt-2 px-1">
        <h3 className="text-xs font-medium truncate text-white/80 group-hover:text-white transition-colors">
          {card.name}
        </h3>
        <p className="text-[10px] text-white/40 truncate font-mono uppercase tracking-tighter">
          {card.type_line}
        </p>
      </div>
    </motion.div>
  );
};
