// core/icons.js
// 内联 SVG 图标。Unicode 符号在部分设备上会被渲染成彩色 emoji，
// SVG 没有字体依赖，且 currentColor 会自动跟随主题色。
// 日/夜各由若干大小不一的小图拼成一幅小景，而不是单个图标。

const wrap = (cls, body, vb = '0 0 24 24') =>
  `<svg class="ic ${cls}" viewBox="${vb}" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true">${body}</svg>`;

/* ── 白天 ── */
export const iconSun = wrap('ic-lg', `
  <circle cx="12" cy="12" r="4.2"/>
  <path d="M12 2.4v2.3M12 19.3v2.3M2.4 12h2.3M19.3 12h2.3
           M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>
`);

export const iconCloud = wrap('ic-md', `
  <path d="M18.3 18.6H7.4a3.9 3.9 0 0 1-.4-7.8 5.4 5.4 0 0 1 10.2-1.3 3.6 3.6 0 0 1 1.1 9.1z"/>
`);

export const iconCloudSm = wrap('ic-sm', `
  <path d="M17.5 17H8a3.4 3.4 0 0 1-.3-6.8 4.7 4.7 0 0 1 8.9-1.1 3.1 3.1 0 0 1 .9 7.9z"/>
`);

// 两只海鸥剪影
export const iconBird = wrap('ic-sm', `
  <path d="M2.5 13c2.2-3.4 4.4-3.4 6.6 0M12.4 9.5c1.8-2.8 3.6-2.8 5.4 0"/>
`);

// 地平线（远山 + 一道线），viewBox 拉宽当收尾
export const iconHorizon = wrap('ic-wide', `
  <path d="M1 17h34"/>
  <path d="M7 17c2.6-5 5-5 7.6 0M18 17c3.2-6.5 6-6.5 9.2 0"/>
`, '0 0 36 24');

/* ── 夜晚 ── */
export const moonCrescent = wrap('ic-lg',
  '<path d="M14 3.5a9 9 0 1 0 0 17 7 7 0 0 1 0-17z" fill="currentColor" stroke="none"/>');

// 星座连线：四颗星点连成一条折线
export const iconConstellation = wrap('ic-const', `
  <path d="M3 18L10 7L18 14L27 4" stroke-width="1.1" opacity=".75"/>
  <circle cx="3"  cy="18" r="1.3" fill="currentColor" stroke="none"/>
  <circle cx="10" cy="7"  r="1.6" fill="currentColor" stroke="none"/>
  <circle cx="18" cy="14" r="1.3" fill="currentColor" stroke="none"/>
  <circle cx="27" cy="4"  r="1.8" fill="currentColor" stroke="none"/>
`, '0 0 30 24');

// 四芒星
export const iconStar = wrap('ic-md', `
  <path d="M12 3.5c.7 4.3 4.2 7.8 8.5 8.5-4.3.7-7.8 4.2-8.5 8.5-.7-4.3-4.2-7.8-8.5-8.5 4.3-.7 7.8-4.2 8.5-8.5z"/>
`);

export const iconStarSm = wrap('ic-xs', `
  <path d="M12 5c.6 3.5 3.4 6.4 6.9 7-3.5.6-6.3 3.5-6.9 7-.6-3.5-3.4-6.4-6.9-7 3.5-.6 6.3-3.5 6.9-7z"/>
`);
