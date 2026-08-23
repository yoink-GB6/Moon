import { mountBirthdayParty } from './birthday-party.js';
import { mountBirthdayComete } from './birthday-comete.js';

const IMAGE_METHODS = new Set(['image-static', 'image-float', 'image-breathe', 'image-orbit']);
const PARTICLE_METHODS = new Set(['particle-feather', 'particle-petal', 'particle-stars']);
const PROCEDURAL_METHODS = new Set(['birthday-party', 'comete-stage']);
const SCALES = new Set(['small', 'medium', 'large']);
const ANIMATIONS = new Set(['none', 'float-soft', 'breathe-soft', 'orbit-slow']);
const HIT_SHAPES = new Set(['none', 'camellia']);
const COMPOSER_STYLES = new Set(['default', 'retro-phone']);
const STAMP_PLACEMENTS = new Set(['default', 'theme-label']);
const PORTRAIT_FRAMES = new Set(['default', 'none']);
const ELEMENT_STYLES = new Set([
  'camellia-front', 'portrait-corner-bottom-left', 'portrait-corner-bottom-right',
]);

export function birthdayElementKind(method) {
  if (IMAGE_METHODS.has(method)) return 'image';
  if (PARTICLE_METHODS.has(method)) return 'particle';
  if (PROCEDURAL_METHODS.has(method)) return 'procedural';
  return null;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function optionalNumber(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : null;
}

function plainText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function hexColor(value) {
  const color = plainText(value, 7);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '';
}

function localBirthdaySvg(value) {
  const url = plainText(value, 180).replace(/\\/g, '/');
  return /^\.\/assets\/birthday\/[a-z0-9][a-z0-9_.-]*\.svg$/i.test(url) ? url : '';
}

export function normalizeElementConfig(raw = {}) {
  return {
    scale: SCALES.has(raw.scale) ? raw.scale : 'medium',
    mirror: raw.mirror === true,
    opacity: clampNumber(raw.opacity, 0, 1, 0.8),
    intensity: clampNumber(raw.intensity, 0.2, 3, 1),
    animation: ANIMATIONS.has(raw.animation) ? raw.animation : 'none',
    hitShape: HIT_SHAPES.has(raw.hit_shape) ? raw.hit_shape : 'none',
    sendIconUrl: localBirthdaySvg(raw.send_icon_url),
    composerStyle: COMPOSER_STYLES.has(raw.composer_style) ? raw.composer_style : '',
    stampPlacement: STAMP_PLACEMENTS.has(raw.stamp_placement) ? raw.stamp_placement : '',
    portraitFrame: PORTRAIT_FRAMES.has(raw.portrait_frame) ? raw.portrait_frame : '',
    elementStyle: ELEMENT_STYLES.has(raw.element_style) ? raw.element_style : '',
    offsetXPercent: optionalNumber(raw.offset_x_percent, -200, 200),
    offsetYPercent: optionalNumber(raw.offset_y_percent, -200, 200),
    stageLabel: plainText(raw.stage_label, 80),
    accentColor: hexColor(raw.accent_color),
    viewportBackground: hexColor(raw.viewport_background),
  };
}

function mountImage({ host, element, config, signal }) {
  if (!element.asset_url) return null;
  const img = document.createElement('img');
  img.className = 'birthday-element birthday-element-' + config.scale;
  img.src = element.asset_url;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.dataset.birthdayElementKey = String(element.key || '');
  if (config.elementStyle) img.dataset.birthdayElementStyle = config.elementStyle;
  img.style.opacity = String(config.opacity);
  if (config.offsetXPercent !== null || config.offsetYPercent !== null) {
    img.classList.add('birthday-element-offset');
    if (config.offsetXPercent !== null)
      img.style.setProperty('--birthday-element-offset-x', config.offsetXPercent + '%');
    if (config.offsetYPercent !== null)
      img.style.setProperty('--birthday-element-offset-y', config.offsetYPercent + '%');
  }
  if (config.mirror) img.classList.add('birthday-element-mirror');

  const methodClass = {
    'image-float': 'birthday-element-float',
    'image-breathe': 'birthday-element-breathe',
    'image-orbit': 'birthday-element-orbit',
  }[element.render_method];
  const configClass = {
    'float-soft': 'birthday-element-float',
    'breathe-soft': 'birthday-element-breathe',
    'orbit-slow': 'birthday-element-orbit',
  }[config.animation];
  if (methodClass) img.classList.add(methodClass);
  if (configClass) img.classList.add(configClass);
  host.appendChild(img);

  let hitSurface = null;
  if (config.hitShape !== 'none') {
    hitSurface = document.createElement('span');
    hitSurface.className = 'birthday-element-hit-surface birthday-hit-' + config.hitShape;
    hitSurface.setAttribute('aria-hidden', 'true');
    host.appendChild(hitSurface);
  }

  const remove = () => { img.remove(); hitSurface?.remove(); };
  signal?.addEventListener('abort', remove, { once: true });
  return remove;
}

function mountParticles({ element, config, context, signal }) {
  if (!context.particles) return null;
  const remove = context.particles.addEmitter(element.render_method, config);
  signal?.addEventListener('abort', remove, { once: true });
  return remove;
}

export function mountBirthdayElement({ host, element, config, context, signal }) {
  const kind = birthdayElementKind(element.render_method);
  if (kind === 'image')
    return mountImage({ host, element, config, context, signal });
  if (kind === 'particle')
    return mountParticles({ host, element, config, context, signal });
  if (kind === 'procedural') {
    if (element.render_method === 'comete-stage')
      return mountBirthdayComete({ host, element, config, context, signal });
    return mountBirthdayParty({ host, element, config, context, signal });
  }
  console.warn('[birthday] 未知元素渲染方法:', element.render_method);
  return null;
}
