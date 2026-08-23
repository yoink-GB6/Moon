import {
  birthdayElementKind, mountBirthdayElement, normalizeElementConfig,
} from './birthday-renderers.js';

const VALID_SLOTS = new Set([
  'stage-backdrop', 'portrait-top', 'portrait-left',
  'portrait-right', 'portrait-bottom', 'viewport-particles',
]);

const _assetPromises = new Map();
let _catalogPromise = null;
const _associationPromises = new Map();

function objectValue(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
}

function legacyRecords(character) {
  const theme = objectValue(character?.birthday_theme);
  const url = theme.ornament_url || theme.background_url;
  if (!url) return [];
  return [{
    slot: 'stage-backdrop', sort_order: 0, config: { opacity: 0.25, scale: 'large' },
    element: {
      id: 'legacy-' + character.id,
      key: 'legacy-backdrop-' + character.id,
      name: '旧生日主题图案', category: 'decoration', render_method: 'image-static',
      asset_url: url, default_config: {},
    },
  }];
}

function partyRecord(character) {
  return {
    slot: 'stage-backdrop', sort_order: -100, config: {},
    element: {
      id: 'party-' + character.id,
      key: 'birthday-party-' + character.id,
      name: '生日派对图案', category: 'decoration', render_method: 'birthday-party',
      asset_url: null, default_config: { opacity: 0.86, scale: 'large' },
    },
  };
}

function compatibleRecord(row) {
  if (!row.element || row.element.category === 'gift' || !VALID_SLOTS.has(row.slot)) return false;
  const kind = birthdayElementKind(row.element.render_method);
  if (row.slot === 'viewport-particles') return kind === 'particle';
  return kind === 'image' || (row.slot === 'stage-backdrop' && kind === 'procedural');
}

async function loadCatalog(supaClient) {
  if (!_catalogPromise) _catalogPromise = (async () => {
    const { data, error } = await supaClient.from('birthday_elements').select('*').order('id');
    if (error) {
      console.warn('[birthday] 元素库加载失败，使用默认元素:', error.message);
      return [];
    }
    const elements = data || [];
    return elements.length ? elements : DEFAULT_GIFTS;
  })();
  return _catalogPromise;
}

async function loadAssociations(supaClient, characterId) {
  if (!_associationPromises.has(characterId)) {
    _associationPromises.set(characterId, (async () => {
      const { data, error } = await supaClient.from('character_birthday_elements')
        .select('*').eq('character_id', characterId).order('sort_order').order('id');
      if (error) {
        console.warn('[birthday] 人物生日元素加载失败，使用默认主题:', error.message);
        return [];
      }
      return data || [];
    })());
  }
  return _associationPromises.get(characterId);
}

export async function loadBirthdayElementBundle(supaClient, character) {
  const [catalog, associations] = await Promise.all([
    loadCatalog(supaClient), loadAssociations(supaClient, character.id),
  ]);
  const byId = new Map(catalog.map(element => [String(element.id), element]));
  let records = associations.map(row => ({
    ...row,
    element: byId.get(String(row.element_id)),
  })).filter(compatibleRecord);
  if (!records.length) records = legacyRecords(character);
  if (!records.length) records.push(partyRecord(character));
  const presentation = records.reduce((result, record) => {
    const config = normalizeElementConfig({
      ...objectValue(record.element.default_config),
      ...objectValue(record.config),
    });
    if (config.sendIconUrl) result.sendIconUrl = config.sendIconUrl;
    if (config.composerStyle) result.composerStyle = config.composerStyle;
    if (config.stampPlacement) result.stampPlacement = config.stampPlacement;
    if (config.portraitFrame) result.portraitFrame = config.portraitFrame;
    if (config.stageLabel) result.stageLabel = config.stageLabel;
    if (config.accentColor) result.accentColor = config.accentColor;
    if (config.viewportBackground) result.viewportBackground = config.viewportBackground;
    return result;
  }, {
    sendIconUrl: '', composerStyle: 'default',
    stampPlacement: 'default', portraitFrame: 'default',
    stageLabel: '', accentColor: '', viewportBackground: '',
  });
  return { records, presentation };
}

export function preloadAsset(url) {
  if (!url) return Promise.resolve(false);
  if (_assetPromises.has(url)) return _assetPromises.get(url);
  const promise = new Promise(resolve => {
    const img = new Image();
    img.onload = async () => {
      try { if (img.decode) await img.decode(); }
      catch (_) {}
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
  _assetPromises.set(url, promise);
  return promise;
}

export function preloadElementBundle(bundle) {
  return Promise.allSettled(bundle.records.map(record => preloadAsset(record.element.asset_url)));
}

export function mountBirthdayElements(bundle, slots, context) {
  const controller = new AbortController();
  bundle.records
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .forEach(record => {
      const host = slots[record.slot];
      if (!host) return;
      const config = normalizeElementConfig({
        ...objectValue(record.element.default_config),
        ...objectValue(record.config),
      });
      mountBirthdayElement({
        host, element: record.element, config, context, signal: controller.signal,
      });
    });
  return () => {
    controller.abort();
    Object.values(slots).forEach(slot => slot?.replaceChildren());
  };
}
