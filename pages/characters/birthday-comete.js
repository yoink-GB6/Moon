function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointOnCurve(curve, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * curve.start.x + 2 * mt * t * curve.control.x + t * t * curve.end.x,
    y: mt * mt * curve.start.y + 2 * mt * t * curve.control.y + t * t * curve.end.y,
  };
}

function scaledCurve(preset, width, height) {
  const scale = point => ({ x: point[0] * width, y: point[1] * height });
  return {
    start: scale(preset[0]),
    control: scale(preset[1]),
    end: scale(preset[2]),
  };
}

function between(min, max) {
  return min + Math.random() * (max - min);
}

// 六组只约束飞行方向和活动走廊；每次的起点、弧度和终点都重新生成。
function randomCurve(family) {
  switch (family) {
    case 0: // 左侧横掠至右侧，向上拱起
      return [[-.08, between(.24, .48)], [between(.24, .48), between(.015, .15)], [1.08, between(.18, .43)]];
    case 1: // 右侧横掠至左侧，向上拱起
      return [[1.08, between(.22, .47)], [between(.52, .76), between(.01, .15)], [-.08, between(.17, .42)]];
    case 2: // 左下沿人物外缘飞向右上
      return [[-.08, between(.50, .67)], [between(.12, .34), between(.20, .38)], [between(.82, 1.08), between(.07, .24)]];
    case 3: // 右下沿人物外缘飞向左上
      return [[1.08, between(.50, .67)], [between(.66, .88), between(.20, .38)], [between(-.08, .18), between(.07, .24)]];
    case 4: // 从上方落向右侧
      return [[between(.12, .38), -.04], [between(.48, .72), between(.02, .15)], [1.08, between(.32, .57)]];
    default: // 从上方落向左侧
      return [[between(.62, .88), -.04], [between(.28, .52), between(.02, .15)], [-.08, between(.32, .57)]];
  }
}

export function mountBirthdayComete({ host, config, context, signal }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'birthday-comete';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.opacity = String(config?.opacity ?? 0.72);
  host.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const reducedMotion = context?.reducedMotion === true;
  const intensity = clamp(Number(config?.intensity) || 1, 0.2, 3);
  let width = 0;
  let height = 0;
  let dpr = 1;
  let normalizedCurve = null;
  let curve = null;
  let active = null;
  let timer = 0;
  let raf = 0;
  let destroyed = false;
  let lastFamily = -1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (normalizedCurve) curve = scaledCurve(normalizedCurve, width, height);
    if (reducedMotion) drawComet(0.68, 0.48);
  }

  function drawSpark(x, y, size, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(255,249,226,${alpha})`;
    ctx.shadowColor = 'rgba(255,225,143,.8)';
    ctx.shadowBlur = size * 2.8;
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.8);
    ctx.quadraticCurveTo(size * .24, -size * .24, size * 1.7, 0);
    ctx.quadraticCurveTo(size * .24, size * .24, 0, size * 1.8);
    ctx.quadraticCurveTo(-size * .24, size * .24, -size * 1.7, 0);
    ctx.quadraticCurveTo(-size * .24, -size * .24, 0, -size * 1.8);
    ctx.fill();
    ctx.restore();
  }

  function drawComet(t, fade = 1) {
    ctx.clearRect(0, 0, width, height);
    if (!curve) return;
    const tailStart = Math.max(0, t - 0.24);
    const steps = 28;

    ctx.save();
    ctx.lineCap = 'round';
    for (let index = 1; index <= steps; index++) {
      const ratio = index / steps;
      const previousRatio = (index - 1) / steps;
      const from = pointOnCurve(curve, tailStart + (t - tailStart) * previousRatio);
      const to = pointOnCurve(curve, tailStart + (t - tailStart) * ratio);
      const alpha = fade * ratio * ratio;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = `rgba(255,238,188,${alpha * .38})`;
      ctx.lineWidth = .35 + ratio * 2.2;
      ctx.shadowColor = 'rgba(255,225,143,.5)';
      ctx.shadowBlur = 8 * ratio;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = `rgba(255,255,249,${alpha * .76})`;
      ctx.lineWidth = .28 + ratio * .65;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }
    ctx.restore();

    const head = pointOnCurve(curve, t);
    drawSpark(head.x, head.y, 2.3 + intensity * .55, fade * .92);
    if (t > .12) {
      const glint = pointOnCurve(curve, Math.max(0, t - .075));
      drawSpark(glint.x, glint.y, 1.05, fade * .34);
    }
  }

  function animate(now) {
    raf = 0;
    if (!active || destroyed) return;
    const progress = clamp((now - active.startedAt) / active.duration, 0, 1);
    const fadeIn = clamp(progress / .10, 0, 1);
    const fadeOut = clamp((1 - progress) / .18, 0, 1);
    drawComet(progress, Math.min(fadeIn, fadeOut));
    if (progress < 1) {
      raf = requestAnimationFrame(animate);
      return;
    }
    active = null;
    ctx.clearRect(0, 0, width, height);
    schedule(7200 + Math.random() * 7200);
  }

  function launch() {
    if (destroyed || reducedMotion || !width || !height) return;
    let family = Math.floor(Math.random() * 6);
    if (family === lastFamily)
      family = (family + 1 + Math.floor(Math.random() * 5)) % 6;
    lastFamily = family;
    normalizedCurve = randomCurve(family);
    curve = scaledCurve(normalizedCurve, width, height);
    active = {
      startedAt: performance.now(),
      duration: (1750 + Math.random() * 800) / clamp(intensity, .7, 1.35),
    };
    raf = requestAnimationFrame(animate);
  }

  function schedule(delay) {
    if (destroyed || reducedMotion) return;
    clearTimeout(timer);
    timer = window.setTimeout(launch, delay);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  if (reducedMotion) {
    normalizedCurve = randomCurve(0);
    curve = scaledCurve(normalizedCurve, width, height);
    drawComet(0.68, 0.48);
  } else schedule(450 + Math.random() * 900);

  const remove = () => {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    canvas.remove();
  };
  signal?.addEventListener('abort', remove, { once: true });
  return remove;
}
