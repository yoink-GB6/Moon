// core/starfield.js
// 星空粒子背景特效 ——
//   • 粒子数按屏幕面积自动计算
//   • 桌面端：鼠标移动带动整体偏移（透镜视差）
//   • 移动端：陀螺仪重力感应带动整体偏移
//   • 邻近粒子连线（金色）

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ── Canvas ── */
  const canvas = document.createElement('canvas');
  canvas.id = 'star-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:600;pointer-events:none;mix-blend-mode:screen;';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  /* ── 参数 ── */
  const DENSITY    = 16000;  // 每 N 像素²一颗星，调小=更密
  const COUNT_MIN  = 38;
  const COUNT_MAX  = 140;
  const MAX_DIST   = 80;     // 连线触发距离 px
  const MAX_LINKS  = 3;      // 每颗粒子最多连几条线
  const DRIFT      = 0.22;   // 漂移速度上限
  const MOUSE_AMP  = 45;     // 鼠标视差最大偏移 px
  const GYRO_AMP   = 38;     // 陀螺仪最大偏移 px
  const LERP       = 0.055;  // 偏移插值速度（越小越缓）

  let W, H, stars;
  let targetOx = 0, targetOy = 0;  // 目标偏移量
  let currentOx = 0, currentOy = 0; // 当前插值偏移量
  let gyroActive = false;            // 是否由陀螺仪控制

  /* ── 尺寸 & 粒子数 ── */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function calcCount() {
    return Math.max(COUNT_MIN, Math.min(COUNT_MAX, Math.floor(W * H / DENSITY)));
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeStar() {
    return {
      x:     Math.random() * W,
      y:     Math.random() * H,
      vx:    rand(-DRIFT, DRIFT),
      vy:    rand(-DRIFT, DRIFT),
      r:     rand(0.7, 2.0),
      alpha: rand(0.28, 0.68),
    };
  }

  function initStars() {
    stars = Array.from({ length: calcCount() }, makeStar);
  }

  /* ── 鼠标视差（桌面端） ── */
  window.addEventListener('mousemove', function (e) {
    if (gyroActive) return;
    // 以屏幕中心为原点归一化到 [-1, 1]
    const nx = (e.clientX - W * 0.5) / (W * 0.5);
    const ny = (e.clientY - H * 0.5) / (H * 0.5);
    targetOx = nx * MOUSE_AMP;
    targetOy = ny * MOUSE_AMP;
  });

  /* ── 陀螺仪（移动端） ── */
  function handleOrientation(e) {
    if (e.gamma === null || e.beta === null) return;
    gyroActive = true;
    // gamma: 左右倾 ±90°，beta: 前后倾 -180~180°（正常持握约 45°）
    const nx = Math.max(-1, Math.min(1, e.gamma / 25));
    const ny = Math.max(-1, Math.min(1, (e.beta - 45) / 40));
    targetOx = nx * GYRO_AMP;
    targetOy = ny * GYRO_AMP;
  }

  // iOS 13+ 需要显式申请权限；Android / 其他直接监听
  if (typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+：首次用户交互时申请
      document.addEventListener('click', function reqGyro() {
        DeviceOrientationEvent.requestPermission()
          .then(function (state) {
            if (state === 'granted') {
              window.addEventListener('deviceorientation', handleOrientation, false);
            }
          })
          .catch(function () {});
        document.removeEventListener('click', reqGyro);
      }, { once: true });
    } else {
      window.addEventListener('deviceorientation', handleOrientation, false);
    }
  }

  /* ── 每帧逻辑 ── */
  function update() {
    // 偏移量缓动插值
    currentOx += (targetOx - currentOx) * LERP;
    currentOy += (targetOy - currentOy) * LERP;

    for (const s of stars) {
      s.x += s.vx;
      s.y += s.vy;
      // 环绕边界
      if (s.x < -14) s.x = W + 14;
      else if (s.x > W + 14) s.x = -14;
      if (s.y < -14) s.y = H + 14;
      else if (s.y > H + 14) s.y = -14;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const ox = currentOx;
    const oy = currentOy;

    // 连线（每颗星最多连 MAX_LINKS 条，按距离优先）
    const linkCount = new Uint8Array(stars.length);
    const maxDist2  = MAX_DIST * MAX_DIST;
    for (let i = 0; i < stars.length; i++) {
      if (linkCount[i] >= MAX_LINKS) continue;
      const ax = stars[i].x + ox;
      const ay = stars[i].y + oy;
      for (let j = i + 1; j < stars.length; j++) {
        if (linkCount[i] >= MAX_LINKS || linkCount[j] >= MAX_LINKS) continue;
        const bx = stars[j].x + ox;
        const by = stars[j].y + oy;
        const dx = ax - bx;
        const dy = ay - by;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < maxDist2) {
          const a = (1 - Math.sqrt(dist2) / MAX_DIST) * 0.42;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.strokeStyle = `rgba(168,137,58,${a.toFixed(3)})`;
          ctx.lineWidth = 0.75;
          ctx.stroke();
          linkCount[i]++;
          linkCount[j]++;
        }
      }
    }

    // 光点
    for (const s of stars) {
      ctx.beginPath();
      ctx.arc(s.x + ox, s.y + oy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168,137,58,${s.alpha.toFixed(3)})`;
      ctx.fill();
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  /* ── 窗口缩放：动态增减粒子 ── */
  window.addEventListener('resize', function () {
    resize();
    const target = calcCount();
    if (target > stars.length) {
      while (stars.length < target) stars.push(makeStar());
    } else {
      stars.length = target;
    }
  });

  /* ── 启动 ── */
  resize();
  initStars();
  loop();
})();
