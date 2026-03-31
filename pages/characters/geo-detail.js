// pages/characters/geo-detail.js
import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCountryModal, mdToChildren } from './modals/country-modal.js';
import { openCityModal } from './modals/city-modal.js';
import { openLandmarkModal } from './modals/landmark-modal.js';
import { openCharModal } from './modals/character-modal.js';
import { openCharReadonly } from './modals/char-readonly-modal.js';
import { parseAvatarUrls, pickRandomUrl, childHTML } from './utils.js';
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

function _sectionsHTML(sections) {
  if (!sections.length) return '';
  return sections.map(function(s) {
    // 兼容旧数据：若 content 里有 # 语法，解析成 children
    const parsed   = mdToChildren(s.content || '');
    const content  = parsed.content || '';
    const children = (s.children && s.children.length) ? s.children
                   : (parsed.children && parsed.children.length) ? parsed.children : [];
    return '<div class="h2-section">' +
      '<div class="collapse-h2"><span>' + escHtml(s.title || '未命名') + '</span></div>' +
      '<div class="h2-content">' +
        (content ? '<div class="collapse-inner">' + escHtml(content) + '</div>' : '') +
        children.map(function(c) { return childHTML(c, 1); }).join('') +
      '</div>' +
    '</div>';
  }).join('');
}

function _bindSectionToggles(detail) {
  detail.querySelectorAll('.collapse-h2').forEach(function(h) {
    h.addEventListener('click', function(e) {
      e.stopPropagation();
      h.closest('.h2-section').classList.toggle('active');
    });
  });
  detail.querySelectorAll('.collapse-header').forEach(function(h) {
    h.addEventListener('click', function(e) {
      e.stopPropagation();
      h.closest('.collapse-item').classList.toggle('active');
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
        return '<span class="geo-city-link" data-select-city="' + city.id + '">' +
          escHtml(city.name) +
        '</span>';
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
        const descParas = lm.description
          ? lm.description.split(/\n+/).filter(function(l) { return l.trim(); })
              .map(function(l) { return '<p class="geo-landmark-desc">' + escHtml(l) + '</p>'; }).join('')
          : '';
        return '<div class="geo-landmark-item">' +
          '<blockquote class="geo-landmark-block">' +
            '<div class="geo-landmark-name">' + escHtml(lm.name) + '</div>' +
            descParas +
          '</blockquote>' +
          (isEditor() ? '<div class="geo-item-actions"><button class="btn bn" data-edit-landmark="' + lm.id + '">✎</button></div>' : '') +
        '</div>';
      }).join('')
    : '<div class="geo-empty" style="padding:16px 0">暂无地标</div>';

  const peopleHTML = people.length
    ? people.map(function(p) {
        const age = (p.base_age != null && p.base_age !== '') ? String(p.base_age) + '岁' : '';
        const pAvatarUrl = pickRandomUrl(parseAvatarUrls(p.avatar_url));
        return '<div class="geo-person-item" data-char-id="' + p.id + '"' + (pAvatarUrl ? ' data-avatar="' + escHtml(pAvatarUrl) + '"' : '') + '>' +
          '<div class="geo-person-av">' +
            (pAvatarUrl ? '<img src="' + escHtml(pAvatarUrl) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' : escHtml(p.name.charAt(0))) +
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
      if (isEditor()) { openCharModal(char); } else { openCharReadonly(char, undefined, item.dataset.avatar || undefined); }
    });
  });

  _bindSectionToggles(detail);
}


