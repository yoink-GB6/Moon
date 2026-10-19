// pages/characters/utils.js
// 工具函数

import { escHtml } from '../../core/ui.js';

/**
 * 解析 avatar_url 字段：兼容旧单URL字符串和新JSON数组
 */
export function parseAvatarUrls(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.filter(Boolean);
    return [raw];
  } catch (_) {
    return [raw];
  }
}

/**
 * 从图片数组随机取一张
 */
export function pickRandomUrl(urls) {
  if (!urls || !urls.length) return null;
  return urls[Math.floor(Math.random() * urls.length)];
}

export function parseCharLinks(raw) {
  if (!raw) return [];
  const links = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = re.exec(raw)) !== null) links.push({ label: match[1], url: match[2] });
  const plain = raw.trim();
  if (!links.length && /^https?:\/\/\S+$/.test(plain)) links.push({ label: plain, url: plain });
  return links;
}

export function parseBirthday(raw) {
  const match = String(raw || '').trim().match(/^(?:(\d{4})\/)?(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const maxDay = new Date(2000, month, 0).getDate();
  if (day < 1 || day > maxDay) return null;
  return { day, month, year: match[1] ? Number(match[1]) : null };
}

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatDayMonth(day, month) {
  const monthLabel = SHORT_MONTHS[Number(month) - 1];
  const dayNumber = Number(day);
  if (!monthLabel || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return '';
  return String(dayNumber).padStart(2, '0') + ' ' + monthLabel;
}

export function formatBirthdayShort(raw) {
  const birthday = parseBirthday(raw);
  return birthday ? formatDayMonth(birthday.day, birthday.month) : '';
}

/**
 * 关闭模态框
 */
export function closeModal(modal) {
  modal.classList.remove('show');
}

/**
 * 打开模态框：同一时刻只留一个
 * 连着点「编辑城市」「编辑地标」会叠出两层，所以开新的之前先把别的关掉。
 * 只管 .tl-modal-overlay 这一层，图片管理器/图库那种是从弹窗里叫起来的，不算。
 */
export function openModal(modal) {
  document.querySelectorAll('.tl-modal-overlay.show').forEach(function(el) {
    if (el !== modal) el.classList.remove('show');
  });
  modal.classList.add('show');
}

/**
 * 获取地理位置路径
 * @returns {string} 格式：国家 → 城市
 */
export function getLocationPath(cityId, allCities, allCountries, countryId) {
  const city = cityId ? allCities.find(c => c.id === cityId) : null;
  const country = countryId
    ? allCountries.find(co => co.id === countryId)
    : (city ? allCountries.find(co => co.id === city.country_id) : null);
  return [country?.name, city?.name].filter(Boolean).join(' → ') || '未知';
}

/**
 * 解析人物 description（JSON 数组 or 旧纯文本）
 */
export function parseCharSections(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
    return [{ title: '个人简介', content: raw }];
  } catch (_) {
    return [{ title: '个人简介', content: raw }];
  }
}

/**
 * 渲染子节点 HTML（递归，depth 1/2/3）
 */
export function childHTML(node, depth) {
  if (depth > 1) {
    const label = node.title ? '<strong>' + escHtml(node.title) + '</strong>' : '';
    const text  = node.content ? escHtml(node.content) : '';
    return '<div class="static-text-l3">' + (label && text ? label + '&ensp;' + text : label + text) + '</div>';
  }
  const kids = (node.children && node.children.length)
    ? node.children.map(function(gc) { return childHTML(gc, depth + 1); }).join('')
    : '';
  return '<div class="collapse-item">' +
    '<div class="collapse-header">' + escHtml(node.title || '') + '</div>' +
    '<div class="collapse-content">' +
      '<div class="collapse-inner">' +
        (node.content ? escHtml(node.content) : '') +
        kids +
      '</div>' +
    '</div>' +
  '</div>';
}

/**
 * 渲染折叠小节 HTML（默认折叠）
 */
export function sectionsHTML(sections) {
  if (!sections.length) return '';
  return sections.map(function(s) {
    const ch = (s.children && s.children.length)
      ? s.children.map(function(c) { return childHTML(c, 1); }).join('')
      : '';
    return '<div class="h2-section">' +
      '<div class="collapse-h2"><span>' + escHtml(s.title || '未命名') + '</span></div>' +
      '<div class="h2-content">' +
        (s.content ? '<div class="collapse-inner">' + escHtml(s.content) + '</div>' : '') +
        ch +
      '</div>' +
    '</div>';
  }).join('');
}

/**
 * 选择国家并展开
 */
export function selectCountryAndExpand(countryId, allCountries, State, renderFns) {
  const country = allCountries.find(c => c.id === countryId);
  if (!country) return;
  
  State.setSelectedCountry(country);
  State.setSelectedCity(null);
  State.toggleCountryExpanded(countryId);
  
  renderFns.forEach(fn => fn());
}

/**
 * 选择城市并展开路径
 */
export function selectCityAndExpand(cityId, countryId, allCities, allCountries, State, renderFns) {
  if (!cityId) return;
  
  const city = allCities.find(c => c.id === cityId);
  if (!city) return;
  
  State.setSelectedCity(city);
  
  if (countryId) {
    const country = allCountries.find(c => c.id === countryId);
    State.setSelectedCountry(country);
    State.toggleCountryExpanded(countryId);
  }
  
  renderFns.forEach(fn => fn());
}
