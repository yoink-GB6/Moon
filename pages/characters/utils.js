// pages/characters/utils.js
// 工具函数

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
