import { useEffect, useRef } from "react";

/** Animated "signal network": nodes drift, nearby nodes link, pulses travel along links. */
export default function NetworkCanvas({ density = 0.00009, className = "" }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    type Node = { x: number; y: number; vx: number; vy: number; r: number; hue: number };
    let nodes: Node[] = [];
    const pulses: { a: number; b: number; t: number; speed: number }[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(28, Math.min(110, Math.floor(w * h * density)));
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6, hue: Math.random() < 0.6 ? 262 : 188,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const linkDist = 130;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        if (!reduce) { n.x += n.vx; n.y += n.vy; }
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < linkDist) {
            ctx.strokeStyle = `rgba(139,92,246,${(1 - d / linkDist) * 0.22})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            if (!reduce && pulses.length < 14 && Math.random() < 0.0009) pulses.push({ a: i, b: j, t: 0, speed: 0.008 + Math.random() * 0.012 });
          }
        }
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k];
        p.t += p.speed;
        const a = nodes[p.a], b = nodes[p.b];
        if (p.t >= 1 || !a || !b) { pulses.splice(k, 1); continue; }
        const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, "rgba(34,211,238,0.9)"); g.addColorStop(1, "rgba(34,211,238,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      }
      for (const n of nodes) {
        ctx.fillStyle = `hsla(${n.hue}, 90%, 72%, 0.85)`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [density]);

  return <canvas ref={ref} className={`h-full w-full ${className}`} aria-hidden />;
}
