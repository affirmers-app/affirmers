// Hero background: a drifting geometric network drawn on canvas.
// Colour is read from the computed style so no literals live here.
export function startField(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || 'white';
  let w = 0, h = 0, dpr = 1, pts = [], raf = 0, onScreen = true;
  const mouse = { x: -9999, y: -9999 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(24, Math.min(90, Math.round((w * h) / 16000)));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
      r: 0.8 + Math.random() * 1.6,
    }));
    if (reduced) draw();
  }

  function step() {
    for (const p of pts) {
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 14400) { const f = (1 - d2 / 14400) * 0.6; p.vx += (dx / 12) * f * 0.02; p.vy += (dy / 12) * f * 0.02; }
      p.vx *= 0.995; p.vy *= 0.995;
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    const maxD = Math.min(170, Math.max(110, w / 7));
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < maxD) {
          ctx.globalAlpha = (1 - d / maxD) * 0.32;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    raf = 0;
    if (document.hidden || !onScreen) return;
    step(); draw();
    raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!reduced && !raf && onScreen && !document.hidden) raf = requestAnimationFrame(loop); };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; kick(); });
  io.observe(canvas);
  const move = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
  const leave = () => { mouse.x = mouse.y = -9999; };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerleave', leave, { passive: true });
  document.addEventListener('visibilitychange', kick);
  resize();
  kick();

  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    window.removeEventListener('pointermove', move);
    document.removeEventListener('visibilitychange', kick);
  };
}
