const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Cloudinary: ask for auto format/quality + a sane width. Everything else passes through.
const img = (u, w = 900) => {
  const m = String(u || '').match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
  return m ? `${m[1]}f_auto,q_auto,w_${w}/${m[2]}` : u || '';
};
const host = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
};

let DATA = null;

async function load() {
  const r = await fetch('/api/portfolio', { cache: 'no-cache' });
  if (!r.ok) throw new Error('Could not load portfolio');
  DATA = await r.json();
  render(DATA);
}

function render({ profile: p, projects, certificates, skills }) {
  document.title = `${p.name} — ${p.role}`;
  $('#brand').textContent = p.name;
  $('#h-name').textContent = p.name;
  $('#h-eyebrow').textContent = [p.role, p.location].filter(Boolean).join(' · ') || 'Portfolio';
  $('#h-tag').textContent = p.tagline;
  $('#f-brand').textContent = p.name;
  $('#f-meta').textContent = `© ${new Date().getFullYear()}${p.location ? ' · ' + p.location : ''}`;
  typewriter($('#h-typed'), p.roles?.length ? p.roles : [p.role]);

  // hero visual: photo (or initial), orbit text around it
  const ph = $('#h-photo');
  if (p.photo) {
    ph.src = img(p.photo, 800);
    ph.alt = p.name;
    ph.hidden = false;
    $('#h-initial').hidden = true;
  } else {
    $('#h-initial').textContent = p.name.slice(0, 1);
  }
  orbit(p);

    // links
  const links = [
    ['GitHub', p.github],
    ['LinkedIn', p.linkedin],
    ['Instagram', p.instagram],
    ['Email', p.email],
  ].filter(([, u]) => u);
  const linkHtml = (l, u, cls) =>
    l === 'Email'
      ? `<a href="#" class="${cls} copy-mail" data-email="${esc(u)}">Email</a>`
      : `<a href="${esc(u)}" class="${cls}" target="_blank" rel="noopener">${l}</a>`;
  $('#h-social').innerHTML = links.map(([l, u]) => linkHtml(l, u, '')).join('');
  $('#k-links').innerHTML = links
    .map(([l, u]) => linkHtml(l, u, `btn ${l === 'Email' ? 'btn-primary' : 'btn-ghost'}`))
    .join('');

  // about
  $('#a-text').textContent = p.about;
  $('#a-meta').textContent = [p.location, p.email].filter(Boolean).join('  ·  ');
  if (p.resume) {
    const a = $('#a-resume');
    a.href = p.resume;
    a.hidden = false;
  }

  // stats strip
  const techs = new Set(projects.flatMap((x) => x.tech || []).map((t) => t.toLowerCase()));
  const stats = [
    [projects.length, 'Projects'],
    [certificates.length, 'Certificates'],
    [skills.length, 'Skills'],
    [techs.size, 'Technologies'],
  ];
  $('#stats-grid').innerHTML = stats
    .map(([n, l]) => `<div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`)
    .join('');
  $('#stats').hidden = !(projects.length + certificates.length + skills.length);

  // skills
  const groups = {};
  skills.forEach((s) => (groups[s.category] ||= []).push(s));
  $('#s-groups').innerHTML = Object.entries(groups)
    .map(
      ([cat, list]) => `<div class="sg"><h3>${esc(cat)}</h3>${list
        .map((s) => `<div class="sk"><div class="sk-row"><span>${esc(s.name)}</span><b>${s.level ? s.level + '%' : ''}</b></div><div class="bar"><i data-w="${s.level || 0}"></i></div></div>`)
        .join('')}</div>`
    )
    .join('');
  show('skills', skills.length);

  // projects
  $('#p-grid').innerHTML = projects
    .map(
      (x, i) => `<button class="card" data-kind="p" data-i="${i}">
        ${x.featured ? '<span class="star">★ Featured</span>' : ''}
        <div class="card-media">${x.image ? `<img loading="lazy" decoding="async" src="${esc(img(x.image, 700))}" alt="">` : esc(x.title.slice(0, 1))}</div>
        <div class="card-body"><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p>
        <div class="chips">${(x.tech || []).slice(0, 5).map((t) => `<span>${esc(t)}</span>`).join('')}</div></div></button>`
    )
    .join('');
  show('projects', projects.length);

  // certificates
  $('#c-grid').innerHTML = certificates
    .map(
      (x, i) => `<button class="card" data-kind="c" data-i="${i}">
        <div class="card-media">${x.image ? `<img loading="lazy" decoding="async" src="${esc(img(x.image, 600))}" alt="">` : '🏅'}</div>
        <div class="card-body">${x.date ? `<div class="card-date">${esc(x.date)}</div>` : ''}<h3>${esc(x.title)}</h3><p>${esc(x.issuer)}</p></div></button>`
    )
    .join('');
  show('certs', certificates.length);

  wireReveal();
}

