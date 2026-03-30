// pages/characters/utils.js
// 工具函数

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
export function getLocationPath(cityId, allCities, allCountries) {
  if (!cityId) return '未知';
  
  const city = allCities.find(c => c.id === cityId);
  if (!city) return '未知';
  
  const country = allCountries.find(co => co.id === city.country_id);
  return [country?.name, city.name].filter(Boolean).join(' → ');
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
