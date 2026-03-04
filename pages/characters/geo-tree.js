// pages/characters/geo-tree.js
import { isEditor } from '../../core/auth.js';
import { escHtml } from '../../core/ui.js';
import * as State from './state.js';
import { renderGeoDetail } from './geo-detail.js';
import { openCountryModal } from './modals/country-modal.js';
import { openCityModal } from './modals/city-modal.js';
import { openLandmarkModal } from './modals/landmark-modal.js';

export function renderGeoTree() {
  const container = State.pageContainer;
  const list = container.querySelector('#geo-tree-list');
  if (!list) return;

  if (!State.allCountries.length && !State.allCities.some(c => !c.country_id)) {
    list.innerHTML = '<div class="geo-empty">暂无数据</div>';
    bindGeoTree();
    return;
  }

  let html = '';

  function renderCityNode(city) {
    const cityActive   = State.selectedCity && State.selectedCity.id === city.id;
    const cityExpanded = State.expandedCities.has(city.id);
    const landmarks    = State.allLandmarks.filter(l => l.city_id === city.id);

    let out = '<div class="gt-city' + (cityActive ? ' active' : '') + '" data-type="city" data-id="' + city.id + '">' +
      '<div class="gt-row">' +
        '<span class="gt-toggle" data-toggle-city="' + city.id + '">' + (cityExpanded ? '▾' : '▸') + '</span>' +
        '<span class="gt-label">' + escHtml(city.name) + '</span>' +
        (isEditor()
          ? '<span class="gt-actions">' +
              '<button class="gt-btn" data-add-landmark="' + city.id + '" title="添加地标">＋</button>' +
              '<button class="gt-btn" data-edit-city="' + city.id + '" title="编辑城市">✏</button>' +
            '</span>'
          : '') +
      '</div>' +
    '</div>';

    if (cityExpanded) {
      if (landmarks.length) {
        landmarks.forEach(function(lm) {
          out += '<div class="gt-landmark" data-type="landmark" data-id="' + lm.id + '" data-city-id="' + city.id + '">' +
            '<div class="gt-row">' +
              '<span class="gt-label">' + escHtml(lm.name) + '</span>' +
              (isEditor()
                ? '<span class="gt-actions">' +
                    '<button class="gt-btn" data-edit-landmark="' + lm.id + '" title="编辑地标">✏</button>' +
                  '</span>'
                : '') +
            '</div>' +
          '</div>';
        });
      } else {
        out += '<div class="gt-empty-lm">暂无地标</div>';
      }
    }
    return out;
  }

  State.allCountries.forEach(function(country) {
    const cities     = State.allCities.filter(function(c) { return c.country_id === country.id; });
    const isExpanded = State.expandedCountries.has(country.id);
    const isActive   = State.selectedCountry && State.selectedCountry.id === country.id && !State.selectedCity;

    html += '<div class="gt-country' + (isActive ? ' active' : '') + '" data-type="country" data-id="' + country.id + '">' +
      '<div class="gt-row">' +
        '<span class="gt-toggle" data-toggle="' + country.id + '">' + (isExpanded ? '▾' : '▸') + '</span>' +
        '<span class="gt-label">' + escHtml(country.name) + '</span>' +
        (isEditor()
          ? '<span class="gt-actions">' +
              '<button class="gt-btn" data-add-city="' + country.id + '" title="添加城市">＋</button>' +
              '<button class="gt-btn" data-edit="' + country.id + '" title="编辑国家">✏</button>' +
            '</span>'
          : '') +
      '</div>' +
    '</div>';

    if (isExpanded) {
      cities.forEach(function(city) { html += renderCityNode(city); });
      if (!cities.length) html += '<div class="gt-empty-city">暂无城市</div>';
    }
  });

  const noCities = State.allCities.filter(function(c) { return !c.country_id; });
  if (noCities.length) {
    html += '<div class="gt-group-label">未分配国家</div>';
    noCities.forEach(function(city) { html += renderCityNode(city); });
  }

  list.innerHTML = html;
  bindGeoTree();
}

export function bindGeoTree() {
  const container = State.pageContainer;
  const list = container.querySelector('#geo-tree-list');
  if (!list) return;

  list.querySelectorAll('[data-toggle]').forEach(function(toggle) {
    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      State.toggleCountryExpanded(parseInt(toggle.dataset.toggle));
      renderGeoTree();
    });
  });

  list.querySelectorAll('[data-toggle-city]').forEach(function(toggle) {
    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      State.toggleCityExpanded(parseInt(toggle.dataset.toggleCity));
      renderGeoTree();
    });
  });

  list.querySelectorAll('[data-type]').forEach(function(item) {
    item.addEventListener('click', function(e) {
      if (e.target.closest('.gt-actions'))        return;
      if (e.target.closest('[data-toggle-city]')) return;
      if (e.target.closest('[data-toggle]'))      return;

      const type = item.dataset.type;
      const id   = parseInt(item.dataset.id);

      if (type === 'country') {
        State.setSelectedCountry(State.allCountries.find(function(c) { return c.id === id; }));
        State.setSelectedCity(null);
        State.toggleCountryExpanded(id);
      } else if (type === 'city') {
        const city = State.allCities.find(function(c) { return c.id === id; });
        State.setSelectedCity(city);
        State.setSelectedCountry(State.allCountries.find(function(co) { return co.id === (city && city.country_id); }));
      } else if (type === 'landmark') {
        const cityId = parseInt(item.dataset.cityId);
        const city   = State.allCities.find(function(c) { return c.id === cityId; });
        if (city) {
          State.setSelectedCity(city);
          State.setSelectedCountry(State.allCountries.find(function(co) { return co.id === city.country_id; }));
        }
      }

      renderGeoDetail();
      renderGeoTree();
    });
  });

  if (isEditor()) {
    list.querySelectorAll('[data-add-city]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); openCityModal(null, parseInt(btn.dataset.addCity)); });
    });
    list.querySelectorAll('[data-edit]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); openCountryModal(State.allCountries.find(function(c) { return c.id === parseInt(btn.dataset.edit); })); });
    });
    list.querySelectorAll('[data-edit-city]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); openCityModal(State.allCities.find(function(c) { return c.id === parseInt(btn.dataset.editCity); })); });
    });
    list.querySelectorAll('[data-add-landmark]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const cityId = parseInt(btn.dataset.addLandmark);
        if (!State.expandedCities.has(cityId)) State.toggleCityExpanded(cityId);
        openLandmarkModal(null, cityId);
      });
    });
    list.querySelectorAll('[data-edit-landmark]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); openLandmarkModal(State.allLandmarks.find(function(l) { return l.id === parseInt(btn.dataset.editLandmark); })); });
    });
  }
}
