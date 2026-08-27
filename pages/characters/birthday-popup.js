import { supaClient } from '../../core/supabase-client.js';
import { bindOverlayDismiss, showToast } from '../../core/ui.js';
import { bindModalBack, releaseModalBack } from '../../core/modal-history.js';
import { moonCrescent } from '../../core/icons.js';
import { dominantColor } from './dominant-color.js';
import { formatDayMonth, parseAvatarUrls, parseBirthday, pickRandomUrl } from './utils.js';
import {
  loadBirthdayElementBundle, mountBirthdayElements,
  preloadAsset, preloadElementBundle,
} from './birthday-elements.js';
import { createBirthdayParticles } from './birthday-particles.js';
import { createBirthdayWishes } from './birthday-wishes.js';
import { birthdayDateKey, hasCharacterCardOpened } from './birthday-visit.js';

const SEEN_PREFIX = 'moon-birthday-seen:';
const CHECKED_PREFIX = 'moon-birthday-checked:';
const PERSON_PREFIX = 'moon-birthday-person:';
const VISITOR_STATE_KEY = 'moon-birthday-visitor-45-state';
const VISITOR_CHANCES = [0.006, 0.01, 0.018, 0.03, 0.05, 0.08, 0.12, 0.18, 0.27, 0.4, 0.6, 1];
const VIEW_BIRTHDAY = 'birthday';
const VIEW_REDIRECTED = 'redirected';
const VIEW_TODAY = 'today';

let _started = false;
let _overlay = null;
let _matches = [];
let _index = 0;
let _today = null;
let _particles = null;
let _wishes = null;
let _elementCleanup = null;
let _switchSeq = 0;
let _viewMode = VIEW_BIRTHDAY;
const _artByChar = new Map();
const _bundleByChar = new Map();
let _visitorFallbackState = { visitDays: 0, lastVisitDate: '', lastRollDate: '', lastTriggeredDate: '' };

function storageHas(key) {
  try { return localStorage.getItem(key) === '1'; }
  catch (_) { return false; }
}

function storageSet(key) {
  try { localStorage.setItem(key, '1'); }
  catch (_) {}
}

function storageGet(key) {
  try { return localStorage.getItem(key); }
  catch (_) { return null; }
}

function storageSetValue(key, value) {
  try { localStorage.setItem(key, String(value)); }
  catch (_) {}
}

function readVisitorState() {
  let raw = null;
  try { raw = localStorage.getItem(VISITOR_STATE_KEY); }
  catch (_) { return { ..._visitorFallbackState }; }
  try {
    const value = JSON.parse(raw);
    return {
      visitDays: Math.min(VISITOR_CHANCES.length, Math.max(0, Number(value?.visitDays) || 0)),
      lastVisitDate: typeof value?.lastVisitDate === 'string' ? value.lastVisitDate : '',
      lastRollDate: typeof value?.lastRollDate === 'string' ? value.lastRollDate : '',
      lastTriggeredDate: typeof value?.lastTriggeredDate === 'string' ? value.lastTriggeredDate : '',
    };
  } catch (_) {
    return { ..._visitorFallbackState };
  }
}

function writeVisitorState(state) {
  _visitorFallbackState = { ...state };
  try { localStorage.setItem(VISITOR_STATE_KEY, JSON.stringify(state)); }
  catch (_) {}
}

function recordVisitorDay(dateKey) {
  const state = readVisitorState();
  if (state.lastVisitDate !== dateKey) {
    state.visitDays = Math.min(VISITOR_CHANCES.length, state.visitDays + 1);
    state.lastVisitDate = dateKey;
    writeVisitorState(state);
  }
  return state;
}

function visitorBlocked(dateKey) {
  return Boolean(storageGet(PERSON_PREFIX + dateKey)
    || storageHas(SEEN_PREFIX + dateKey)
    || hasCharacterCardOpened(dateKey));
}