function show(id, n) {
  $('#' + id).hidden = !n;
  const link = document.querySelector(`[data-sec="${id}"]`);
  if (link) link.hidden = !n;
}

// ---------- orbit text around the photo ----------
function orbit(p) {
  const parts = [p.name, p.role].filter(Boolean).map((s) => s.toUpperCase());
  let unit = (parts.join(' • ') || 'PORTFOLIO') + ' • ';
  if (unit.length > 90) unit = (parts[0] || 'PORTFOLIO') + ' • ';
  const text = unit.repeat(Math.max(1, Math.round(105 / unit.length)));
  const spacing = Math.max(0.5, (1281 - text.length * 8.4) / text.length); // circle length 2π·204 ≈ 1281
  $('#orbit-text').style.letterSpacing = spacing.toFixed(2) + 'px';
  $('#orbit-tp').textContent = text;
}

// ---------- typewriter ----------
function typewriter(node, words) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = words[0]; return; }
  let w = 0, c = 0, del = false;
  (function tick() {
    const word = words[w % words.length];
    node.textContent = word.slice(0, c);
    if (!del && c === word.length) { del = true; return setTimeout(tick, 1400); }
    if (del && c === 0) { del = false; w++; }
    c += del ? -1 : 1;
    setTimeout(tick, del ? 35 : 70);
  })();
}


// ---------- contact form: visitor types a message, it lands in your inbox ----------
const WEB3FORMS_KEY = 'PASTE_YOUR_ACCESS_KEY_HERE';

document.addEventListener('click', (e) => {
  const a = e.target.closest('.copy-mail');
  if (!a) return;
  e.preventDefault();
  openModal(`
    <h3>Send me a message</h3>
    <form id="cf" class="cf">
      <input name="name" placeholder="Your name" required>
      <input name="email" type="email" placeholder="Your email" required>
      <textarea name="message" rows="5" placeholder="Your message" required></textarea>
      <input type="checkbox" name="botcheck" style="display:none" tabindex="-1" autocomplete="off">
      <button class="btn btn-primary" type="submit">Send message</button>
      <p id="cf-status" class="desc"></p>
    </form>`);
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'cf') return;
  e.preventDefault();
  const f = e.target, st = $('#cf-status'), btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const fd = new FormData(f);
  fd.append('access_key', WEB3FORMS_KEY);
  fd.append('subject', 'New message from your portfolio');
  fd.append('from_name', 'Portfolio Contact');
  try {
    const r = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: fd });
    const j = await r.json();
    if (!j.success) throw new Error(j.message);
    f.reset();
    st.textContent = 'Message sent ✓ I will reply soon.';
    btn.textContent = 'Sent';
  } catch (err) {
    st.textContent = 'Could not send. Please try again later.';
    btn.disabled = false;
    btn.textContent = 'Send message';
  }
});


