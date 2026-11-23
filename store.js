/* TM Store — логика магазина.
   Каталог: window.DUKAN_DATA (apps.js, собирается sobrat_katalog.py).
   В приложении есть мост window.Android (MainActivity.Bridge):
     installed(json пакетов) -> {"пакет": versionCode}, install(id, url), open(pkg), uninstall(pkg)
   Ответы из Android: onDl(id, процент | -1 ошибка | -2 нужно разрешение | 101 ставится), refreshInstalled()
   На сайте (без моста) кнопка «Установить» просто скачивает apk. */
const DATA = window.DUKAN_DATA || {apps: []};
/* ?most=demo — показать режим приложения в обычном браузере (без настоящей установки) */
if (!window.Android && /[?&]most=demo/.test(location.search)) {
  const fake = {'com.zhdem.malysh': 3, 'com.mekan.namaz': 1};
  window.Android = {
    installed: () => JSON.stringify(fake),
    install: (id) => { let p = 0; const t = setInterval(() => { p += 20; onDl(id, p);
      if (p >= 100) { clearInterval(t); const a = DATA.apps.find(x => x.id === id); fake[a.pkg] = a.versionCode; setTimeout(() => onDl(id, 200), 400); } }, 250); },
    open: pkg => toast('Открываю ' + pkg),
    uninstall: pkg => { delete fake[pkg]; setTimeout(refreshInstalled, 300); }
  };
}
const AND = window.Android || null;
let A = DATA.apps;
/* адрес сайта магазина (store.server в prilozheniya.json): оттуда приложение берёт свежий каталог и apk */
const SERVER = (DATA.store && DATA.store.server) || '';
const apkUrl = a => new URL(a.url, SERVER || location.href).href;
const byId = id => A.find(a => a.id === id);
let inst = {};          // пакет -> установленный versionCode
const dl = {};          // id -> процент загрузки

function readInstalled() {
  if (!AND) return;
  try { inst = JSON.parse(AND.installed(JSON.stringify(A.filter(a => a.pkg).map(a => a.pkg)))) || {}; }
  catch (e) { inst = {}; }
}
/* состояние кнопки: soon | get | update | open | busy */
function state(a) {
  if (a.soon) return 'soon';
  if (dl[a.id] !== undefined) return 'busy';
  const v = inst[a.pkg];
  if (v === undefined) return 'get';
  return v < a.versionCode ? 'update' : 'open';
}
const LABEL = {soon: 'Скоро', get: 'Установить', update: 'Обновить', open: 'Открыть'};
function btnText(a) {
  const s = state(a);
  if (s !== 'busy') return LABEL[s];
  const p = dl[a.id];
  return p >= 100 ? 'Установка…' : (p > 0 ? p + ' %' : 'Загрузка…');
}
function btnCls(a) { const s = state(a); return s === 'open' ? 'ghost' : s === 'soon' ? 'gray' : ''; }
function mainBtn(a, extra = '') {
  return `<button class="btn ${btnCls(a)} ${extra}" data-act="${a.id}" onclick="event.stopPropagation();act('${a.id}')"><div class="prog" style="width:${state(a) === 'busy' ? Math.max(0, Math.min(dl[a.id], 100)) : 0}%"></div><span>${btnText(a)}</span></button>`;
}
function refreshButtons() {
  document.querySelectorAll('[data-act]').forEach(b => {
    const a = byId(b.dataset.act); if (!a) return;
    b.className = 'btn ' + btnCls(a) + (b.classList.contains('sm') ? ' sm' : '');
    b.querySelector('span').textContent = btnText(a);
    b.querySelector('.prog').style.width = (state(a) === 'busy' ? Math.max(0, Math.min(dl[a.id], 100)) : 0) + '%';
  });
  updBadge();
}

