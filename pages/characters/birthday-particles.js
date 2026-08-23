function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export function createBirthdayParticles(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const emitters = new Set();
  const particles = [];
  let accent = [208, 175, 78];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function randomColor(alpha) {
    return 'rgba(' + accent.join(',') + ',' + alpha + ')';
  }

  function makeAmbient(method, intensity) {
    const type = method === 'particle-feather' ? 'feather'
      : method === 'particle-petal' ? 'petal' : 'star';
    return {
      type,
      x: Math.random() * width,
      y: -24,
      vx: (Math.random() - 0.5) * (type === 'feather' ? 24 : 14),
      vy: 18 + Math.random() * 28,
      gravity: type === 'star' ? -1 : 3,
      size: (type === 'star' ? 2.5 : 6) + Math.random() * (type === 'star' ? 4 : 8),
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.4,
      age: 0,
      life: 7 + Math.random() * 5,
      alpha: clamp(0.28 + intensity * 0.18, 0.2, 0.8),
      drift: Math.random() * Math.PI * 2,
    };
  }

  function drawStar(p) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const radius = i % 2 ? p.size * 0.28 : p.size;
      const angle = p.rotation + i * Math.PI / 4;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawPetal(p) {
    ctx.rotate(p.rotation);
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size * 0.55, p.size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.lineTo(0, p.size);
    ctx.stroke();
  }

  function drawFeather(p) {
    ctx.rotate(p.rotation);
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.quadraticCurveTo(p.size * 0.8, -p.size * 0.15, 0, p.size);
    ctx.quadraticCurveTo(-p.size * 0.7, -p.size * 0.1, 0, -p.size);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -p.size * 0.8);
    ctx.lineTo(0, p.size * 1.25);
    ctx.stroke();
  }

  function drawParticle(p) {
    const fade = Math.min(1, p.age * 3) * Math.min(1, (p.life - p.age) * 2);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = randomColor(p.alpha * fade);
    ctx.strokeStyle = randomColor(p.alpha * fade * 0.75);
    ctx.lineWidth = 1;
    if (p.type === 'star') drawStar(p);
    else if (p.type === 'petal') drawPetal(p);
    else drawFeather(p);
    ctx.restore();
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.04, Math.max(0.001, (now - (last || now)) / 1000));
    last = now;
    emitters.forEach(emitter => {
      emitter.carry += dt * emitter.rate;
      while (emitter.carry >= 1 && particles.length < 180) {
        emitter.carry--;
        particles.push(makeAmbient(emitter.method, emitter.intensity));
      }
    });

    ctx.clearRect(0, 0, width, height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life || p.y > height + 50 || p.x < -80 || p.x > width + 80) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag || 1, dt * 60);
      p.x += (p.vx + Math.sin(p.age * 1.4 + p.drift) * 12) * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      drawParticle(p);
    }
    if (emitters.size || particles.length) ensureRunning();
  }

  function ensureRunning() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function addEmitter(method, config = {}) {
    const intensity = clamp(Number(config.intensity) || 1, 0.2, 3);
    const emitter = {
      method,
      intensity,
      rate: reduced ? 0.25 * intensity : 1.7 * intensity,
      carry: reduced ? 0 : 1,
    };
    emitters.add(emitter);
    ensureRunning();
    return () => emitters.delete(emitter);
  }

  function clearEmitters() { emitters.clear(); }

  function clear() {
    emitters.clear();
    particles.length = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0;
    ctx.clearRect(0, 0, width, height);
  }

  function setAccent(rgb) {
    if (Array.isArray(rgb) && rgb.length === 3) accent = rgb.map(value => clamp(Math.round(value), 0, 255));
  }

  function destroy() {
    clear();
    window.removeEventListener('resize', resize);
  }

  resize();
  window.addEventListener('resize', resize);
  return { addEmitter, clearEmitters, clear, setAccent, destroy };
}
