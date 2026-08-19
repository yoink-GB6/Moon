// pages/characters/geo-detail.js
import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { openCountryModal, mdToChildren } from './modals/country-modal.js';
import { openCityModal } from './modals/city-modal.js';
import { openLandmarksModal } from './modals/landmark-modal.js';
import { bindCharOpen } from './char-open.js';
import { parseAvatarUrls, pickRandomUrl, childHTML } from './utils.js';
import { navSelect } from './geo-nav.js';
import { parseSections } from './modals/section-editor.js';

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

// 城市 / 地标的小节：内容不长，直接摊开显示，不做折叠
// 结构统一为「左竖线 + 首行标题 + 正文」，深层 children 往里缩一级
function _subHTML(node) {
  const title = node.title ? '<div class="geo-sec-subtitle">' + escHtml(node.title) + '</div>' : '';
  const body  = node.content ? '<div class="geo-sec-body">' + escHtml(node.content) + '</div>' : '';
  const kids  = (node.children && node.children.length)
    ? node.children.map(_subHTML).join('') : '';
  return '<div class="geo-sec-sub">' + title + body + kids + '</div>';
}

function _flatSectionsHTML(sections) {
  if (!sections.length) return '';
  return '<div class="geo-secs">' + sections.map(function(s) {
    return '<div class="geo-sec">' +
      '<div class="geo-sec-title">' + escHtml(s.title || '未命名') + '</div>' +
      (s.content ? '<div class="geo-sec-body">' + escHtml(s.content) + '</div>' : '') +
      ((s.children && s.children.length) ? s.children.map(_subHTML).join('') : '') +
    '</div>';
  }).join('') + '</div>';
}

function _sectionsHTML(sections) {
  if (!sections.length) return '';
  return sections.map(function(s, i) {
    // 兼容旧数据：若 content 里有 # 语法，解析成 children
    const parsed   = mdToChildren(s.content || '');
    const content  = parsed.content || '';
    const children = (s.children && s.children.length) ? s.children
                   : (parsed.children && parsed.children.length) ? parsed.children : [];
    // 第一节通常是概述，默认展开，省一次点击
    return '<div class="h2-section' + (i === 0 ? ' active' : '') + '">' +
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
  const sections = parseSections(country.description);

  const citiesHTML = cities.length
    ? cities.map(function(city) {
        return '<span class="geo-city-link" data-select-city="' + city.id + '">' +
          escHtml(city.name) +
        '</span>';
      }).join('')
    : '<div class="geo-empty" style="padding:16px 0">恭喜你，哥伦布</div>';

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
      navSelect('city', parseInt(item.dataset.selectCity));
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

  const sections = parseSections(city.overview);

  // 地标 = 「地标建筑」这一块的小节，和城市小节同一套块样式
  const landmarksHTML = landmarks.length
    ? _flatSectionsHTML(landmarks.map(function(lm) { return { title: lm.name, content: lm.description || '' }; }))
    : '<div class="geo-empty" style="padding:16px 0">恭喜你，哥伦布</div>';

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
    : '<div class="geo-empty" style="padding:16px 0">さみしい……</div>';

  detail.innerHTML =
    '<div class="geo-detail-header">' +
      '<h2>' + escHtml(city.name) + '</h2>' +
      (isEditor() ? '<button class="btn bn" id="edit-city-' + city.id + '">编辑</button>' : '') +
    '</div>' +
    (country ? '<div style="color:var(--muted);margin-bottom:16px;font-size:13px">所属：' + escHtml(country.name) + '</div>' : '') +
    _flatSectionsHTML(sections) +
    '<div class="geo-detail-section"><h3><span>地标建筑 (' + landmarks.length + ')</span>' +
      (isEditor() ? '<button class="btn bn" id="edit-landmarks-' + city.id + '">编辑</button>' : '') +
    '</h3>' + landmarksHTML + '</div>' +
    '<div class="geo-detail-section"><h3>关联人物 (' + people.length + ')</h3>' + peopleHTML + '</div>';

  if (isEditor()) {
    detail.querySelector('#edit-city-' + city.id)
      ?.addEventListener('click', function() { openCityModal(city); });
    detail.querySelector('#edit-landmarks-' + city.id)
      ?.addEventListener('click', function() { openLandmarksModal(city.id); });
  }

  // 人物点击：左键看介绍，编辑模式下右键/长按进编辑框
  detail.querySelectorAll('[data-char-id]').forEach(function(item) {
    bindCharOpen(item, function() {
      const id = parseInt(item.dataset.charId);
      return {
        char: State.allChars.find(function(c) { return c.id === id; }),
        avatar: item.dataset.avatar || undefined,
      };
    });
  });
}