function act(id) {
  const a = byId(id), s = state(a);
  if (s === 'soon') return toast('Скоро появится в TM Store');
  if (s === 'busy') return;
  if (s === 'open') { if (AND) AND.open(a.pkg); return; }
  if (!AND) {             // сайт: обычное скачивание файла
    const l = document.createElement('a'); l.href = a.url; l.download = a.name + '.apk'; document.body.appendChild(l); l.click(); l.remove();
    return toast('Файл скачивается — откройте его, чтобы установить');
  }
  dl[id] = 0; refreshButtons();
  if (!SERVER && location.protocol === 'file:') { delete dl[id]; refreshButtons(); return toast('Сервер магазина ещё не подключён'); }
  AND.install(id, apkUrl(a));
}
/* вызывает Android */
window.onDl = function (id, p) {
  const a = byId(id); if (!a) return;
  if (p === -1) { delete dl[id]; toast('Не удалось скачать. Проверьте интернет'); }
  else if (p === -2) { delete dl[id]; toast('Разрешите TM Store устанавливать приложения и нажмите ещё раз'); }
  else if (p === -3) { delete dl[id]; toast('Установка отменена'); }
  else if (p === 200) { delete dl[id]; readInstalled(); toast(a.name + ' установлено'); }
  else dl[id] = p;
  refreshButtons(); if (p === 200 && cur === 'mine') renderMine();
};
window.refreshInstalled = function () {
  readInstalled();
  for (const id in dl) if (dl[id] >= 100 && inst[byId(id).pkg] >= byId(id).versionCode) delete dl[id];
  refreshButtons(); if (cur === 'mine') renderMine();
};

/* ---------- экраны ---------- */
const ic = (a, s) => `<div class="ic ${a.full ? 'full' : ''}" style="width:${s}px;height:${s}px"><img src="img/${a.icon}" alt=""></div>`;
const meta = a => a.soon ? 'Скоро' : (a.size + ' · v' + a.versionName);
const CHIPS = {app: ['Все', 'Работа', 'Финансы', 'Обучение', 'Авто', 'Бизнес', 'Недвижимость'], game: ['Все'], kids: ['Все']};
let tab = 'app', chip = 'Все';

function pool() {
  let l = A.filter(a => tab === 'app' ? a.kind !== 'game' : a.kind === tab);
  if (chip !== 'Все') l = l.filter(a => a.cat === chip);
  return l.filter(a => !a.last).concat(l.filter(a => a.last));
}
function feed() {
  document.getElementById('chips').innerHTML = CHIPS[tab].map(c => `<div class="chip ${c === chip ? 'on' : ''}" data-c="${c}">${c}</div>`).join('');
  const list = pool();
  const feat = list.filter(a => a.featured);
  const hero = feat.map(a => `
    <div class="ban" onclick="openApp('${a.id}')">
      <div class="pic" style="background:linear-gradient(135deg,${a.g[0]},${a.g[1]})">
        <span class="tag">${a.kind === 'game' ? 'Игра недели' : 'Выбор редакции'}</span><img src="img/${a.full ? 'racing_car.png' : a.icon}"><h3>${a.short}</h3></div>
      <div class="meta">${ic(a, 40)}<div class="t"><b>${a.name}</b><span>${a.cat} · ${meta(a)}</span></div>${mainBtn(a, 'sm')}</div>
    </div>`).join('');
  const tiles = list.map(a => `<div class="tile" onclick="openApp('${a.id}')">${ic(a, 96)}<b>${a.name}</b><span>${a.soon ? 'Скоро' : a.size}</span></div>`).join('');
  const rows = list.map(a => `
    <div class="li" onclick="openApp('${a.id}')">${ic(a, 58)}
      <div class="t"><b>${a.name}</b><span>${a.cat} · ${a.dev}</span><em>${meta(a)}</em></div>${mainBtn(a, 'sm')}</div>`).join('');
  document.getElementById('feed').innerHTML = !list.length ? `<div class="empty">Здесь пока пусто — скоро добавим</div>` : `
    ${feat.length ? `<div class="sec"><div class="row">${hero}</div></div>` : ''}
    <div class="sec"><h2><div>Рекомендуем<small>Приложения от Cloudy</small></div></h2><div class="row">${tiles}</div></div>
    <div class="sec"><h2><div>Все приложения</div></h2><div class="list">${rows}</div></div>`;
}

