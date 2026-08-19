// pages/characters/geo-detail.js
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { mdToChildren } from './modals/country-modal.js';
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

// 关联人物：只放圆头像，一行能塞几个由 grid 自己算（同人物页的 auto-fill 思路）
function _personTileHTML(p) {
  const url = pickRandomUrl(parseAvatarUrls(p.avatar_url));
  return '<div class="geo-person-item" data-char-id="' + p.id + '"' +
      (url ? ' data-avatar="' + escHtml(url) + '"' : '') + '>' +
    '<div class="geo-person-av">' +
      (url ? '<img src="' + escHtml(url) + '"/>' : escHtml(p.name.charAt(0))) +
    '</div>' +
  '</div>';
}

// 人多时默认只铺一行：一行能放几个跟着容器宽度算，放不下就把最后一格让给 …
// 头像每次渲染是随机抽的，所以先定好顺序和图，重排时不重抽，免得一拖窗口整排人就换了
function _mountPeopleBox(box, people) {
  const tiles = people.slice().sort(function() { return Math.random() - 0.5; }).map(_personTileHTML);
  let expanded = false;
  let lastW    = -1;

  function layout() {
    if (expanded) return;
    box.innerHTML = '<div class="geo-person-row">' + tiles.join('') + '</div>';
    const row  = box.querySelector('.geo-person-row');
    const each = row.firstElementChild;
    if (each) {
      const gap  = parseFloat(getComputedStyle(row).columnGap) || 0;
      const fit  = Math.max(1, Math.floor((row.clientWidth + gap) / (each.offsetWidth + gap)));
      if (tiles.length > fit) {
        const keep = row.querySelectorAll('.geo-person-item');
        for (let i = fit - 1; i < keep.length; i++) keep[i].remove();
        const more = document.createElement('button');
        more.className   = 'geo-person-more';
        more.title       = '展开全部';
        more.textContent = '…';
        more.addEventListener('click', function() {
          expanded = true;
          box.innerHTML = '<div class="geo-person-grid">' + tiles.join('') + '</div>';  // 展开就铺全部，不再收回去
          _bindPeople(box);
        });
        row.appendChild(more);
      }
    }
    _bindPeople(box);
  }

  layout();
  lastW = box.clientWidth;

  // 窗口/侧栏宽度变了重算一次；宽度没变就不动，避免 ResizeObserver 自激
  const ro = new ResizeObserver(function() {
    if (!box.isConnected) { ro.disconnect(); return; }
    if (box.clientWidth === lastW) return;
    lastW = box.clientWidth;
    layout();
  });
  ro.observe(box);
}

function _bindPeople(root) {
  // 人物点击：左键看介绍，编辑模式下右键/长按进编辑框
  root.querySelectorAll('[data-char-id]').forEach(function(item) {
    bindCharOpen(item, function() {
      const id = parseInt(item.dataset.charId);
      return {
        char: State.allChars.find(function(c) { return c.id === id; }),
        avatar: item.dataset.avatar || undefined,
      };
    });
  });
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

  // 国内所有人：直接挂在国家上的 + 挂在这个国家某座城市里的
  const cityIds = new Set(cities.map(function(c) { return c.id; }));
  const people  = State.allChars.filter(function(p) {
    return p.country_id === country.id || (p.city_id && cityIds.has(p.city_id));
  });

  const citiesHTML = cities.length
    ? cities.map(function(city) {
        return '<span class="geo-city-link" data-select-city="' + city.id + '">' +
          escHtml(city.name) +
        '</span>';
      }).join('')
    : '<div class="geo-empty" style="padding:16px 0">恭喜你，哥伦布</div>';

  detail.innerHTML =
    '<div class="geo-detail-header"><h2>' + escHtml(country.name) + '</h2></div>' +
    _sectionsHTML(sections) +
    '<div class="geo-detail-section">' +
      '<h3><span>城市 (' + cities.length + ')</span></h3>' +
      '<div class="geo-city-list">' + citiesHTML + '</div>' +
    '</div>' +
    (people.length
      ? '<div class="geo-detail-section"><h3>人物 (' + people.length + ')</h3>' +
          '<div id="geo-country-people"></div>' +
        '</div>'
      : '');

  const peopleBox = detail.querySelector('#geo-country-people');
  if (peopleBox) _mountPeopleBox(peopleBox, people);

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
    ? '<div id="geo-city-people"></div>'
    : '<div class="geo-empty" style="padding:16px 0">さみしい……</div>';

  detail.innerHTML =
    '<div class="geo-detail-header"><h2>' + escHtml(city.name) + '</h2></div>' +
    (country ? '<div style="color:var(--muted);margin-bottom:16px;font-size:13px">所属：' + escHtml(country.name) + '</div>' : '') +
    _flatSectionsHTML(sections) +
    '<div class="geo-detail-section"><h3>地标建筑 (' + landmarks.length + ')</h3>' + landmarksHTML + '</div>' +
    '<div class="geo-detail-section"><h3>关联人物 (' + people.length + ')</h3>' + peopleHTML + '</div>';

  const peopleBox = detail.querySelector('#geo-city-people');
  if (peopleBox) _mountPeopleBox(peopleBox, people);
}


