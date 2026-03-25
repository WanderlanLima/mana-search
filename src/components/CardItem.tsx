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
      whileHover={{ y: -8, scale: 1.02 }}
      className="relative group cursor-pointer"
      onClick={() => onClick(card)}
    >
      <div className="aspect-[2.5/3.5] overflow-hidden rounded-[4.75% / 3.5%] bg-white/5 border border-white/5 transition-all duration-500 group-hover:border-purple-500/50 group-hover:shadow-[0_0_40px_rgba(124,58,237,0.2)] relative">
        {cardImage ? (
          <img
            src={cardImage}
            alt={card.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 text-center bg-gradient-to-br from-white/5 to-transparent">
            <p className="text-[10px] text-white/40 font-mono uppercase tracking-[0.2em]">{card.name}</p>
          </div>
        )}
        
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <h3 className="text-xs font-bold text-white truncate mb-0.5">
            {card.name}
          </h3>
          <p className="text-[9px] text-white/60 truncate font-mono uppercase tracking-tighter">
            {card.type_line}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
