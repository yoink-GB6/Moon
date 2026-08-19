// pages/characters/geo-nav.js
// 选中国家/城市统一走地址栏：点击只负责改 hash，选中和渲染交给 applyRoute 驱动。
// 这样浏览器返回键才能在「国家 ← 城市」之间退回，而不是直接退出地理页。
//
// 写不写历史按「换没换国家」分：
//   国家 → 别的国家、国家 → 城市、跨国换城市 = 大跳转，记一步，返回能原路退回；
//   同一个国家里城市互相切 = 国内浏览，只替换地址，
//   否则连点十几个城市后要按十几次返回才能离开。

import { go, reflect } from '../../core/router.js';
import * as State from './state.js';

let _apply = null;

// 由 pages/geo.js 注册自己的 applyRoute —— 反向 import 会跨页面模块成环
export function setGeoRouteApplier(fn) { _apply = fn; }

export function navSelect(kind, id) {
  const parts = [kind, String(id)];
  let inCountry = false;

  if (kind === 'city' && State.selectedCity) {
    const target = State.allCities.find(function(c) { return String(c.id) === String(id); });
    inCountry = !!target && target.country_id === State.selectedCity.country_id;
  }

  if (inCountry) {
    reflect('geo', ...parts);          // 不写历史，也不触发 hashchange
    if (_apply) _apply(parts);         // 所以得自己驱动一次
    return;
  }

  const before = location.hash;
  go('geo', ...parts);
  if (location.hash === before && _apply) _apply(parts);   // hash 没变就不会有 hashchange
}

// 删除等场景：选中项变了但不该新增历史，把地址栏对齐到当前选中状态
export function navReflect() {
  if (State.selectedCity) reflect('geo', 'city', String(State.selectedCity.id));
  else if (State.selectedCountry) reflect('geo', 'country', String(State.selectedCountry.id));
  else reflect('geo');
}
