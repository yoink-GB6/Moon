// core/starfield.js
// 星空粒子背景特效
//   • 极点在屏幕右下方外，星星从左下缓缓流向右上
//   • 无拖尾，每帧清空重绘；独立闪烁；邻近连线
//   • 鼠标/陀螺仪视差通过 CSS transform 整体平移

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;mix-blend-mode:screen;';
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');

  const DENSITY        = 16000;
  const COUNT_MIN      = 38;
  const COUNT_MAX      = 140;
  const MAX_DIST       = 80;
  const MAX_LINKS      = 3;
  const ROT_SPEED      = 0.00006;  // 极慢
  const RECYCLE_MARGIN = 220;
  const MOUSE_AMP      = 45;
  const GYRO_AMP       = 38;
  const LERP           = 0.055;
  const PAD            = Math.ceil(Math.max(MOUSE_AMP, GYRO_AMP) * 1.2);

  let W, H, stars, rotAngle = 0, frame = 0;
  let targetOx = 0, targetOy = 0, currentOx = 0, currentOy = 0;
  let gyroActive = false;
  const meteors = [];
  let nextMeteor = 0;

  function poleX() { return W * 1.2 + PAD; }
  function poleY() { return H * 2.2 + PAD; }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width  = W + PAD * 2;
    cv.height = H + PAD * 2;
    cv.style.left = cv.style.top = `-${PAD}px`;
  }

  function calcCount() {
    return Math.max(COUNT_MIN, Math.min(COUNT_MAX, Math.floor(W * H / DENSITY)));
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeStarAt(sx, sy) {
    const px = poleX(), py = poleY();
    const dx = sx - px, dy = sy - py;
    return {
      r:          Math.sqrt(dx * dx + dy * dy),
      angle:      Math.atan2(dy, dx) - rotAngle,
      dotR:       rand(0.6, 1.5),
      alphaBase:  rand(0.45, 0.75),
      alphaAmp:   rand(0.10, 0.22),
      alphaSpeed: rand(0.007, 0.020),
      alphaPhase: rand(0, Math.PI * 2),
    };
  }

  function makeStar() {
    return makeStarAt(Math.random() * W + PAD, Math.random() * H + PAD);
  }

  // 星星离屏后从上游方向重新注入，保证全屏均匀分布
  // 上方离屏 → 从底部边缘重生；右侧离屏 → 从左侧边缘重生
  function makeStarFromEdge(exitedTop, exitedRight) {
    if (exitedTop) {
      return makeStarAt(Math.random() * W + PAD, H + PAD + rand(5, 40));
    }
    if (exitedRight) {
      return makeStarAt(PAD - rand(5, 40), Math.random() * H + PAD);
    }
    return makeStar();
  }

  function initStars() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    stars = Array.from({ length: calcCount() }, makeStar);
  }

  function spawnMeteor() {
    // 从屏幕四条边随机一条边的随机位置出发，方向偏向屏幕中心，再加随机偏转
    const edge  = Math.floor(Math.random() * 4); // 0上 1右 2下 3左
    let sx, sy;
    if      (edge === 0) { sx = rand(PAD, W + PAD);     sy = PAD; }
    else if (edge === 1) { sx = W + PAD;                sy = rand(PAD, H + PAD); }
    else if (edge === 2) { sx = rand(PAD, W + PAD);     sy = H + PAD; }
    else                 { sx = PAD;                    sy = rand(PAD, H + PAD); }

    // 朝向屏幕中心方向，再偏转 ±50°
    const toCenterAngle = Math.atan2((H / 2 + PAD) - sy, (W / 2 + PAD) - sx);
    const angle = toCenterAngle + rand(-Math.PI / 3.6, Math.PI / 3.6);
    const speed = 7 + Math.random() * 7;
    meteors.push({
      x:     sx,
      y:     sy,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      len:   70 + Math.random() * 90,
      life:  1.0,
      decay: 0.018 + Math.random() * 0.012,
    });
    nextMeteor = performance.now() + rand(3500, 9000);
  }

  window.addEventListener('mousemove', function (e) {
    if (gyroActive) return;
    targetOx = (e.clientX - W * 0.5) / (W * 0.5) * MOUSE_AMP;
    targetOy = (e.clientY - H * 0.5) / (H * 0.5) * MOUSE_AMP;
  });


  function handleOrientation(e) {
    if (e.gamma === null || e.beta === null) return;
    gyroActive = true;
    targetOx = Math.max(-1, Math.min(1, e.gamma / 25)) * GYRO_AMP;
    targetOy = Math.max(-1, Math.min(1, (e.beta - 45) / 40)) * GYRO_AMP;
  }

  if (typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      document.addEventListener('click', function reqGyro() {
        DeviceOrientationEvent.requestPermission()
          .then(function (s) {
            if (s === 'granted') window.addEventListener('deviceorientation', handleOrientation, false);
          }).catch(function () {});
        document.removeEventListener('click', reqGyro);
      }, { once: true });
    } else {
      window.addEventListener('deviceorientation', handleOrientation, false);
    }
  }

  function loop() {
    rotAngle  += ROT_SPEED;
    frame++;
    currentOx += (targetOx - currentOx) * LERP;
    currentOy += (targetOy - currentOy) * LERP;

    const cw = cv.width, ch = cv.height;
    ctx.clearRect(0, 0, cw, ch);

    const px = poleX(), py = poleY();

    /* 计算位置 */
    const pos = new Array(stars.length);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const a = s.angle + rotAngle;
      const alpha = s.alphaBase + s.alphaAmp * Math.sin(frame * s.alphaSpeed + s.alphaPhase);
      pos[i] = {
        x:     px + s.r * Math.cos(a),
        y:     py + s.r * Math.sin(a),
        alpha: Math.max(0.08, Math.min(1, alpha)),
        r:     s.dotR,
      };
    }

    /* 回收离屏星 */
    for (let i = 0; i < stars.length; i++) {
      const vx = pos[i].x - PAD, vy = pos[i].y - PAD;
      const exitedTop   = vy < -RECYCLE_MARGIN;
      const exitedRight = vx > W + RECYCLE_MARGIN;
      if (exitedTop || exitedRight || vx < -RECYCLE_MARGIN || vy > H + RECYCLE_MARGIN) {
        stars[i] = makeStarFromEdge(exitedTop, exitedRight);
        const s = stars[i], a = s.angle + rotAngle;
        pos[i] = { x: px + s.r * Math.cos(a), y: py + s.r * Math.sin(a),
                   alpha: s.alphaBase, r: s.dotR };
      }
    }

    /* 连线 */
    const linkCount = new Uint8Array(stars.length);
    const maxDist2  = MAX_DIST * MAX_DIST;
    for (let i = 0; i < pos.length; i++) {
      if (linkCount[i] >= MAX_LINKS) continue;
      const ax = pos[i].x, ay = pos[i].y;
      if (ax < -MAX_DIST || ax > cw + MAX_DIST || ay < -MAX_DIST || ay > ch + MAX_DIST) continue;
      for (let j = i + 1; j < pos.length; j++) {
        if (linkCount[i] >= MAX_LINKS || linkCount[j] >= MAX_LINKS) continue;
        const dx = ax - pos[j].x, dy = ay - pos[j].y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < maxDist2) {
          const la = (1 - Math.sqrt(dist2) / MAX_DIST) * 0.38;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(pos[j].x, pos[j].y);
          ctx.strokeStyle = `rgba(168,137,58,${la.toFixed(3)})`;
          ctx.lineWidth = 0.75;
          ctx.stroke();
          linkCount[i]++;
          linkCount[j]++;
        }
      }
    }

    /* 星点 */
    for (let i = 0; i < pos.length; i++) {
      const p = pos[i];
      if (p.x < -12 || p.x > cw + 12 || p.y < -12 || p.y > ch + 12) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168,137,58,${p.alpha.toFixed(3)})`;
      ctx.fill();
    }

    /* 流星 */
    const now = performance.now();
    if (now >= nextMeteor) spawnMeteor();
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x    += m.vx;
      m.y    += m.vy;
      m.life -= m.decay;
      if (m.life <= 0 || m.x > cw + 60 || m.y > ch + 60) { meteors.splice(i, 1); continue; }
      const spd = Math.hypot(m.vx, m.vy);
      const tx  = m.x - (m.vx / spd) * m.len;
      const ty  = m.y - (m.vy / spd) * m.len;
      const g   = ctx.createLinearGradient(tx, ty, m.x, m.y);
      g.addColorStop(0, 'rgba(168,137,58,0)');
      g.addColorStop(1, `rgba(255,245,210,${(m.life * 0.95).toFixed(3)})`);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(m.x, m.y);
      ctx.strokeStyle = g;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }


    /* 视差 */
    cv.style.transform = `translate(${currentOx.toFixed(2)}px,${currentOy.toFixed(2)}px)`;

    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', function () { resize(); initStars(); });

  resize();
  initStars();
  nextMeteor = performance.now() + 2000;
  loop();
})();
