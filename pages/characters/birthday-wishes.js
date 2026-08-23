import { safeUnsubscribe, supaClient } from '../../core/supabase-client.js';
import { showToast } from '../../core/ui.js';

const MAX_LENGTH = 60;
const MAX_LANES = 8;
const MAX_ONSCREEN = 16;
const INITIAL_WISHES = 25;
const CONFETTI_ICON = `
  <svg class="birthday-send-icon birthday-send-icon-confetti" viewBox="0 0 36 24" aria-hidden="true">
    <path class="confetti-cone" d="M6.5 21L12.2 10.7L21.1 17.3Z"/>
    <path class="confetti-cone-stripe" d="M9 16.6L16.4 18.8M10.9 13.1L19.1 16"/>
    <path class="confetti-burst confetti-gold" d="M15.2 11.5L19.2 5.3M18.2 13.2L25.3 9.2"/>
    <path class="confetti-burst confetti-pink" d="M20.4 15.8L28.3 15.1M22.3 6.2L23.4 2.8"/>
    <path class="confetti-burst confetti-blue" d="M28.1 10L32 7.6M29.5 18.5L32.4 20.2"/>
    <circle class="confetti-dot confetti-pink-fill" cx="29.7" cy="4.1" r="1.25"/>
    <circle class="confetti-dot confetti-blue-fill" cx="33" cy="13.2" r="1.05"/>
    <path class="confetti-ribbon confetti-violet" d="M25.5 3.1Q28 5.2 26.1 7.1Q24.5 8.7 27.4 10.2"/>
  </svg>`;