// ---------- floating spark particles in the hero (same as the club site) ----------
function initSparkParticles() {
  const hero = $('.hero');
  if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'spark-container';
  hero.insertBefore(box, hero.firstChild);
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('div');
    s.className = 'spark-particle';
    const size = Math.random() * 3 + 2;
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${Math.random() * 100}%`;
    const dur = Math.random() * 6 + 7;
    s.style.animationDuration = `${dur}s`;
    s.style.animationDelay = `${Math.random() * dur}s`;
    s.style.setProperty('--drift', `${Math.random() * 60 - 30}px`);
    box.appendChild(s);
  }
}

// ---------- 3D tilt on cards (mouse only, same as the club site) ----------
function initCardTilt() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const maxTilt = 8;
  document.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const ry = (x / r.width - 0.5) * maxTilt * 2;
    const rx = (y / r.height - 0.5) * -maxTilt * 2;
    card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
  });
  document.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.card');
    if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
  });
}

// ---------- reveal on scroll ----------
let io;
function wireReveal() {
  io ||= new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        e.target.querySelectorAll('.bar i').forEach((b) => (b.style.width = b.dataset.w + '%'));
        io.unobserve(e.target);
      }),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal:not(.in)').forEach((s) => io.observe(s));
}

// ---------- nav ----------
const burger = $('#burger'), links = $('#links');
burger.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  burger.setAttribute('aria-expanded', open);
});
links.addEventListener('click', () => { links.classList.remove('open'); burger.setAttribute('aria-expanded', false); });
const spy = new IntersectionObserver(
  (es) => es.forEach((e) => e.isIntersecting && links.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id))),
  { rootMargin: '-45% 0px -50% 0px' }
);
document.querySelectorAll('header[id], section[id]').forEach((s) => spy.observe(s));

// ---------- modal ----------
const modal = $('#modal'), mBody = $('#m-body');
function openModal(html) {
  mBody.innerHTML = html;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
}
$('#m-close').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => e.target === modal && closeModal());
addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

document.addEventListener('click', (e) => {
  const big = e.target.closest('.m-gal img');
  if (big) return void ($('.m-main').src = big.dataset.full);
  const card = e.target.closest('.card');
  if (!card || !DATA) return;
  const i = +card.dataset.i;
  if (card.dataset.kind === 'p') {
    const x = DATA.projects[i];
    const gallery = [x.image, ...(x.gallery || [])].filter(Boolean);
    openModal(`
      ${gallery.length ? `<img class="m-img m-main" src="${esc(img(gallery[0], 1400))}" alt="">` : ''}
      ${gallery.length > 1 ? `<div class="m-gal">${gallery.map((g) => `<img src="${esc(img(g, 300))}" data-full="${esc(img(g, 1400))}" alt="">`).join('')}</div>` : ''}
      <h3>${esc(x.title)}</h3>
      <div class="chips">${(x.tech || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <p class="desc">${esc(x.description)}</p>
      <div class="hero-actions">
        ${x.demo ? `<a class="btn btn-primary" href="${esc(x.demo)}" target="_blank" rel="noopener">Live demo ↗</a>` : ''}
        ${x.github ? `<a class="btn btn-ghost" href="${esc(x.github)}" target="_blank" rel="noopener">Source code ↗</a>` : ''}
      </div>`);
  } else {
    const x = DATA.certificates[i];
    openModal(`
      ${x.image ? `<img class="m-img" src="${esc(img(x.image, 1400))}" alt="${esc(x.title)}">` : ''}
      <h3>${esc(x.title)}</h3>
      <p class="desc">${esc([x.issuer, x.date].filter(Boolean).join(' · '))}</p>
      ${x.link ? `<div class="hero-actions"><a class="btn btn-primary" href="${esc(x.link)}" target="_blank" rel="noopener">Verify ↗ <small>${esc(host(x.link))}</small></a></div>` : ''}`);
  }
});

initSparkParticles();
initCardTilt();
load().catch((e) => {
  $('#h-name').textContent = 'Portfolio';
  $('#h-tag').textContent = 'Could not load content. Please refresh.';
  console.error(e);
});