function openApp(id) {
  const a = byId(id), s = state(a);
  const p = document.getElementById('page');
  p.innerHTML = `
    <div class="bar"><button onclick="back()"><svg class="i"><use href="#i-back"/></svg></button><div class="sp"></div>
      <button onclick="go('search')"><svg class="i"><use href="#i-search"/></svg></button></div>
    <div class="head">${ic(a, 76)}<div><h1>${a.name}</h1><div class="dev">${a.dev}</div><div class="sub">Без рекламы · Бесплатно</div></div></div>
    <div class="stats">
      <div><b>${a.soon ? '—' : 'v' + a.versionName}</b><span>версия</span></div>
      <div><b><svg class="i" style="width:16px;height:16px"><use href="#i-down"/></svg>${a.soon ? '—' : a.size}</b><span>размер</span></div>
      <div><b>${(a.langs || []).length || 1}</b><span>${(a.langs || []).length > 1 ? 'языка' : 'язык'}</span></div>
      <div><b>${a.cat}</b><span>категория</span></div>
    </div>
    <div class="install">${s === 'open' || s === 'update' ? `<button class="btn ghost" onclick="AND&&AND.uninstall('${a.pkg}')">Удалить</button>` : ''}${mainBtn(a)}</div>
    <div class="shots">${a.shots.map((t, i) => `<div class="shot" style="background:linear-gradient(${160 + i * 25}deg,${a.g[0]},${a.g[1]})"><b>${t}</b><img src="img/${a.full ? 'racing_car.png' : a.icon}"><div class="ln" style="width:90%"></div><div class="ln" style="width:60%"></div><div class="ln" style="width:75%"></div></div>`).join('')}</div>
    <div class="blk"><h3>О приложении</h3><p>${a.about}</p>
      <div class="tags"><span>${a.cat}</span>${(a.langs || []).map(l => `<span>${l}</span>`).join('')}</div></div>
    ${a.news ? `<div class="blk"><h3>Что нового</h3><div class="whatsnew">${a.news}</div></div>` : ''}
    <div class="blk"><h3>Безопасность</h3>
      <div class="safe"><div><svg class="i"><use href="#i-shield"/></svg>Файл подписан разработчиком ${a.dev} и скачивается напрямую</div><div><svg class="i"><use href="#i-lock"/></svg>Без рекламы и встроенных покупок</div></div></div>
    ${a.pkg ? `<div class="blk"><p style="font-size:12px">Пакет: ${a.pkg}</p></div>` : ''}
    <div class="blk"><h3>Другие приложения</h3></div>
    <div class="row" style="padding-top:4px">${A.filter(x => x.id !== id).slice(0, 8).map(x => `<div class="tile" onclick="openApp('${x.id}')">${ic(x, 96)}<b>${x.name}</b><span>${x.soon ? 'Скоро' : x.size}</span></div>`).join('')}</div>
    <div style="height:24px"></div>`;
  show('page'); p.scrollTop = 0;
}

function updBadge() {
  const n = A.filter(a => state(a) === 'update').length;
  const b = document.getElementById('upd'); b.textContent = n; b.style.display = n ? '' : 'none';
}
function renderMine() {
  readInstalled();
  const up = A.filter(a => state(a) === 'update' || (dl[a.id] !== undefined && inst[a.pkg] !== undefined));
  const mine = A.filter(a => inst[a.pkg] !== undefined);
  document.getElementById('mylist').innerHTML = !AND ? `<div class="card"><div class="empty">Установите приложение TM Store на телефон —<br>здесь появятся ваши приложения и обновления.</div></div>` : `
    <div class="card"><div class="tt"><b>Обновления</b><span>${up.length}</span></div>
      ${up.length ? `<div class="list" style="padding:8px 0 0">${up.map(a => `<div class="li">${ic(a, 50)}<div class="t"><b>${a.name}</b><span>${a.size} · v${a.versionName}</span></div>${mainBtn(a, 'sm')}</div>`).join('')}</div>
      <button class="btn" style="width:100%;margin-top:10px" onclick="updateAll()">Обновить всё</button>` : `<div class="empty">Все приложения обновлены ✓</div>`}</div>
    <div class="card"><div class="tt"><b>Установлено из TM Store</b><span>${mine.length}</span></div>
      ${mine.length ? `<div class="list" style="padding:8px 0 0">${mine.map(a => `<div class="li" onclick="openApp('${a.id}')">${ic(a, 50)}<div class="t"><b>${a.name}</b><span>${a.size}</span></div>${mainBtn(a, 'sm')}</div>`).join('')}</div>` : `<div class="empty">Пока ничего не установлено</div>`}</div>`;
  updBadge();
}
function updateAll() { const l = A.filter(a => state(a) === 'update'); if (l[0]) act(l[0].id); if (l.length > 1) toast('Обновляю по одному: ' + l[0].name); }

