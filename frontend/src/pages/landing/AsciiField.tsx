import { useEffect, useRef } from "react";

// Фон hero: поле символов на сетке 8×16. Слева — «сырые» решения (шум),
// справа — упорядоченные строки требований, как в анализе ИИ.
// 30 fps, пауза вне экрана; при reduced motion — один статичный кадр.

const CELL_W = 8;
const CELL_H = 16;
const RAMP = " .:-=+*#%";

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const smooth = (t: number) => t * t * (3 - 2 * t);

const noise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
};

const AsciiField = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;
    wrap.classList.add("hm-field--live");

    const css = getComputedStyle(wrap);
    const tints = ["--color-glyph-1", "--color-glyph-2", "--color-glyph-3", "--color-glyph-4"].map((v) =>
      css.getPropertyValue(v).trim(),
    );
    const font = `${CELL_H - 4}px ${css.getPropertyValue("--font-outlier").trim() || "monospace"}`;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cols = 0;
    let rows = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    const pointer = { x: -9999, y: -9999 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / CELL_W);
      rows = Math.ceil(height / CELL_H);
    };

    // Длина «строки требования» справа: фиксирована для строки, чтобы читалась как список.
    const rowLength = (r: number) => 0.55 + 0.4 * hash(r, 7);

    // Символы копятся по оттенкам: fillStyle меняется 4 раза за кадр, а не на каждую ячейку.
    const buckets: number[][] = [[], [], [], []];

    const draw = (t: number) => {
      ctx.clearRect(0, 0, cols * CELL_W, rows * CELL_H);
      ctx.font = font;
      ctx.textBaseline = "top";
      const time = t / 4000;
      for (const b of buckets) b.length = 0;
      for (let r = 0; r < rows; r++) {
        const isCriterion = r % 3 === 1;
        for (let c = 0; c < cols; c++) {
          const u = c / cols;
          const raw = noise(c / 9 + time, r / 5 - time * 0.6) * 0.7 + noise(c / 3 - time, r / 2) * 0.3;
          const resolved = isCriterion && u - 0.5 < rowLength(r) * 0.5 ? 0.62 : 0.04;
          const s = smooth(Math.min(1, Math.max(0, (u - 0.32) / 0.4)));
          let v = (raw - 0.35) * 1.4 * (1 - s) + resolved * s;
          v *= 0.45 + 0.55 * u;
          const dx = c * CELL_W - pointer.x;
          const dy = r * CELL_H - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14400) v += 0.3 * (1 - d2 / 14400);
          if (v < 0.12) continue;
          const k = Math.min(RAMP.length - 1, Math.floor(v * RAMP.length));
          buckets[Math.min(3, Math.floor(v * 4))].push(k, c * CELL_W, r * CELL_H);
        }
      }
      buckets.forEach((b, i) => {
        ctx.fillStyle = tints[i];
        for (let j = 0; j < b.length; j += 3) ctx.fillText(RAMP[b[j]], b[j + 1], b[j + 2]);
      });
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || t - last < 33) return;
      last = t;
      draw(t);
    };

    resize();
    draw(0);
    const ro = new ResizeObserver(() => {
      resize();
      draw(last);
    });
    ro.observe(wrap);

    let io: IntersectionObserver | undefined;
    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };
    const host = wrap.parentElement;
    if (!still) {
      io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      io.observe(wrap);
      host?.addEventListener("pointermove", onMove);
      host?.addEventListener("pointerleave", onLeave);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      host?.removeEventListener("pointermove", onMove);
      host?.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="hm-field" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
};

export default AsciiField;
