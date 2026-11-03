import React from "react";

interface Props {
  /** 0..5, допускаются доли. */
  value: number;
  size?: number;
}

const Star = ({ fill, size }: { fill: number; size: number }) => (
  <span className="relative inline-block" style={{ width: size, height: size, fontSize: size, lineHeight: 1 }}>
    <span className="text-gray-700">★</span>
    <span className="absolute left-0 top-0 overflow-hidden text-amber-400" style={{ width: `${fill * 100}%` }}>
      ★
    </span>
  </span>
);

/** Пять звёзд с частичным заполнением. */
const StarRating = ({ value, size = 16 }: Props) => {
  const v = Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : 0;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Рейтинг ${v.toFixed(1)} из 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} fill={Math.min(1, Math.max(0, v - i))} />
      ))}
    </span>
  );
};

export default StarRating;
