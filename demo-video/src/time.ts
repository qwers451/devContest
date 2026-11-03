import { useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Ролик рендерится в 60 fps ради плавных проездов камеры, но все тайминги
 * в сценах записаны в «кадрах 30 fps» — так их проще читать и править.
 * useT() отдаёт текущее время в этих единицах (дробное на 60 fps),
 * f30() переводит длительность из них в настоящие кадры композиции.
 */
export const FPS = 60;
export const BASE_FPS = 30;

export const f30 = (frames: number) => Math.round((frames * FPS) / BASE_FPS);

export const useT = (): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (frame * BASE_FPS) / fps;
};
