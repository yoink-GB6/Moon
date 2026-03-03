// pages/characters/state.js
// 状态管理 - 集中管理所有全局状态

// ========== 数据状态 ==========
export let allChars = [];
export let allCountries = [];
export let allCities = [];
export let allLandmarks = [];

// ========== UI 状态 ==========
export let currentTab = 'characters';
export let selectedCountry = null;
export let selectedCity = null;
export let searchQuery = '';
export let expandedCountries = new Set();

// ========== 编辑状态 ==========
export let editingCharId = null;
export let editingCountryId = null;
export let editingCityId = null;
export let editingLandmarkId = null;
export let pendingAvatar = undefined;
export let pendingAvatarIsFile = false;

// ========== 系统引用 ==========
export let pageContainer = null;
export let charsChannel = null;
export let geoChannel = null;

// ========== 更新函数 ==========
export function setAllChars(data) { allChars = data; }
export function setAllCountries(data) { allCountries = data; }
export function setAllCities(data) { allCities = data; }
export function setAllLandmarks(data) { allLandmarks = data; }

export function setCurrentTab(tab) { currentTab = tab; }
export function setSelectedCountry(country) { selectedCountry = country; }
export function setSelectedCity(city) { selectedCity = city; }
export function setSearchQuery(query) { searchQuery = query; }

export function setEditingCharId(id) { editingCharId = id; }
export function setEditingCountryId(id) { editingCountryId = id; }
export function setEditingCityId(id) { editingCityId = id; }
export function setEditingLandmarkId(id) { editingLandmarkId = id; }

export function setPendingAvatar(avatar, isFile) {
  pendingAvatar = avatar;
  pendingAvatarIsFile = isFile;
}

export function setPageContainer(container) { pageContainer = container; }
export function setCharsChannel(channel) { charsChannel = channel; }
export function setGeoChannel(channel) { geoChannel = channel; }

export function toggleCountryExpanded(countryId) {
  if (expandedCountries.has(countryId)) {
    expandedCountries.delete(countryId);
  } else {
    expandedCountries.add(countryId);
  }
}
