// pages/characters/geo-detail.js
import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCountryModal } from './modals/country-modal.js';
import { openCityModal } from './modals/city-modal.js';
import { openLandmarkModal } from './modals/landmark-modal.js';
import { openCharModal } from './modals/character-modal.js';
import { renderGeoTree } from './geo-tree.js';

export function renderGeoDetail() {
  const container = State.pageContainer;
  const detail    = container.querySelector('#geo-detail-view');
  if (!detail) return;
  if (!State.selectedCity && !State.selectedCountry) {
    detail.innerHTML = '<div class="geo-empty">选择一个国家或城市查看详情</div>';
    return;
  }
  if (State.selectedCity) renderCityDetail(detail);
  else renderCountryDetail(detail);
}

function _parseSections(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [{ title: '概述', content: raw }];
  } catch (_) { return [{ title: '概述', content: raw }]; }
}

function _isJSON(str) {
  if (!str) return false;
  try { return Array.isArray(JSON.parse(str)); } catch (_) { return false; }
}

// 递归渲染子节点（depth 1/2/3），和顶级 card 同款折叠样式
function _childHTML(node, depth) {
  const indent = depth > 1 ? 'margin-left:' + ((depth-1)*12) + 'px;' : '';
  const childrenHTML = (node.children && node.children.length && depth < 3)
    ? '<div style="margin-top:6px">' + node.children.map(function(gc) { return _childHTML(gc, depth+1); }).join('') + '</div>'
    : '';
  return '<div class="geo-section-card geo-child-card" style="' + indent + 'margin-bottom:6px">' +
    '<div class="geo-section-toggle">' +
      '<span class="geo-section-title" style="font-size:' + (14 - depth) + 'px">' + escHtml(node.title) + '</span>' +
      '<span class="geo-section-arrow">▼</span>' +
    '</div>' +
    '<div class="geo-section-body">' +
      (node.content ? '<div class="geo-section-content">' + escHtml(node.content) + '</div>' : '') +
      childrenHTML +
    '</div>' +
  '</div>';
}

function _sectionsHTML(sections) {
  if (!sections.length) return '';
  return sections.map(function(s) {
    const childrenHTML = (s.children && s.children.length)
      ? '<div class="geo-section-children">' +
          s.children.map(function(c) { return _childHTML(c, 1); }).join('') +
        '</div>'
      : '';
    return '<div class="geo-section-card">' +
      '<div class="geo-section-toggle">' +
        '<span class="geo-section-title">' + escHtml(s.title) + '</span>' +
        '<span class="geo-section-arrow">▼</span>' +
      '</div>' +
      '<div class="geo-section-body">' +
        (s.content ? '<div class="geo-section-content">' + escHtml(s.content) + '</div>' : '') +
        childrenHTML +
      '</div>' +
    '</div>';
  }).join('');
}

function _bindSectionToggles(detail) {
  detail.querySelectorAll('.geo-section-toggle').forEach(function(t) {
    t.addEventListener('click', function(e) {
      e.stopPropagation();
      t.closest('.geo-section-card').classList.toggle('open');
    });
  });
}

// ── 国家详情 ──────────────────────────────────────────────────

function renderCountryDetail(detail) {
  const country  = State.selectedCountry;
  const cities   = State.allCities.filter(function(c) { return c.country_id === country.id; });
  const sections = _parseSections(country.description);

  const citiesHTML = cities.length
    ? cities.map(function(city) {
        return '<div class="geo-city-card" data-select-city="' + city.id + '">' +
          '<span class="geo-city-card-name">' + escHtml(city.name) + '</span>' +
          '<span class="geo-city-card-arrow">\u203a</span>' +
        '</div>';
      }).join('')
    : '<div class="geo-empty" style="padding:16px 0">暂无城市</div>';

  detail.innerHTML =
    '<div class="geo-detail-header">' +
      '<h2>' + escHtml(country.name) + '</h2>' +
      (isEditor() ? '<button class="btn bn" id="edit-country-' + country.id + '">编辑</button>' : '') +
    '</div>' +
    _sectionsHTML(sections) +
    '<div class="geo-detail-section">' +
      '<h3><span>城市 (' + cities.length + ')</span>' +
        (isEditor() ? '<button class="btn bn" id="add-city-' + country.id + '">+ 添加</button>' : '') +
      '</h3>' +
      '<div class="geo-city-list">' + citiesHTML + '</div>' +
    '</div>';

  if (isEditor()) {
    detail.querySelector('#edit-country-' + country.id)
      ?.addEventListener('click', function() { openCountryModal(country); });
    detail.querySelector('#add-city-' + country.id)
      ?.addEventListener('click', function() { openCityModal(null, country.id); });
  }

  detail.querySelectorAll('[data-select-city]').forEach(function(item) {
    item.addEventListener('click', function() {
      const cityId = parseInt(item.dataset.selectCity);
      State.setSelectedCity(State.allCities.find(function(c) { return c.id === cityId; }));
      renderGeoDetail();
      renderGeoTree();
    });
  });

  _bindSectionToggles(detail);
}

// ── 城市详情 ──────────────────────────────────────────────────

