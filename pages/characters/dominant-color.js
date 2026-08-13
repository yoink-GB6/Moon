// pages/characters/dominant-color.js
// 从立绘里取主色调，供弹窗背景铺色块用

const _cache = new Map();

// 直接平均会得到一坨脏灰，所以按 4bit/通道分桶投票，取票数最多那桶的均值
function pick(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let bk = buckets.get(key);
    if (!bk) { bk = { r: 0, g: 0, b: 0, n: 0 }; buckets.set(key, bk); }
    bk.r += r; bk.g += g; bk.b += b; bk.n++;
  }
  let best = null;
  buckets.forEach(function(bk) { if (!best || bk.n > best.n) best = bk; });
  if (!best) return null;
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}

// 取不到就 resolve(null)，调用方保留原来的模糊图兜底。
// 图床没开 CORS 时 canvas 会被污染，这时只有这个采样用的 Image 失败，弹窗里显示的那张不受影响。
export function dominantColor(url) {
  if (!url) return Promise.resolve(null);
  if (_cache.has(url)) return Promise.resolve(_cache.get(url));
  return new Promise(function(resolve) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      let rgb = null;
      try {
        const S = 32;
        const cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, S, S);
        rgb = pick(ctx.getImageData(0, 0, S, S).data);
      } catch (_) {}
      _cache.set(url, rgb);
      resolve(rgb);
    };
    img.onerror = function() { _cache.set(url, null); resolve(null); };
    img.src = url;
  });
}
