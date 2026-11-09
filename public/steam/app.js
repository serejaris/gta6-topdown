(() => {
  const $ = (s) => document.querySelector(s);

  function toast(title, sub) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = title;
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      t.appendChild(s);
    }
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  function confetti(n) {
    const colors = ['#ff3e9a', '#ffcf4a', '#26e4d8', '#66c0f4', '#a4d007'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's';
      c.style.animationDelay = Math.random() * 0.4 + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }
  }

  const viewer = $('#viewer');
  const slides = [...viewer.querySelectorAll('.slide')];
  const thumbs = $('#thumbs');
  let cur = 0;
  let timer = null;

  slides.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'thumb';
    b.setAttribute('aria-label', 'Слайд ' + (i + 1));
    const img = s.querySelector('img');
    if (img && s.dataset.kind !== 'live') b.style.backgroundImage = `url(${img.getAttribute('src')})`;
    if (s.dataset.kind === 'live') b.classList.add('t-live');
    if (s.classList.contains('art-ray')) b.classList.add('t-ray');
    b.addEventListener('click', () => { show(i); stopAuto(); });
    thumbs.appendChild(b);
  });

  function show(i) {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('on', k === cur));
    [...thumbs.children].forEach((t, k) => t.classList.toggle('on', k === cur));
    const tb = thumbs.children[cur];
    thumbs.scrollTo({ left: tb.offsetLeft - thumbs.clientWidth / 2 + tb.clientWidth / 2, behavior: 'smooth' });
    const bar = $('#scrub');
    bar.style.marginLeft = (cur / (slides.length - 1)) * 80 + '%';
  }

  function stopAuto() { clearInterval(timer); timer = null; }

  show(0);
  timer = setInterval(() => show(cur + 1), 4500);
  viewer.addEventListener('pointerdown', stopAuto);
  $('#playLive').addEventListener('click', () => {
    stopAuto();
    const f = document.createElement('iframe');
    f.title = 'Живой геймплей';
    f.src = '/?name=Steam&auto=1&bot=1';
    $('#poster').replaceWith(f);
    viewer.querySelector('.live').classList.add('playing');
  });

  const reviews = [
    { name: 'ЖдуС2013', ava: '#ff3e9a', hours: '4 812,4', owned: 'Товаров на аккаунте: 1', pos: true, date: '9 ноября',
      text: 'Ждал GTA 6 так долго, что успел выучить промпт-инжиниринг. Пока ждал, вышла эта. Угнал машину, получил пять звёзд, расплакался. Рекомендую всем, кто тоже ждёт.' },
    { name: 'Агент №4 (рендер)', ava: '#26e4d8', hours: '0,1', owned: 'Контекст: 92%', pos: true, date: '9 ноября',
      text: 'Я лично нарисовал каждое окно в этом городе. Все одинаковые, потому что так детерминированнее. Ставлю «рекомендую», хотя меня, кажется, никто не спрашивал.' },
    { name: 'КотЗаКлавиатурой', ava: '#ffcf4a', hours: '0,03', owned: 'Обзоров: 1', pos: true, date: '9 ноября',
      text: 'Наступил на W и уехал в даунтаун. Потом на F и вышел из машины. Потом на Ctrl+W и вышел из игры. Лучшие три секунды в моей жизни.' },
    { name: 'bot_Tommy_3', ava: '#66c0f4', hours: '168,0', owned: 'Режим: auto=1&bot=1', pos: true, date: 'всё время',
      text: 'Я бот. Я играю сам с собой с момента релиза. Меня запустили для скриншота и забыли выключить. Здесь хорошо. Пешеходы тоже боты, мы дружим.' },
    { name: 'Бета-тестер №7', ava: '#a4d007', hours: '2,5', owned: 'Значков: 0', pos: true, date: '9 ноября',
      text: 'Нашёл баг: машины взрываются. Мне сказали, что это фича. Нашёл второй баг: взрываются и меня. Тоже фича. Теперь я не нахожу баги, я нахожу фичи.' },
    { name: 'ВайбкодерИзПодъезда', ava: '#8a2be2', hours: '11,7', owned: 'Подписок: слишком много', pos: false, date: '9 ноября',
      text: 'Не рекомендую. Я хотел посмотреть, как агенты пишут игру, а они её написали. Теперь мне нечего смотреть на эфире. Верните ожидание.', note: 'Автор этого обзора всё равно поставил игре 10 из 10' },
  ];

  const list = $('#revList');
  reviews.forEach((r) => {
    const el = document.createElement('div');
    el.className = 'review';
    el.innerHTML = `
      <div class="rv-user"><i class="rv-ava"></i><div class="rv-name"></div><div class="rv-meta"></div></div>
      <div class="rv-body">
        <div class="rv-verdict"><span class="rv-thumb${r.pos ? '' : ' neg'}">&#9650;</span><div><b>${r.pos ? 'Рекомендую' : 'Не рекомендую'}</b><small>${r.hours} ч. всего</small></div></div>
        <div class="rv-text"></div>
        <div class="rv-help">Был ли этот обзор полезен? <button data-h="yes">Да</button><button data-h="no">Нет</button><button data-h="lol">Смешно</button><span class="rv-count"></span></div>
      </div>`;
    el.querySelector('.rv-ava').style.background = `linear-gradient(135deg, ${r.ava}, #12081f)`;
    el.querySelector('.rv-name').textContent = r.name;
    el.querySelector('.rv-meta').textContent = r.owned + ' · опубликовано: ' + r.date;
    el.querySelector('.rv-text').textContent = r.text;
    if (r.note) {
      const n = document.createElement('div');
      n.className = 'rv-help';
      n.textContent = r.note;
      el.querySelector('.rv-text').after(n);
    }
    let helpful = Math.floor(Math.random() * 900) + 100;
    const cnt = el.querySelector('.rv-count');
    cnt.textContent = ` ${helpful} пользователей сочли обзор полезным`;
    el.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => {
      helpful = b.dataset.h === 'no' ? helpful * 2 : helpful + 1;
      cnt.textContent = ` ${helpful} пользователей сочли обзор полезным` + (b.dataset.h === 'no' ? ' (ваше «нет» засчитано как два «да»)' : '');
    }));
    list.appendChild(el);
  });

  const ach = [
    ['HW', '#66c0f4', 'Hello, world', 'Открыть вкладку. Получено 100% игроков.'],
    ['5★', '#ffcf4a', 'Rate limit', 'Собрать пять звёзд розыска быстрее, чем агент упрётся в лимит.'],
    ['ВП', '#ff3e9a', 'Вы абсолютно правы', 'Услышать это от агента три раза за минуту.'],
    ['WM', '#26e4d8', 'Работает на моей машине', 'Угнать машину. Любую. Она теперь ваша машина.'],
    ['FF', '#a4d007', 'Мёрж в пятницу', 'Выйти из игры в пятницу вечером без единого бага.'],
    ['VI', '#8a2be2', 'Дождался', 'Дождаться выхода настоящей GTA 6. Получено 0,00% игроков.'],
  ];
  const grid = $('#achv');
  ach.forEach(([k, c, t]) => {
    const a = document.createElement('div');
    a.className = 'ach';
    a.style.background = c;
    a.textContent = k;
    a.title = t;
    a.addEventListener('click', () => { toast('Достижение получено: ' + t, 'Ой, нет. Показалось.'); });
    grid.appendChild(a);
  });
  const al = document.createElement('div');
  al.className = 'ach-list';
  ach.forEach(([, c, t, d]) => {
    const it = document.createElement('div');
    it.className = 'ach-item';
    it.innerHTML = '<i></i><div><b></b><span></span></div>';
    it.querySelector('i').style.background = c;
    it.querySelector('b').textContent = t;
    it.querySelector('span').textContent = d;
    al.appendChild(it);
  });
  grid.after(al);

  let target = new Date('2026-11-19T00:00:00').getTime();
  const pad = (n) => String(n).padStart(2, '0');
  const notes = [
    'Перенесли ещё на день. Агенты здесь ни при чём.',
    'Перенесли на неделю: в трейлере нашли пиксель.',
    'Перенесли на месяц: пешеходам не хватило реплик.',
    'Перенесли на год. Мы тоже удивились.',
  ];
  const shifts = [1, 7, 30, 365].map((d) => d * 864e5);
  function tick() {
    let ms = target - Date.now();
    if (ms <= 0) {
      target += 365 * 864e5;
      $('#cdNote').textContent = 'Дата наступила, поэтому её перенесли на год. Таков закон.';
      ms = target - Date.now();
    }
    const s = Math.floor(ms / 1000);
    $('#cdD').textContent = Math.floor(s / 86400);
    $('#cdH').textContent = pad(Math.floor(s / 3600) % 24);
    $('#cdM').textContent = pad(Math.floor(s / 60) % 60);
    $('#cdS').textContent = pad(s % 60);
  }
  tick();
  setInterval(tick, 1000);
  let waits = 0;
  $('#cdWait').addEventListener('click', () => {
    const k = Math.min(waits, 3);
    target += shifts[k];
    waits++;
    $('#cdNote').textContent = notes[k];
    $('#cdWait').textContent = waits < 4 ? 'Подождать ещё' : 'Играть в эту, пока ждёте';
    if (waits >= 4) $('#cdWait').onclick = () => { location.href = '/'; };
    tick();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      target += 3 * 864e5;
      $('#cdNote').textContent = 'Пока вас не было, перенесли на три дня.';
      tick();
    }
  });

  const wish = $('#wish');
  let flee = 0;
  let wishN = 6;
  wish.addEventListener('mouseenter', () => {
    if (flee >= 3 || matchMedia('(hover: none)').matches) return;
    flee++;
    const dx = (Math.random() > 0.5 ? 1 : -1) * (60 + Math.random() * 120);
    const dy = (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 20);
    wish.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 20}deg)`;
    if (flee === 3) {
      setTimeout(() => { wish.style.transform = ''; }, 500);
      toast('Кнопка устала убегать', 'Агент hud говорит, что это анимация «нежелания».');
    }
  });
  wish.addEventListener('click', () => {
    wishN = wishN * 6 + 6;
    wish.classList.add('done');
    wish.textContent = wishN > 100000 ? 'В желаемом. Хватит.' : 'В желаемом ×' + Math.round(wishN / 6);
    $('#wishCount').textContent = 'в желаемом у ' + wishN.toLocaleString('ru-RU') + ' агентов (большинство из них вы)';
    const msgs = [
      ['Добавлено в желаемое', 'Агенты закоммитили это в main.'],
      ['Добавлено ещё раз', 'Шесть агентов проголосовали за то, чтобы добавить шесть раз.'],
      ['Желаемое переполнено', 'Игра бесплатная. Её можно просто открыть.'],
    ];
    const m = msgs[Math.min(Math.round(Math.log(wishN / 6) / Math.log(7)) - 1, 2)] || msgs[2];
    toast(m[0], m[1]);
    confetti(40);
    document.body.style.transform = `rotate(${(Math.random() - 0.5) * 1.2}deg)`;
    setTimeout(() => { document.body.style.transform = ''; }, 700);
  });

  $('#preorder').addEventListener('click', () => {
    toast('Предзаказ оформлен', 'Ваш агент-стажёр уже говорит, что вы абсолютно правы.');
    confetti(80);
  });
  $('#follow').addEventListener('click', (e) => {
    e.target.textContent = 'Вы подписаны на эфир';
    toast('Подписка оформлена', 'Уведомление придёт, когда агенты что-нибудь сломают.');
  });
  $('#ignore').addEventListener('click', (e) => {
    e.target.textContent = 'Нельзя скрыть';
    toast('Не получилось скрыть', 'Игра вышла раньше GTA 6, от неё не спрятаться.');
  });

  const extraTags = ['Пять звёзд', 'Ноль комментариев в коде', 'Сделано без сна', 'Ранний доступ к позднему выходу', 'Нейросетевой реализм', 'Смотреть с чатом', 'Без лутбоксов', 'Шесть из шести'];
  document.addEventListener('click', (e) => {
    const j = e.target.closest('[data-joke]');
    if (!j) return;
    const kind = j.dataset.joke;
    if (kind === 'tag') {
      const t = extraTags.shift();
      if (!t) { toast('Метки закончились', 'Агент refs ушёл искать новые референсы.'); return; }
      const a = document.createElement('a');
      a.className = 'new';
      a.textContent = t;
      j.before(a);
    } else if (kind === 'support') {
      e.preventDefault();
      toast('Поддержка', 'Перезагрузите вкладку. Если не помогло, перезагрузите эфир.');
    }
  });
  const search = document.querySelector('.search');
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    toast('По запросу «' + search.value.slice(0, 40) + '» найдено', 'Одна игра. Эта. Других мы не делали.');
    search.value = '';
  });
})();