export function createBirthdayWishes({ root }) {
  const form = root.querySelector('.birthday-wish-form');
  const input = root.querySelector('.birthday-wish-input');
  const sendButton = root.querySelector('.birthday-send');
  const danmaku = root.querySelector('.birthday-danmaku');
  const wishBox = root.querySelector('.birthday-wish-box');
  let character = null;
  let year = null;
  let channel = null;
  let seq = 0;
  let seen = new Set();
  let queue = [];
  let timer = null;
  let activeText = 0;
  let laneReadyAt = [];
  let laneCursor = 0;
  let lastLaunchAt = 0;
  let available = true;

  function setSendIcon(iconUrl = '') {
    if (iconUrl) {
      const img = document.createElement('img');
      img.className = 'birthday-send-icon birthday-send-icon-custom';
      img.src = iconUrl;
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      img.addEventListener('error', () => {
        if (sendButton.firstElementChild === img) setSendIcon();
      }, { once: true });
      sendButton.replaceChildren(img);
      sendButton.dataset.sendIcon = 'custom';
      sendButton.setAttribute('aria-label', '发送生日祝福');
      return;
    }
    sendButton.innerHTML = CONFETTI_ICON;
    sendButton.dataset.sendIcon = 'confetti';
    sendButton.setAttribute('aria-label', '发送生日祝福');
  }

  function clearPlayback() {
    if (timer) { clearTimeout(timer); timer = null; }
    queue = [];
    activeText = 0;
    laneReadyAt = [];
    laneCursor = 0;
    lastLaunchAt = 0;
    seen = new Set();
    danmaku.replaceChildren();
  }

  function disconnect() {
    seq++;
    safeUnsubscribe(channel); channel = null;
    clearPlayback();
  }

  function accept(row, priority = false) {
    // 旧数据中的 gift 保留在数据库，但前端只展示文字祝福。
    if (row.kind !== 'text') return;
    const key = String(row.id);
    if (seen.has(key)) return;
    seen.add(key);
    const entry = { row, availableAt: 0, urgent: priority };
    if (priority) {
      queue.unshift(entry);
      if (timer) { clearTimeout(timer); timer = null; }
    } else queue.push(entry);
    schedule();
  }

  function replayCooldown() {
    const count = Math.max(1, seen.size);
    const base = Math.min(10000, Math.max(2500, 12000 - count * 650));
    return Math.min(10000, Math.max(2500, base * (0.8 + Math.random() * 0.4)));
  }

  function launchGap() {
    const count = Math.max(1, seen.size);
    return Math.min(1500, Math.max(650, 1750 - count * 45));
  }

  function schedule() {
    if (timer || !queue.length || activeText >= MAX_ONSCREEN) return;
    const entry = queue[0];
    const now = Date.now();
    const dueAt = entry.urgent
      ? now + 80
      : Math.max(entry.availableAt || 0, lastLaunchAt + (activeText ? launchGap() : 90));
    timer = setTimeout(() => {
      timer = null;
      const next = queue.shift();
      const result = spawnText(next);
      if (!result.spawned) {
        queue.unshift(next);
        timer = setTimeout(() => {
          timer = null;
          schedule();
        }, Math.max(50, result.retryAt - Date.now()));
        return;
      }
      schedule();
    }, Math.max(50, dueAt - now));
  }

  function laneLayout(itemHeight) {
    const portrait = root.querySelector('.birthday-art-frame');
    const portraitRect = portrait?.getBoundingClientRect();
    if (portraitRect?.height) {
      const inset = Math.min(12, portraitRect.height * 0.04);
      const minTop = portraitRect.top + inset;
      const maxTop = Math.max(minTop, portraitRect.bottom - inset - itemHeight);
      const laneGap = Math.max(5, itemHeight * 0.38);
      const count = Math.max(1, Math.min(MAX_LANES,
        Math.floor((maxTop - minTop + itemHeight + laneGap) / (itemHeight + laneGap))));
      return Array.from({ length: count }, (_, index) =>
        count === 1 ? minTop : minTop + (maxTop - minTop) * index / (count - 1));
    }
    const minTop = window.innerHeight * 0.08;
    const maxTop = Math.max(minTop, window.innerHeight * 0.8 - itemHeight);
    const count = Math.min(6, MAX_LANES);
    return Array.from({ length: count }, (_, index) =>
      minTop + (maxTop - minTop) * index / Math.max(1, count - 1));
  }

  function freeLane(tops) {
    const now = Date.now();
    let retryAt = Infinity;
    for (let offset = 0; offset < tops.length; offset++) {
      const index = (laneCursor + offset) % tops.length;
      const readyAt = laneReadyAt[index] || 0;
      retryAt = Math.min(retryAt, readyAt);
      if (readyAt > now) continue;
      laneCursor = (index + 1) % tops.length;
      return { index, retryAt: now };
    }
    return { index: -1, retryAt: Number.isFinite(retryAt) ? retryAt : now + 100 };
  }

  function laneReleaseDelay(duration, itemWidth) {
    const travelDistance = Math.max(1, window.innerWidth + itemWidth);
    const releaseDistance = Math.max(56, itemWidth * 0.65);
    const estimated = duration * 1000 * releaseDistance / travelDistance;
    return Math.min(2600, Math.max(700, estimated));
  }

  function spawnText(entry) {
    const row = entry.row;
    const item = document.createElement('div');
    item.className = 'birthday-danmaku-item';
    item.textContent = String(row.content || '').slice(0, MAX_LENGTH);
    const duration = 9 + Math.random() * 7;
    item.style.setProperty('--birthday-flight', duration.toFixed(2) + 's');
    item.style.animationPlayState = 'paused';
    danmaku.appendChild(item);

    const itemHeight = item.getBoundingClientRect().height;
    const itemWidth = item.getBoundingClientRect().width;
    const tops = laneLayout(itemHeight);
    const laneState = freeLane(tops);
    const lane = laneState.index;
    if (lane < 0) {
      item.remove();
      return { spawned: false, retryAt: laneState.retryAt };
    }
    item.style.top = tops[lane] + 'px';
    item.style.animationPlayState = 'running';

    activeText++;
    lastLaunchAt = Date.now();
    laneReadyAt[lane] = lastLaunchAt + laneReleaseDelay(duration, itemWidth);
    queue.push({
      row,
      availableAt: lastLaunchAt + duration * 1000 + replayCooldown(),
      urgent: false,
    });
    item.addEventListener('animationend', () => {
      item.remove();
      activeText = Math.max(0, activeText - 1);
      schedule();
    }, { once: true });
    return { spawned: true, retryAt: 0 };
  }

  async function send(content) {
    if (!available || !character) return false;
    const value = String(content || '').trim().slice(0, MAX_LENGTH);
    if (!value) return false;
    const { data, error } = await supaClient.from('birthday_wishes').insert({
      character_id: character.id,
      event_year: year,
      kind: 'text',
      content: value,
    }).select().single();
    if (error) {
      console.warn('[birthday] 祝福发送失败:', error.message);
      showToast('祝福暂时没有送达');
      return false;
    }
    accept(data, true);
    return true;
  }

  async function setCharacter(nextCharacter, nextYear) {
    disconnect();
    character = nextCharacter;
    year = nextYear;
    available = true;
    wishBox.classList.remove('birthday-wishes-unavailable');
    const mySeq = ++seq;

    const { data, error } = await supaClient.from('birthday_wishes')
      .select('id,character_id,event_year,kind,content,created_at')
      .eq('character_id', character.id)
      .eq('event_year', year)
      .eq('kind', 'text')
      .order('created_at', { ascending: false })
      .limit(INITIAL_WISHES);
    if (mySeq !== seq || character.id !== nextCharacter.id) return;
    if (error) {
      console.warn('[birthday] 祝福加载失败:', error.message);
      available = false;
      wishBox.classList.add('birthday-wishes-unavailable');
      return;
    }
    [...(data || [])].reverse().forEach(accept);

    channel = supaClient.channel('birthday-wishes-' + character.id + '-' + Date.now())
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'birthday_wishes',
        filter: 'character_id=eq.' + character.id,
      }, payload => {
        const row = payload.new;
        if (mySeq === seq && row.event_year === year && row.kind === 'text') accept(row);
      })
      .subscribe();
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) return input.focus();
    if (await send(content)) input.value = '';
  });

  return { setCharacter, setSendIcon, destroy: disconnect };
}
