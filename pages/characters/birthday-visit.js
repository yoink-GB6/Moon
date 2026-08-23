const CARD_OPENED_PREFIX = 'moon-birthday-card-opened:';

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function birthdayDateKey(date = new Date()) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

export function markCharacterCardOpened(date = new Date()) {
  try { localStorage.setItem(CARD_OPENED_PREFIX + birthdayDateKey(date), '1'); }
  catch (_) {}
}

export function hasCharacterCardOpened(dateKey) {
  try { return localStorage.getItem(CARD_OPENED_PREFIX + dateKey) === '1'; }
  catch (_) { return false; }
}
