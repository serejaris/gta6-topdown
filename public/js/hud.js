import { WEAPONS } from '/shared/world.js';

const NAME_KEY = 'gta6td.name';

const WEAPON_SVG = [
  '<svg viewBox="0 0 72 40"><path d="M22 10h18a6 6 0 0 1 6 6v4h4v10H40v4H24v-4h-4a6 6 0 0 1-6-6v-6a8 8 0 0 1 8-8z"/><path d="M26 16h3v8h-3zM32 16h3v8h-3zM38 16h3v8h-3z" style="fill:#000;stroke:none"/></svg>',
  '<svg viewBox="0 0 72 40"><path d="M14 10h44v8H34l-2 4h-6l-4 14h-9l4-14h-3z"/></svg>',
  '<svg viewBox="0 0 72 40"><path d="M10 10h50v4h4v6H42v4h-6l-2 12h-8l2-12h-6l-2 8h-7l2-8h-5z"/><path d="M30 24h6v14h-6z"/></svg>',
  '<svg viewBox="0 0 72 40"><path d="M4 12h52v6H40l-4 2H24l-6 14H8l6-14H4z"/><path d="M56 12h12v5H56z"/></svg>',
  '<svg viewBox="0 0 72 40"><path d="M6 14h54v10H6z"/><path d="M60 12l10 7-10 7z"/><path d="M26 24h8v10h-8z"/></svg>',
];

const STAR = '<svg class="star" viewBox="0 0 40 40"><path d="M20 3l5 11 12 1.4-9 8.2 2.6 11.9L20 29.4 9.4 35.5 12 23.6 3 15.4 15 14z"/></svg>';

const DISTRICT_COLORS = {
  downtown: '#3b3f5e',
  vice: '#5b2763',
  beach: '#7a6845',
  suburb: '#2f4d3d',
  industrial: '#46413a',
  park: '#1d6a3a',
};
const BUILDING_COLORS = {
  downtown: '#6c7398',
  vice: '#a2468f',
  beach: '#b49a6b',
  suburb: '#557a62',
  industrial: '#6e665a',
};
const PICKUP_COLORS = {
  cash: '#7dff6a',
  bribe: '#ffd23f',
  health: '#ff3b5c',
  armor: '#22b7ff',
  pistol: '#ffffff',
  uzi: '#ffffff',
  shotgun: '#ffffff',
  rocket: '#ff8a3d',
};
const PICKUP_LABELS = {
  pistol: 'PISTOL', uzi: 'UZI', shotgun: 'SHOTGUN', rocket: 'ROCKET LAUNCHER',
  health: '+ HEALTH', armor: '+ ARMOR', cash: 'CASH', bribe: 'BRIBE — РОЗЫСК СНЯТ',
};
const HOW_LABELS = { car: 'сбит', explode: 'взрыв', 0: 'кулак', 1: 'pistol', 2: 'uzi', 3: 'shotgun', 4: 'rocket' };

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtMoney(n) {
  const v = Math.max(0, Math.floor(n || 0));
  return '$' + String(v).padStart(8, '0');
}

function buildBaseMap(world) {
  const S = world.size;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4458';
  g.fillRect(0, 0, S, S);
  for (const b of world.blocks) {
    g.fillStyle = DISTRICT_COLORS[b.district] || '#333';
    g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  }
  for (const b of world.buildings) {
    g.fillStyle = BUILDING_COLORS[b.district] || '#777';
    g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  }
  g.strokeStyle = 'rgba(255,255,255,.18)';
  g.lineWidth = 1;
  g.setLineDash([4, 6]);
  for (const r of world.roads) {
    g.beginPath(); g.moveTo(r, 0); g.lineTo(r, S); g.stroke();
    g.beginPath(); g.moveTo(0, r); g.lineTo(S, r); g.stroke();
  }
  return c;
}

