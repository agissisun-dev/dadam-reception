"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#16863b", "#bfa37a", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899"];

/** 화면 위에서 색종이가 3초쯤 떨어진다. 라이브러리 없이 캔버스로 그린다. */
function useConfetti(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.5,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      size: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = t > 2500 ? Math.max(0, 1 - (t - 2500) / 800) : 1;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < 3300) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);
}

/** 웃는 탕약 봉투 캐릭터 */
function Mascot() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
      <ellipse cx="60" cy="108" rx="34" ry="5" fill="#e7e5e4" />
      <path d="M32 40 Q30 30 40 26 L80 26 Q90 30 88 40 L92 96 Q92 104 84 104 L36 104 Q28 104 28 96 Z" fill="#bfa37a" />
      <path d="M40 26 L42 16 Q60 8 78 16 L80 26 Z" fill="#a08762" />
      <rect x="38" y="36" width="44" height="6" rx="3" fill="#8a7352" />
      <circle cx="49" cy="62" r="4" fill="#292524" />
      <circle cx="71" cy="62" r="4" fill="#292524" />
      <circle cx="50.5" cy="60.5" r="1.3" fill="#fff" />
      <circle cx="72.5" cy="60.5" r="1.3" fill="#fff" />
      <path d="M48 76 Q60 88 72 76" stroke="#292524" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="72" r="5" fill="#f9a8a8" opacity="0.8" />
      <circle cx="80" cy="72" r="5" fill="#f9a8a8" opacity="0.8" />
      <path d="M60 22 Q56 12 64 8" stroke="#16863b" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="66" cy="8" rx="5" ry="3" fill="#16863b" transform="rotate(-20 66 8)" />
      <path d="M96 30 l3 -6 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 Z" fill="#f59e0b" />
      <path d="M18 50 l2 -4 l2 4 l4 2 l-4 2 l-2 4 l-2 -4 l-4 -2 Z" fill="#f59e0b" />
    </svg>
  );
}

export default function Celebration({ message, onClose }: { message: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useConfetti(canvasRef);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
      role="dialog"
      aria-label="오늘 할 일 완료"
      onClick={onClose}
    >
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 h-full w-full" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-fit">
          <Mascot />
        </div>
        <p className="mt-3 text-xl font-bold text-[#16863b]">오늘 할 일 끝!</p>
        <p className="mt-2 text-stone-700">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded bg-stone-900 px-4 py-2 text-sm text-white"
        >
          고마워요
        </button>
      </div>
    </div>
  );
}