async function maybeTriggerVisitor(characterDate, dateKey, initialPageReady) {
  if (visitorBlocked(dateKey)) return;

  const currentState = readVisitorState();
  if (currentState.lastRollDate === dateKey) return;
  const state = recordVisitorDay(dateKey);
  state.lastRollDate = dateKey;
  writeVisitorState(state);
  const chance = VISITOR_CHANCES[
    Math.max(0, Math.min(VISITOR_CHANCES.length - 1, state.visitDays - 1))
  ];
  if (Math.random() >= chance) return;

  const { data: character, error } = await supaClient.from('characters')
  .select('*')
  .eq('id', 45)
  .maybeSingle();
  
  if (error) {
    console.warn('[birthday] 随机彩蛋人物加载失败:', error.message);
    return;
  }
  if (!characters?.length) return;
  const character = characters[Math.floor(Math.random() * characters.length)];

  _today = characterDate;
  _viewMode = isBirthdayToday(character, characterDate) ? VIEW_BIRTHDAY : VIEW_TODAY;
  _matches = [character];
  _index = 0;
  if (!_overlay) _overlay = buildOverlay();
  cleanupVisuals();
  const prepared = await prepareCharacter(0, true);
  await Promise.resolve(initialPageReady).catch(() => {});
  if (!prepared) return;
  if (visitorBlocked(dateKey)
      || document.querySelector('.tl-modal-overlay.show,#pw-modal.show,.birthday-overlay.show')) {
    if (!_overlay.classList.contains('show')) cleanupVisuals();
    return;
  }

  storageSetValue(PERSON_PREFIX + dateKey, character.id);
  showBirthday();
  const triggeredState = readVisitorState();
  triggeredState.visitDays = 0;
  triggeredState.lastTriggeredDate = dateKey;
  writeVisitorState(triggeredState);
}

function themeOf(character) {
  const raw = character?.birthday_theme;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) { return {}; }
}

function artOf(character) {
  if (_artByChar.has(character.id)) return _artByChar.get(character.id);
  const art = character.birthday_art_url || pickRandomUrl(parseAvatarUrls(character.avatar_url));
  _artByChar.set(character.id, art || '');
  return art || '';
}

function currentCharacter() { return _matches[_index] || null; }

function isBirthdayToday(character, date) {
  const birthday = parseBirthday(character?.birthday);
  return Boolean(birthday
    && birthday.day === date.getDate()
    && birthday.month === date.getMonth() + 1);
}

function applyThemeLabel(label, text) {
  const hasText = Boolean(text);
  label.textContent = hasText ? text : '\u00a0';
  label.classList.toggle('birthday-theme-label-empty', !hasText);
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'birthday-overlay';
  overlay.className = 'birthday-overlay';
  overlay.innerHTML = `
    <canvas class="birthday-particle-canvas" aria-hidden="true"></canvas>
    <div class="birthday-danmaku" aria-hidden="true"></div>
    <section class="birthday-stage" role="dialog" aria-modal="true">
      <div class="birthday-aura" aria-hidden="true"></div>
      <div class="birthday-slot birthday-slot-stage-backdrop" data-birthday-slot="stage-backdrop" aria-hidden="true"></div>
      <div class="birthday-theme-label birthday-theme-label-empty" aria-hidden="true">&nbsp;</div>
      <div class="birthday-portrait-shell">
        <div class="birthday-slot birthday-slot-portrait-top" data-birthday-slot="portrait-top" aria-hidden="true"></div>
        <div class="birthday-slot birthday-slot-portrait-left" data-birthday-slot="portrait-left" aria-hidden="true"></div>
        <div class="birthday-art-frame">
          <img class="birthday-art" alt="" draggable="false"/>
          <span class="birthday-art-placeholder" aria-hidden="true">${moonCrescent}</span>
        </div>
        <div class="birthday-slot birthday-slot-portrait-right" data-birthday-slot="portrait-right" aria-hidden="true"></div>
        <div class="birthday-slot birthday-slot-portrait-bottom" data-birthday-slot="portrait-bottom" aria-hidden="true"></div>
      </div>
      <div class="birthday-stamp"></div>
      <div class="birthday-wish-box">
        <form class="birthday-wish-form">
          <input class="birthday-wish-input" type="text" maxlength="60"
                 placeholder="生日祝福……" aria-label="生日祝福" autocomplete="off" enterkeyhint="send"/>
          <button class="birthday-send" type="submit" aria-label="发送祝福">↑</button>
        </form>
      </div>
      <div class="birthday-pages" aria-hidden="true"></div>
    </section>
    <button type="button" class="birthday-switch birthday-prev" aria-label="上一位生日角色">‹</button>
    <button type="button" class="birthday-switch birthday-next" aria-label="下一位生日角色">›</button>`;
  document.body.appendChild(overlay);

  bindOverlayDismiss(overlay, () => closeBirthday(true));
  overlay.querySelector('.birthday-prev').addEventListener('click', () => switchCharacter(-1));
  overlay.querySelector('.birthday-next').addEventListener('click', () => switchCharacter(1));
  overlay.querySelector('.birthday-art').addEventListener('error', event => {
    event.currentTarget.hidden = true;
    overlay.querySelector('.birthday-art-placeholder').classList.add('show');
  });
  overlay.querySelector('.birthday-art').addEventListener('load', event => {
    event.currentTarget.hidden = false;
    overlay.querySelector('.birthday-art-placeholder').classList.remove('show');
  });

  _particles = createBirthdayParticles(overlay.querySelector('.birthday-particle-canvas'));
  _wishes = createBirthdayWishes({ root: overlay });
  return overlay;
}