export function createHud(root, world) {
  root.innerHTML = '';
  const chatCbs = [];
  let typing = false;
  let boardOn = false;
  let shownMoney = 0;
  let lastMoney = null;
  let lastView = null;
  let bigTimer = 0;
  let bigKind = '';
  let toastTimer = 0;
  let hurtTimer = 0;
  let lastHp = null;
  let lastWeapon = -1;
  let radioOn = true;
  const cache = {};
  window.addEventListener('gta-radio', (e) => { radioOn = !!(e.detail && e.detail.on); });

  el('div', '', root, '<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="h-half" x1="0" x2="1"><stop offset="50%" stop-color="#ff2e88"/><stop offset="50%" stop-color="rgba(20,10,38,.55)"/></linearGradient></defs></svg>');
  const vignette = el('div', 'h-vignette', root);
  const left = el('div', 'h-left', root);
  const weaponBox = el('div', 'h-weapon', left);
  const weaponIcon = el('div', '', weaponBox);
  const weaponName = el('div', 'h-wname h-outline', weaponBox);
  const ammoEl = el('div', 'h-ammo h-outline', weaponBox);
  const hpBar = el('div', 'h-bar hp', left, '<i></i><b>HP</b>');
  const arBar = el('div', 'h-bar ar', left, '<i></i><b>ARMOR</b>');
  const hpFill = hpBar.querySelector('i');
  const hpText = hpBar.querySelector('b');
  const arFill = arBar.querySelector('i');
  const arText = arBar.querySelector('b');

  const wanted = el('div', 'h-wanted', root, STAR.repeat(5));
  const stars = [...wanted.children];
  const net = el('div', 'h-net', root, 'НЕТ СОЕДИНЕНИЯ — ПЕРЕПОДКЛЮЧАЮСЬ…');

  const money = el('div', 'h-money', root, '$00000000');
  const stats = el('div', 'h-mult h-outline', root);
  const feed = el('div', 'h-feed', root);
  const toast = el('div', 'h-toast h-outline', root);
  const big = el('div', 'h-big', root);

  const mapWrap = el('div', 'h-mapwrap', root);
  el('div', 'h-maplabel', mapWrap, 'LEONIDA');
  const map = el('canvas', '', mapWrap);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const MAP_PX = 220;
  map.width = MAP_PX * dpr;
  map.height = MAP_PX * dpr;
  const mg = map.getContext('2d');
  let base = world ? buildBaseMap(world) : null;

  const hint = el('div', 'h-hint', root, '<kbd>F</kbd>сесть в машину');
  const radio = el('div', 'h-radio', root, 'RADIO <em>VICE FM 106.6</em> · M');

  const chat = el('div', 'h-chat', root);
  const log = el('div', 'h-log', chat);
  const input = el('input', 'h-input', chat);
  input.maxLength = 120;
  input.placeholder = 'сообщение… Enter — отправить, Esc — закрыть';

  const board = el('div', 'h-board', root);

  function openChat() {
    if (typing) return;
    typing = true;
    chat.classList.add('typing');
    input.value = '';
    input.focus();
  }
  function closeChat() {
    typing = false;
    chat.classList.remove('typing');
    input.blur();
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = input.value.trim().slice(0, 120);
      closeChat();
      if (text) for (const cb of chatCbs) cb(text);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      closeChat();
      e.preventDefault();
    }
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());

  let joined = false;
  window.addEventListener('keydown', (e) => {
    if (!joined) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!typing) setBoard(true);
      return;
    }
    if (typing) return;
    if (e.code === 'KeyT' || (e.key === 'Enter' && !(lastView && lastView.nearCar) && !(lastView && lastView.me && lastView.me.car))) {
      e.preventDefault();
      openChat();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Tab') setBoard(false);
  });
  window.addEventListener('blur', () => setBoard(false));

  function setBoard(on) {
    boardOn = on;
    board.classList.toggle('on', on);
    if (on && lastView) renderBoard(lastView);
  }

  function renderBoard(view) {
    const list = [...(view.players || [])].sort((a, b) => (b.money || 0) - (a.money || 0));
    const meId = view.me && view.me.id;
    let rows = '';
    list.forEach((p, i) => {
      rows += `<tr class="${p.id === meId ? 'me' : ''}"><td class="pos">${i + 1}</td><td><span class="dot" style="background:${esc(p.color || '#fff')}"></span>${esc(p.name)}</td><td class="r m">${fmtMoney(p.money)}</td><td class="r">${p.kills || 0}</td><td class="r">${p.deaths || 0}</td><td class="r">${'★'.repeat(Math.ceil(p.wanted || 0))}</td></tr>`;
    });
    board.innerHTML = `<h2>LEADERBOARD</h2><table><thead><tr><th>#</th><th>ИГРОК</th><th class="r">ДЕНЬГИ</th><th class="r">KILLS</th><th class="r">DEATHS</th><th class="r">РОЗЫСК</th></tr></thead><tbody>${rows}</tbody></table><div class="foot">${list.length} в городе · все на одной карте · отпусти Tab, чтобы закрыть</div>`;
  }

  function addLog(html, cls) {
    const d = el('div', cls || '', log, html);
    setTimeout(() => d.classList.add('old'), 9000);
    while (log.children.length > 8) log.firstChild.remove();
  }

  function addFeed(html, mine) {
    const d = el('div', mine ? 'me' : '', feed, html);
    setTimeout(() => d.classList.add('out'), 5200);
    setTimeout(() => d.remove(), 6000);
    while (feed.children.length > 6) feed.firstChild.remove();
    return d;
  }
  const frenzies = new Map();

  function showBig(kind, text, sub, dur) {
    bigKind = kind;
    big.className = 'h-big ' + kind;
    big.innerHTML = `<span class="t">${text}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`;
    void big.offsetWidth;
    big.classList.add('on');
    bigTimer = dur;
    vignette.className = 'h-vignette' + (kind === 'wasted' || kind === 'busted' ? ' ' + kind : '');
  }

  function showToast(text, color) {
    toast.textContent = text;
    toast.style.color = color || '';
    toast.classList.add('on');
    toastTimer = 1.8;
  }

  function set(key, node, prop, val) {
    if (cache[key] === val) return;
    cache[key] = val;
    node[prop] = val;
  }

  function drawMap(view) {
    const me = view.me;
    if (!me) return;
    if (!base && view.world) base = buildBaseMap(view.world);
    const W = map.width;
    const span = 280;
    const k = W / span;
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.fillStyle = '#0d3b5c';
    mg.fillRect(0, 0, W, W);
    const ox = me.x - span / 2;
    const oz = me.z - span / 2;
    mg.setTransform(k, 0, 0, k, -ox * k, -oz * k);
    if (base) mg.drawImage(base, 0, 0);
    const t = view.time || 0;
    const r = 1 / k;
    const edge = (x, z, rad) => {
      const m = 6 * r;
      return [Math.max(ox + m, Math.min(ox + span - m, x)), Math.max(oz + m, Math.min(oz + span - m, z))];
    };
    for (const p of view.pickups || []) {
      if (Math.abs(p.x - me.x) > span / 2 || Math.abs(p.z - me.z) > span / 2) continue;
      mg.fillStyle = PICKUP_COLORS[p.kind] || '#fff';
      mg.fillRect(p.x - 3 * r, p.z - 3 * r, 6 * r, 6 * r);
      mg.strokeStyle = '#000';
      mg.lineWidth = r;
      mg.strokeRect(p.x - 3 * r, p.z - 3 * r, 6 * r, 6 * r);
    }
    const blink = Math.floor(t * 4) % 2 === 0;
    for (const c of view.cars || []) {
      if (!c.cop || c.wreck) continue;
      if (Math.abs(c.x - me.x) > span / 2 || Math.abs(c.z - me.z) > span / 2) continue;
      mg.fillStyle = blink ? '#ff2b3b' : '#2b6bff';
      mg.fillRect(c.x - 4 * r, c.z - 4 * r, 8 * r, 8 * r);
      mg.fillStyle = blink ? '#2b6bff' : '#ff2b3b';
      mg.fillRect(c.x - 4 * r, c.z - 4 * r, 4 * r, 8 * r);
    }
    for (const p of view.peds || []) {
      if (p.kind !== 'cop' || p.dead) continue;
      if (Math.abs(p.x - me.x) > span / 2 || Math.abs(p.z - me.z) > span / 2) continue;
      mg.fillStyle = blink ? '#ff6b7a' : '#6b9bff';
      mg.beginPath(); mg.arc(p.x, p.z, 2.5 * r, 0, Math.PI * 2); mg.fill();
    }
    for (const p of view.players || []) {
      if (p.id === me.id || p.dead) continue;
      const [x, z] = edge(p.x, p.z);
      mg.fillStyle = p.color || '#ffd23f';
      mg.strokeStyle = '#fff';
      mg.lineWidth = 1.5 * r;
      mg.beginPath(); mg.arc(x, z, 4.5 * r, 0, Math.PI * 2); mg.fill(); mg.stroke();
    }
    mg.setTransform(1, 0, 0, 1, 0, 0);
    const cx = W / 2;
    const a = me.a || 0;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    const s = 9 * dpr;
    mg.beginPath();
    mg.moveTo(cx + fx * s * 1.3, cx + fz * s * 1.3);
    mg.lineTo(cx - fx * s * 0.8 + fz * s * 0.85, cx - fz * s * 0.8 - fx * s * 0.85);
    mg.lineTo(cx - fx * s * 0.35, cx - fz * s * 0.35);
    mg.lineTo(cx - fx * s * 0.8 - fz * s * 0.85, cx - fz * s * 0.8 + fx * s * 0.85);
    mg.closePath();
    mg.fillStyle = '#fff';
    mg.strokeStyle = '#ff2e88';
    mg.lineWidth = 2.5 * dpr;
    mg.stroke();
    mg.fill();
  }

  return {
    showJoin(onJoin) {
      const scr = el('div', 'h-join', root);
      const saved = (() => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } })();
      scr.innerHTML = `
        <div class="sun"></div>
        <div class="grid"></div>
        <div class="palms">${palm(60, 360, 1)}${palm(210, 270, -1)}${palm(1180, 400, -1)}${palm(1320, 300, 1)}</div>
        <div class="h-panel">
          <div class="h-logo">
            <div class="gta">GRAND THEFT AUTO</div>
            <div class="six">VI</div><br>
            <div class="ed">TOP-DOWN EDITION</div>
            <div class="mp"><b>мультиплеер:</b> все на одной карте · Leonida, Vice City</div>
          </div>
          <form class="h-form" autocomplete="off">
            <label>ТВОЁ ИМЯ</label>
            <input name="n" maxlength="16" placeholder="Tommy" value="${esc(saved)}">
            <button type="submit">PLAY</button>
            <div class="h-keys">
              <div class="sec">ПЕШКОМ</div>
              <kbd>WASD</kbd><span>ходить · Shift — бег</span>
              <kbd>МЫШЬ</kbd><span>прицел · ЛКМ — огонь</span>
              <kbd>1–5</kbd><span>оружие · колесо мыши</span>
              <kbd>F</kbd><span>сесть / выйти из машины</span>
              <div class="sec">В МАШИНЕ</div>
              <kbd>W / S</kbd><span>газ · тормоз / задний</span>
              <kbd>A / D</kbd><span>руль · Space — ручник</span>
              <kbd>ЛКМ</kbd><span>драйв-бай · M — радио</span>
              <div class="sec">ЕЩЁ</div>
              <kbd>T</kbd><span>чат · Tab — таблица лидеров</span>
            </div>
          </form>
        </div>`;
      const form = scr.querySelector('form');
      const field = form.querySelector('input');
      setTimeout(() => field.focus(), 50);
      field.addEventListener('keydown', (e) => e.stopPropagation());
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = (field.value.trim() || 'Tommy').slice(0, 16);
        try { localStorage.setItem(NAME_KEY, name); } catch {}
        joined = true;
        field.blur();
        scr.classList.add('out');
        setTimeout(() => scr.remove(), 450);
        onJoin(name);
      });
    },

    update(view, dt) {
      lastView = view;
      joined = true;
      const me = view.me || {};
      const w = WEAPONS[me.w] || WEAPONS[0];
      if (lastWeapon !== w.id) {
        lastWeapon = w.id;
        weaponIcon.innerHTML = WEAPON_SVG[w.id] || WEAPON_SVG[0];
      }
      set('wn', weaponName, 'textContent', w.name);
      const ammo = w.id === 0 || me.ammo == null || me.ammo === Infinity ? '∞' : String(me.ammo);
      set('am', ammoEl, 'textContent', ammo);
      ammoEl.classList.toggle('low', w.id !== 0 && me.ammo != null && me.ammo <= Math.max(2, (w.ammo || 10) * 0.15));

      const hp = Math.max(0, Math.min(100, me.hp ?? 100));
      const ar = Math.max(0, Math.min(100, me.armor ?? 0));
      set('hpw', hpFill.style, 'width', hp + '%');
      set('hpt', hpText, 'textContent', 'HP ' + Math.ceil(hp));
      hpBar.classList.toggle('low', hp > 0 && hp < 30);
      set('arw', arFill.style, 'width', ar + '%');
      set('art', arText, 'textContent', 'ARMOR ' + Math.ceil(ar));
      arBar.classList.toggle('empty', ar <= 0);
      if (lastHp != null && hp < lastHp - 0.5 && !me.dead) hurtTimer = 0.25;
      lastHp = hp;

      const target = me.money || 0;
      if (lastMoney != null && target > lastMoney) {
        money.classList.add('bump');
        setTimeout(() => money.classList.remove('bump'), 140);
      }
      lastMoney = target;
      const diff = target - shownMoney;
      if (Math.abs(diff) < 1) shownMoney = target;
      else shownMoney += diff * Math.min(1, dt * 8) + Math.sign(diff) * Math.min(Math.abs(diff), 40 * dt);
      set('mn', money, 'textContent', fmtMoney(shownMoney));
      set('st', stats, 'textContent', `KILLS ${me.kills || 0} · DEATHS ${me.deaths || 0}`);

      const wv = me.wanted || 0;
      const full = Math.floor(wv);
      const half = wv - full >= 0.5;
      stars.forEach((s, i) => {
        s.classList.toggle('on', i < full);
        s.classList.toggle('half', i === full && half);
      });
      const chase = wv >= 1 && (view.cars || []).some((c) => c.cop && c.siren && !c.wreck && Math.hypot(c.x - me.x, c.z - me.z) < 120);
      wanted.classList.toggle('blink', chase || wv >= 3);

      net.classList.toggle('on', !view.connected);
      hint.classList.toggle('on', !!view.nearCar && !me.car && !me.dead && !typing);
      radio.classList.toggle('on', !!me.car && !me.dead && radioOn);

      if (bigTimer > 0) {
        bigTimer -= dt;
        if (bigTimer <= 0 && !(me.dead && (bigKind === 'wasted' || bigKind === 'busted'))) {
          big.classList.remove('on');
          vignette.className = 'h-vignette';
          bigKind = '';
        }
      } else if (!me.dead && (bigKind === 'wasted' || bigKind === 'busted')) {
        big.classList.remove('on');
        vignette.className = 'h-vignette';
        bigKind = '';
      }
      if (me.dead && !bigKind) showBig('wasted', 'WASTED', 'респаун через пару секунд', 3);
      if (!bigKind) {
        if (hurtTimer > 0) {
          hurtTimer -= dt;
          vignette.className = 'h-vignette hurt';
        } else if (vignette.className !== 'h-vignette') vignette.className = 'h-vignette';
      }
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toast.classList.remove('on');
      }
      if (boardOn) {
        cache.bt = (cache.bt || 0) + dt;
        if (cache.bt > 0.5) { cache.bt = 0; renderBoard(view); }
      }
      cache.mt = (cache.mt || 0) + dt;
      if (cache.mt >= 0.1) { cache.mt = 0; drawMap(view); }
    },

    event(ev, view) {
      if (view) lastView = view;
      const meId = view && view.me && view.me.id;
      switch (ev.kind) {
        case 'kill': {
          const how = HOW_LABELS[ev.how] ?? (typeof ev.how === 'string' ? ev.how : '');
          const vName = ev.victim == null ? (ev.victimName === 'cop' ? 'коп' : 'прохожий') : ev.victimName;
          const mine = ev.killer === meId || ev.victim === meId;
          if (ev.victim == null && ev.killer !== meId) break;
          addFeed(`<span class="k">${esc(ev.killerName || '???')}</span><span class="how">${esc(how)} ▸</span><span class="v">${esc(vName)}</span>`, mine);
          break;
        }
        case 'wasted':
          if (ev.id === meId) showBig('wasted', 'WASTED', 'респаун через пару секунд', 3.2);
          break;
        case 'busted':
          if (ev.id === meId) showBig('busted', 'BUSTED', 'минус половина денег · оружие изъято', 3.2);
          break;
        case 'frenzy':
          {
            const nowT = performance.now();
            const prev = frenzies.get(ev.id);
            const cont = prev && nowT - prev.t < 6500;
            const count = Math.max(ev.count || 3, cont ? prev.count : 0);
            if (ev.id === meId) {
              if (!cont) showBig('frenzy', 'KILL FRENZY!', `серия × ${count}`, 2.4);
              else if (bigKind === 'frenzy' && bigTimer > 0) {
                const sub = big.querySelector('.sub');
                if (sub) sub.textContent = `серия × ${count}`;
              }
              frenzies.set(ev.id, { t: nowT, count, line: null });
            } else {
              const p = (view && view.players || []).find((x) => x.id === ev.id);
              const html = `<span class="k">${esc(p ? p.name : 'кто-то')}</span><span class="how">KILL FRENZY ×${count}</span>`;
              if (cont && prev.line && prev.line.isConnected && !prev.line.classList.contains('out')) {
                prev.line.innerHTML = html;
                frenzies.set(ev.id, { t: nowT, count, line: prev.line });
              } else frenzies.set(ev.id, { t: nowT, count, line: addFeed(html, false) });
            }
          }
          break;
        case 'pickup':
          if (ev.by === meId) showToast(PICKUP_LABELS[ev.kind] || String(ev.kind).toUpperCase(), PICKUP_COLORS[ev.kind]);
          break;
        case 'carjack':
          if (ev.by === meId) showToast('УГОН! +$50', '#ffd23f');
          break;
        case 'chat':
          addLog(`<span class="n" style="color:${esc(colorOf(view, ev.from))}">${esc(ev.name)}:</span>${esc(ev.text)}`);
          break;
        case 'join':
          addLog(`<span class="sys">▸ ${esc(ev.name)} заходит в город</span>`);
          break;
        case 'leave':
          addLog(`<span class="sys leave">◂ ${esc(ev.name)} уехал из города</span>`);
          break;
      }
    },

    isTyping() {
      return typing;
    },

    onChat(cb) {
      chatCbs.push(cb);
    },
  };
}

function colorOf(view, id) {
  const p = view && (view.players || []).find((x) => x.id === id);
  return (p && p.color) || '#22e6d6';
}

function palm(x, h, dir) {
  const w = 260;
  const top = 420 - h;
  const lean = dir * 30;
  const leaves = [-150, -115, -70, -30, 15, 55, 100, 140].map((ang) => {
    const r = (ang * Math.PI) / 180;
    const ex = Math.cos(r) * 110;
    const ey = Math.sin(r) * 60 + 40;
    const mx = Math.cos(r) * 60;
    const my = Math.sin(r) * 50 - 20;
    return `<path d="M${130 + lean} ${top} Q${130 + lean + mx} ${top + my} ${130 + lean + ex} ${top + ey} Q${130 + lean + mx * 0.9} ${top + my + 14} ${130 + lean} ${top + 6}z"/>`;
  }).join('');
  return `<svg style="left:${x - 130}px" width="${w}" height="420" viewBox="0 0 ${w} 420"><path d="M126 420 Q${126 + lean * 0.4} ${top + h / 2} ${126 + lean} ${top} l8 0 Q${134 + lean * 0.4} ${top + h / 2} 136 420z"/>${leaves}</svg>`;
}
