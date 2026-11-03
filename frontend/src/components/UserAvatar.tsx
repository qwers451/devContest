import React from "react";
import { initials } from "../utils/profileExtras";

interface Props {
  login?: string | null;
  color?: string;
  image?: string;
  size?: number;
  className?: string;
}

/** Круглый аватар: картинка (data URL) либо инициалы на цветном фоне. */
const UserAvatar = ({ login, color = "#7c3aed", image, size = 40, className = "" }: Props) => {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) } as const;
  if (image) {
    return (
      <img
        src={image}
        alt={login ? `Аватар ${login}` : "Аватар"}
        style={style}
        className={`flex-shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, backgroundColor: color }}
      className={`flex flex-shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${className}`}
    >
      {initials(login)}
    </span>
  );
};

export default UserAvatar;