function slotsOf() {
  const slots = {};
  _overlay.querySelectorAll('[data-birthday-slot]').forEach(slot => {
    slots[slot.dataset.birthdaySlot] = slot;
  });
  slots['viewport-particles'] = _overlay.querySelector('.birthday-particle-canvas');
  return slots;
}

function colorParts(value) {
  const match = String(value || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const number = parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function applyCharacterBase(character, art, presentation = {}) {
  const stage = _overlay.querySelector('.birthday-stage');
  const image = _overlay.querySelector('.birthday-art');
  const placeholder = _overlay.querySelector('.birthday-art-placeholder');
  const theme = themeOf(character);
  const birthdayToday = isBirthdayToday(character, _today);
  const configuredAccent = presentation.accentColor || theme.accent;
  const accent = configuredAccent && CSS.supports('color', String(configuredAccent))
    ? String(configuredAccent) : '';
  const rgb = colorParts(accent);

  _overlay.dataset.birthdayComposer = presentation.composerStyle || 'default';
  _overlay.dataset.birthdayStampPlacement = presentation.stampPlacement || 'default';
  _overlay.dataset.birthdayPortraitFrame = presentation.portraitFrame || 'default';

  _overlay.style.removeProperty('--birthday-accent');
  _overlay.style.removeProperty('--birthday-accent-rgb');
  _overlay.style.removeProperty('--birthday-viewport-background');
  if (accent) _overlay.style.setProperty('--birthday-accent', accent);
  if (presentation.viewportBackground) {
    _overlay.style.setProperty('--birthday-viewport-background', presentation.viewportBackground);
  }
  if (rgb) {
    _overlay.style.setProperty('--birthday-accent-rgb', rgb.join(','));
    _particles.setAccent(rgb);
  } else _particles.setAccent([208, 175, 78]);
  image.hidden = !art;
  placeholder.classList.toggle('show', !art);
  if (art) {
    image.src = art;
    image.alt = character.name;
  }
  stage.setAttribute('aria-label', birthdayToday
    ? '今天是' + character.name + '的生日'
    : '今天和' + character.name + '一起度过');
  _overlay.querySelector('.birthday-wish-input').placeholder =
    'TO ' + character.name + '：……';
  const stamp = _overlay.querySelector('.birthday-stamp');
  if (_viewMode === VIEW_REDIRECTED) {
    stamp.textContent = '你今天还想和谁一起过？';
  } else {
    stamp.textContent = (birthdayToday ? 'HAPPY BIRTHDAY · ' : 'HAPPY TODAY · ')
      + formatDayMonth(_today.getDate(), _today.getMonth() + 1);
  }
  const multiple = _matches.length > 1;
  _overlay.querySelectorAll('.birthday-switch').forEach(button => { button.hidden = !multiple; });
  _overlay.querySelector('.birthday-pages').textContent = multiple ? (_index + 1) + ' / ' + _matches.length : '';

  if (art && !accent) dominantColor(art).then(nextRgb => {
    if (!nextRgb || currentCharacter()?.id !== character.id) return;
    _overlay.style.setProperty('--birthday-accent-rgb', nextRgb.join(','));
    _particles.setAccent(nextRgb);
  });
}

async function bundleOf(character) {
  if (!_bundleByChar.has(character.id))
    _bundleByChar.set(character.id, loadBirthdayElementBundle(supaClient, character));
  return _bundleByChar.get(character.id);
}

async function preloadCharacter(character) {
  const bundle = await bundleOf(character);
  await Promise.allSettled([
    preloadAsset(artOf(character)),
    preloadAsset(bundle.presentation?.sendIconUrl),
    preloadElementBundle(bundle),
  ]);
  return bundle;
}

async function prepareCharacter(index, waitForAssets = true) {
  const seq = ++_switchSeq;
  const character = _matches[index];
  const art = artOf(character);
  const bundle = await (waitForAssets ? preloadCharacter(character) : bundleOf(character));
  if (seq !== _switchSeq) return false;

  if (_elementCleanup) { _elementCleanup(); _elementCleanup = null; }
  _particles.clear();
  applyCharacterBase(character, art, bundle.presentation);
  const themeLabel = _overlay.querySelector('.birthday-theme-label');
  const themeLabelText = bundle.presentation?.stampPlacement === 'theme-label'
    ? _overlay.querySelector('.birthday-stamp').textContent
    : (bundle.presentation?.stageLabel || character.name || '');
  applyThemeLabel(themeLabel, themeLabelText);
  const slots = slotsOf();
  const visibleBundle = _viewMode === VIEW_REDIRECTED ? {
    ...bundle,
    records: bundle.records.filter(record => record.element?.render_method !== 'birthday-party'),
  } : bundle;
  _elementCleanup = mountBirthdayElements(visibleBundle, slots, {
    character,
    particles: _particles,
    portraitTopHost: slots['portrait-top'],
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  _wishes.setSendIcon(bundle.presentation?.sendIconUrl);
  if (_overlay.classList.contains('show'))
    _wishes.setCharacter(character, _today.getFullYear());
  return true;
}

async function switchCharacter(step) {
  if (_matches.length < 2) return;
  const next = (_index + step + _matches.length) % _matches.length;
  const stage = _overlay.querySelector('.birthday-stage');
  stage.classList.add('birthday-stage-switching');
  _index = next;
  await prepareCharacter(_index, true);
  stage.classList.remove('birthday-stage-switching');
}

function showBirthday() {
  if (_overlay.classList.contains('show')) return;
  _overlay.classList.add('show');
  _wishes.setCharacter(currentCharacter(), _today.getFullYear());
  bindModalBack(() => closeBirthday(false));
  const dateKey = birthdayDateKey(_today);
  storageSet(SEEN_PREFIX + dateKey);
  if (!storageGet(PERSON_PREFIX + dateKey) && currentCharacter())
    storageSetValue(PERSON_PREFIX + dateKey, currentCharacter().id);
}

function showWhenModalFree() {
  if (!document.querySelector('.tl-modal-overlay.show,#pw-modal.show')) return showBirthday();
  const observer = new MutationObserver(() => {
    if (document.querySelector('.tl-modal-overlay.show,#pw-modal.show')) return;
    observer.disconnect();
    showBirthday();
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

function cleanupVisuals() {
  if (_elementCleanup) { _elementCleanup(); _elementCleanup = null; }
  _wishes?.destroy();
  _particles?.clear();
}

function closeBirthday(releaseHistory) {
  if (!_overlay?.classList.contains('show')) return;
  _overlay.classList.remove('show');
  cleanupVisuals();
  if (releaseHistory) releaseModalBack();
}

export async function initBirthdayPopup(initialPageReady = Promise.resolve()) {
  if (_started) return;
  _started = true;
  const now = new Date();
  const dateKey = birthdayDateKey(now);
  if (storageGet(PERSON_PREFIX + dateKey)
      || storageHas(SEEN_PREFIX + dateKey)) return;
  if (storageHas(CHECKED_PREFIX + dateKey)) {
    await maybeTriggerVisitor(now, dateKey, initialPageReady);
    return;
  }

  // 每天大多数时候都没有生日，只先取判断日期必需的最小字段。
  const { data, error } = await supaClient.from('characters')
    .select('id,name,birthday').not('birthday', 'is', null).order('id');
  if (error) {
    console.warn('[birthday] 人物生日加载失败:', error.message);
    return;
  }
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const summaries = (data || []).filter(character => {
    const birthday = parseBirthday(character.birthday);
    return birthday && birthday.day === day && birthday.month === month;
  });
  if (!summaries.length) {
    storageSet(CHECKED_PREFIX + dateKey);
    await maybeTriggerVisitor(now, dateKey, initialPageReady);
    return;
  }

  // 只有命中生日时才补齐立绘和主题等完整人物数据。
  const ids = summaries.map(character => character.id);
  const { data: details, error: detailError } = await supaClient.from('characters')
    .select('*').in('id', ids).order('id');
  if (detailError) {
    console.warn('[birthday] 生日人物详情加载失败:', detailError.message);
    return;
  }
  const detailsById = new Map((details || []).map(character => [String(character.id), character]));
  const matches = summaries.map(character => detailsById.get(String(character.id)) || character);

  // 默认生日人物一旦命中就先锁定，避免主题加载期间被手动点击抢占。
  if (storageGet(PERSON_PREFIX + dateKey)) return;
  const automaticCharacter = matches[0];
  storageSetValue(PERSON_PREFIX + dateKey, automaticCharacter.id);
  _today = now;
  _viewMode = VIEW_BIRTHDAY;
  _matches = [automaticCharacter];
  if (!_overlay) _overlay = buildOverlay();
  await prepareCharacter(0, true);
  await Promise.resolve(initialPageReady).catch(() => {});
  showWhenModalFree();
}

async function loadBirthdayCharacter(id, knownCharacters) {
  const known = (knownCharacters || []).find(item => String(item.id) === String(id));
  if (known) return known;

  const { data, error } = await supaClient.from('characters')
    .select('*').eq('id', id).maybeSingle();
  if (error) {
    console.warn('[birthday] 当天生日人物加载失败:', error.message);
    showToast('今天的生日档案暂时打不开');
    return undefined;
  }
  return data || null;
}

export async function openBirthdayForCharacter(character, knownCharacters = []) {
  if (!character) return;

  const now = new Date();
  const personKey = PERSON_PREFIX + birthdayDateKey(now);
  let lockedId = storageGet(personKey);
  if (!lockedId) {
    lockedId = String(character.id);
    storageSetValue(personKey, lockedId);
  }

  const redirected = String(lockedId) !== String(character.id);
  let birthdayCharacter = redirected
    ? await loadBirthdayCharacter(lockedId, knownCharacters)
    : character;
  if (birthdayCharacter === undefined) return;
  if (birthdayCharacter === null) {
    // 锁定人物已被删除时，让当前人物接替，避免当天入口永久失效。
    birthdayCharacter = character;
    lockedId = String(character.id);
    storageSetValue(personKey, lockedId);
  }

  _today = now;
  _viewMode = redirected && String(lockedId) !== String(character.id)
    ? VIEW_REDIRECTED
    : (isBirthdayToday(birthdayCharacter, now) ? VIEW_BIRTHDAY : VIEW_TODAY);
  _matches = [birthdayCharacter];
  _index = 0;
  if (!_overlay) _overlay = buildOverlay();
  cleanupVisuals();
  await prepareCharacter(0, true);
  showBirthday();
}