function renderCityDetail(detail) {
  const city      = State.selectedCity;
  const landmarks = State.allLandmarks.filter(function(l) { return l.city_id === city.id; });
  const people    = State.allChars.filter(function(c) { return c.city_id === city.id; });
  const country   = State.allCountries.find(function(c) { return c.id === city.country_id; });

  let sections = _parseSections(city.overview);
  if (!sections.length) {
    const old = [];
    if (city.overview  && !_isJSON(city.overview))  old.push({ title: '概述',     content: city.overview  });
    if (city.geography && !_isJSON(city.geography)) old.push({ title: '地理位置', content: city.geography });
    if (city.climate   && !_isJSON(city.climate))   old.push({ title: '气候',     content: city.climate   });
    if (city.structure && !_isJSON(city.structure)) old.push({ title: '城市结构', content: city.structure });
    if (old.length) sections = old;
  }

  const landmarksHTML = landmarks.length
    ? landmarks.map(function(lm) {
        return '<div class="geo-landmark-item">' +
          '<div><div class="geo-landmark-name">' + escHtml(lm.name) + '</div>' +
          (lm.description ? '<div style="font-size:13px;color:var(--muted)">' + escHtml(lm.description) + '</div>' : '') +
          '</div>' +
          (isEditor() ? '<div class="geo-item-actions"><button class="btn bn" data-edit-landmark="' + lm.id + '">✏️</button></div>' : '') +
        '</div>';
      }).join('')
    : '<div class="geo-empty" style="padding:16px 0">暂无地标</div>';

  const peopleHTML = people.length
    ? people.map(function(p) {
        const age = (p.base_age != null && p.base_age !== '') ? String(p.base_age) + '岁' : '';
        return '<div class="geo-person-item" data-char-id="' + p.id + '">' +
          '<div class="geo-person-av">' +
            (p.avatar_url ? '<img src="' + escHtml(p.avatar_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' : escHtml(p.name.charAt(0))) +
          '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:500">' + escHtml(p.name) + '</div>' +
            (age ? '<div style="font-size:11px;color:var(--muted)">' + age + '</div>' : '') +
          '</div>' +
          '<span style="color:var(--muted);font-size:16px">›</span>' +
        '</div>';
      }).join('')
    : '<div class="geo-empty" style="padding:16px 0">暂无关联人物</div>';

  detail.innerHTML =
    '<div class="geo-detail-header">' +
      '<h2>' + escHtml(city.name) + '</h2>' +
      (isEditor() ? '<button class="btn bn" id="edit-city-' + city.id + '">编辑</button>' : '') +
    '</div>' +
    (country ? '<div style="color:var(--muted);margin-bottom:16px;font-size:13px">所属：' + escHtml(country.name) + '</div>' : '') +
    _sectionsHTML(sections) +
    '<div class="geo-detail-section"><h3><span>地标建筑 (' + landmarks.length + ')</span>' +
      (isEditor() ? '<button class="btn bn" id="add-landmark-' + city.id + '">+ 添加</button>' : '') +
    '</h3>' + landmarksHTML + '</div>' +
    '<div class="geo-detail-section"><h3>关联人物 (' + people.length + ')</h3>' + peopleHTML + '</div>';

  if (isEditor()) {
    detail.querySelector('#edit-city-' + city.id)
      ?.addEventListener('click', function() { openCityModal(city); });
    detail.querySelector('#add-landmark-' + city.id)
      ?.addEventListener('click', function() { openLandmarkModal(null, city.id); });
    detail.querySelectorAll('[data-edit-landmark]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openLandmarkModal(State.allLandmarks.find(function(l) { return l.id === parseInt(btn.dataset.editLandmark); }));
      });
    });
  }

  // 人物点击：编辑模式打开编辑框，只读模式打开介绍弹窗
  detail.querySelectorAll('[data-char-id]').forEach(function(item) {
    item.addEventListener('click', function() {
      const id   = parseInt(item.dataset.charId);
      const char = State.allChars.find(function(c) { return c.id === id; });
      if (!char) return;
      if (isEditor()) { openCharModal(char); } else { _openCharReadonly(char); }
    });
  });

  _bindSectionToggles(detail);
}

// ── 只读人物弹窗 ──────────────────────────────────────────────

function _openCharReadonly(char) {
  const container = State.pageContainer;
  let overlay = container.querySelector('#char-readonly-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'char-readonly-modal';
    overlay.className = 'tl-modal-overlay modal-center';
    container.appendChild(overlay);
  }

  const city    = State.allCities.find(function(c) { return c.id === char.city_id; });
  const country = city ? State.allCountries.find(function(co) { return co.id === city.country_id; }) : null;
  const location = [country && country.name, city && city.name].filter(Boolean).join(' › ');
  const age = (char.base_age != null && char.base_age !== '') ? String(char.base_age) + ' 岁' : '';

  overlay.innerHTML =
    '<div class="tl-modal" style="max-width:420px" onmousedown="event.stopPropagation()">' +
      '<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">' +
        '<div class="geo-person-av" style="width:56px;height:56px;font-size:22px;flex-shrink:0">' +
          (char.avatar_url ? '<img src="' + escHtml(char.avatar_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' : escHtml(char.name.charAt(0))) +
        '</div>' +
        '<div style="flex:1">' +
          '<h2 style="margin:0 0 4px">' + escHtml(char.name) + '</h2>' +
          (age      ? '<div style="font-size:13px;color:var(--muted)">' + age + '</div>' : '') +
          (location ? '<div style="font-size:13px;color:var(--muted)">' + escHtml(location) + '</div>' : '') +
        '</div>' +
      '</div>' +
      (char.description
        ? '<div style="font-size:13px;line-height:1.75;white-space:pre-wrap">' + escHtml(char.description) + '</div>'
        : '<div style="font-size:13px;color:var(--muted);font-style:italic">暂无介绍</div>') +
      '<div style="margin-top:20px;text-align:right">' +
        '<button class="btn bn" id="char-readonly-close">关闭</button>' +
      '</div>' +
    '</div>';

  overlay.classList.add('show');
  overlay.querySelector('#char-readonly-close').addEventListener('click', function() {
    overlay.classList.remove('show');
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.classList.remove('show');
  });
}
