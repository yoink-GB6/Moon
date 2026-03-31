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

/**
 * 弹出全屏图片查看器
 */
export function openImageViewer(url) {
  let viewer = document.getElementById('char-img-viewer');
  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'char-img-viewer';
    viewer.className = 'char-img-viewer';
    document.body.appendChild(viewer);
  }
  viewer.innerHTML = '<img src="' + url.replace(/"/g, '&quot;') + '" class="char-img-viewer-img"/>';
  viewer.classList.add('show');
  viewer.addEventListener('click', function() { viewer.classList.remove('show'); }, { once: true });
}

/**
 * 关闭模态框
 */
export function closeModal(modal) {
  modal.classList.remove('show');
}

/**
 * 获取地理位置路径
 * @returns {string} 格式：国家 → 城市
 */
export function getLocationPath(cityId, allCities, allCountries, countryId) {
  const city    = cityId    ? allCities.find(c => c.id === cityId)       : null;
  const country = countryId ? allCountries.find(co => co.id === countryId) : null;
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