function doSearch() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const cats = [['Работа', 'hammer_and_wrench.png', '#d97706'], ['Финансы', 'currency_exchange.png', '#059669'], ['Игры', 'crossed_swords.png', '#7c3aed'], ['Семья', 'baby.png', '#db2777'], ['Обучение', 'books.png', '#0369a1'], ['Авто', 'racing_car.png', '#334155']];
  const res = A.filter(a => (a.name + ' ' + a.cat + ' ' + a.short + ' ' + a.about).toLowerCase().includes(q));
  document.getElementById('sres').innerHTML = !q ? `<div class="sec"><h2><div>Категории</div></h2><div class="cats">${cats.map(([n, i, c]) => `<div class="cat" style="background:${c}" onclick="document.getElementById('q').value='${n === 'Семья' ? 'малыш' : n === 'Игры' ? 'стратег' : n}';doSearch()">${n}<img src="img/${i}"></div>`).join('')}</div></div>`
    : res.length ? `<div class="list" style="padding-top:12px">${res.map(a => `<div class="li" onclick="openApp('${a.id}')">${ic(a, 58)}<div class="t"><b>${a.name}</b><span>${a.cat} · ${a.dev}</span><em>${meta(a)}</em></div>${mainBtn(a, 'sm')}</div>`).join('')}</div>`
    : `<div class="empty">Ничего не найдено</div>`;
}

/* ---------- переходы ---------- */
let hist = ['home'], cur = 'home';
function show(s) { cur = s; ['home', 'search', 'mine', 'page'].forEach(x => document.getElementById(x).classList.toggle('hide', x !== s)); if (hist[hist.length - 1] !== s) hist.push(s); }
function back() { hist.pop(); const s = hist[hist.length - 1] || 'home'; if (s === 'home') feed(); if (s === 'mine') renderMine(); show(s); }
window.appBack = function () { if (hist.length > 1) { back(); return true; } return false; };   // кнопка «назад» Android
function go(s) {
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.s === s));
  if (s === 'game') { setTab('game'); s = 'home'; }
  else if (s === 'home') setTab(tab === 'game' ? 'app' : tab);
  if (s === 'search') { doSearch(); setTimeout(() => document.getElementById('q').focus(), 50); }
  if (s === 'mine') renderMine();
  hist = ['home']; show(s); document.getElementById(s).scrollTop = 0;
}
function setTab(k) { tab = k; chip = 'Все'; document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.k === k)); feed(); }
document.getElementById('tabs').onclick = e => { const t = e.target.closest('.tab'); if (t) { setTab(t.dataset.k); document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.s === (t.dataset.k === 'game' ? 'game' : 'home'))); } };
document.getElementById('nav').onclick = e => { const a = e.target.closest('a'); if (a) go(a.dataset.s); };
document.getElementById('chips').onclick = e => { const c = e.target.closest('.chip'); if (c) { chip = c.dataset.c; feed(); } };
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2400); }

if (AND) document.documentElement.classList.add('in-app');
readInstalled(); feed(); renderMine();
/* свежий каталог с сервера (в приложении) */
if (SERVER && location.protocol === 'file:')
  fetch(SERVER + 'apps.json', {cache: 'no-cache'}).then(r => r.json()).then(d => { A = d.apps; readInstalled(); feed(); if (cur === 'mine') renderMine(); updBadge(); }).catch(() => {});
