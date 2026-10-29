(() => {
  const KEY = 'portfolio_admin_token';
  const store = {
    get: () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } },
    set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} },
  };
  let token = store.get();
  let tab = 'profile';
  let DATA = null;
  let STATUS = null;
  const app = document.getElementById('app');

  // ---------- helpers ----------
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return e;
  }
  let toastTimer;
  function toast(msg, kind = 'ok') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ''), 2600);
  }
  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.json);
    }
    const res = await fetch(path, { ...opts, headers });
    let body = {};
    try { body = await res.json(); } catch {}
    if (res.status === 401 && path !== '/api/login') { logout(); throw new Error('Session expired. Log in again.'); }
    if (!res.ok) throw new Error(body.error || 'Something went wrong.');
    return body;
  }
  function logout() {
    token = '';
    store.set('');
    renderLogin();
  }

  // ---------- image compression (phone photos are huge) ----------
  async function compress(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const limit = file.type === 'image/png' ? 2.5 * 1024 * 1024 : 900 * 1024;
    if (file.size < limit) return file;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const s = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * s);
      c.height = Math.round(bmp.height * s);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
      if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {}
    return file;
  }
  async function upload(file) {
    const f = await compress(file);
    const fd = new FormData();
    fd.append('file', f, f.name);
    return (await api('/api/upload', { method: 'POST', body: fd })).url;
  }

  // ---------- schemas ----------
  const SCHEMA = {
    profile: [
      { k: 'name', l: 'Your name', t: 'text', req: true },
      { k: 'role', l: 'Main title (e.g. Full-Stack Developer)', t: 'text' },
      { k: 'roles', l: 'Typing animation lines (one per line)', t: 'lines' },
      { k: 'tagline', l: 'Tagline', t: 'textarea' },
      { k: 'photo', l: 'Profile photo', t: 'image' },
      { k: 'about', l: 'About me', t: 'textarea', rows: 8 },
      { k: 'resume', l: 'Résumé (PDF)', t: 'file' },
      { k: 'email', l: 'Email', t: 'text' },
      { k: 'location', l: 'Location', t: 'text' },
      { k: 'github', l: 'GitHub URL', t: 'text' },
      { k: 'linkedin', l: 'LinkedIn URL', t: 'text' },
      { k: 'instagram', l: 'Instagram URL', t: 'text' },
    ],
    projects: [
      { k: 'title', l: 'Project title', t: 'text', req: true },
      { k: 'image', l: 'Cover image', t: 'image' },
      { k: 'description', l: 'Description', t: 'textarea', rows: 6 },
      { k: 'tech', l: 'Tech used (comma separated)', t: 'tags' },
      { k: 'demo', l: 'Live demo URL', t: 'text' },
      { k: 'github', l: 'GitHub URL', t: 'text' },
      { k: 'gallery', l: 'More screenshots', t: 'images' },
      { k: 'featured', l: 'Featured project', t: 'bool' },
    ],
    certificates: [
      { k: 'title', l: 'Certificate title', t: 'text', req: true },
      { k: 'issuer', l: 'Issued by', t: 'text' },
      { k: 'date', l: 'Date (e.g. Aug 2026)', t: 'text' },
      { k: 'image', l: 'Certificate image', t: 'image' },
      { k: 'link', l: 'Verify link', t: 'text' },
    ],
    skills: [
      { k: 'name', l: 'Skill name', t: 'text', req: true },
      { k: 'category', l: 'Category (Frontend, Backend, Tools…)', t: 'text' },
      { k: 'level', l: 'Level (0–100)', t: 'number' },
    ],
  };
  const LABEL = { profile: 'Profile', projects: 'Projects', certificates: 'Certificates', skills: 'Skills' };
  const ICON = { profile: '👤', projects: '🚀', certificates: '🏅', skills: '⚡' };
  const NOUN = { projects: 'project', certificates: 'certificate', skills: 'skill' };

  // ---------- form builder ----------
  function buildForm(schema, initial) {
    const values = {};
    const getters = [];
    const nodes = schema.map((f) => {
      const init = initial?.[f.k];
      const id = 'f_' + f.k;
      const wrap = (control, label = true) => el('div', { class: 'field' }, label && el('label', { for: id }, f.l), control);

      switch (f.t) {
        case 'textarea': {
          const i = el('textarea', { id, rows: f.rows || 4 }, init || '');
          getters.push(() => (values[f.k] = i.value));
          return wrap(i);
        }
        case 'lines': {
          const i = el('textarea', { id, rows: 4 }, (init || []).join('\n'));
          getters.push(() => (values[f.k] = i.value.split('\n').map((s) => s.trim()).filter(Boolean)));
          return wrap(i);
        }
        case 'tags': {
          const i = el('input', { id, type: 'text', value: (init || []).join(', ') });
          getters.push(() => (values[f.k] = i.value.split(',').map((s) => s.trim()).filter(Boolean)));
          return wrap(i);
        }
        case 'number': {
          const i = el('input', { id, type: 'number', inputmode: 'numeric', min: 0, max: 100, value: init ?? 80 });
          getters.push(() => (values[f.k] = Number(i.value)));
          return wrap(i);
        }
        case 'bool': {
          const i = el('input', { id, type: 'checkbox', checked: !!init });
          getters.push(() => (values[f.k] = i.checked));
          return el('label', { class: 'check', for: id }, i, f.l);
        }
        case 'image':
        case 'file': {
          let cur = init || '';
          const isImg = f.t === 'image';
          const holder = el('div', { class: 'imgfield' });
          const input = el('input', { type: 'file', accept: isImg ? 'image/*' : 'application/pdf', hidden: true });
          const status = el('span', { class: 'filechip' });
          const draw = () => {
            holder.replaceChildren();
            if (cur) holder.append(isImg ? el('img', { class: 'preview', src: cur, alt: '' }) : el('span', { class: 'filechip' }, '✔ ' + cur.split('/').pop()));
            holder.append(
              el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
                el('button', { type: 'button', class: 'btn', onclick: () => input.click() }, cur ? 'Replace' : isImg ? '📷 Choose / take photo' : '📄 Choose PDF'),
                cur && el('button', { type: 'button', class: 'btn danger', onclick: () => { cur = ''; draw(); } }, 'Remove')),
              status
            );
          };
          input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;
            status.textContent = 'Uploading…';
            try {
              cur = await upload(file);
              status.textContent = '';
              draw();
            } catch (e) {
              status.textContent = '';
              toast(e.message, 'err');
            }
            input.value = '';
          });
          draw();
          getters.push(() => (values[f.k] = cur));
          return el('div', { class: 'field' }, el('label', null, f.l), holder, input);
        }
        case 'images': {
          let list = [...(init || [])];
          const grid = el('div', { class: 'thumbs' });
          const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
          const status = el('span', { class: 'filechip' });
          const draw = () => {
            grid.replaceChildren(
              ...list.map((u, idx) =>
                el('div', null, el('img', { src: u, alt: '' }), el('button', { type: 'button', 'aria-label': 'Remove', onclick: () => { list.splice(idx, 1); draw(); } }, '×'))
              )
            );
          };
          input.addEventListener('change', async () => {
            const files = [...input.files];
            for (let i = 0; i < files.length; i++) {
              status.textContent = `Uploading ${i + 1}/${files.length}…`;
              try { list.push(await upload(files[i])); draw(); } catch (e) { toast(e.message, 'err'); }
            }
            status.textContent = '';
            input.value = '';
          });
          draw();
          getters.push(() => (values[f.k] = list));
          return el('div', { class: 'field' }, el('label', null, f.l), grid,
            el('button', { type: 'button', class: 'btn', onclick: () => input.click() }, '＋ Add photos'), status, input);
        }
        default: {
          const i = el('input', { id, type: 'text', value: init || '', autocomplete: 'off', autocapitalize: f.k === 'name' || f.k === 'title' ? 'words' : 'none' });
          getters.push(() => (values[f.k] = i.value));
          return wrap(i);
        }
      }
    });
    return { nodes, read: () => (getters.forEach((g) => g()), { ...values }) };
  }

  // ---------- views ----------
  function renderLogin() {
    const pw = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', autofocus: true });
    const btn = el('button', { class: 'btn primary', type: 'submit' }, 'Log in');
    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true;
        try {
          const r = await api('/api/login', { method: 'POST', json: { password: pw.value } });
          token = r.token;
          store.set(token);
          start();
        } catch (err) {
          toast(err.message, 'err');
          btn.disabled = false;
        }
      },
    }, el('h1', null, 'Portfolio admin'), el('p', null, 'Only you can edit your site.'), el('div', { class: 'field' }, pw), btn);
    app.replaceChildren(el('div', { class: 'login' }, form));
  }

  async function start() {
    try {
      [DATA, STATUS] = await Promise.all([api('/api/portfolio'), api('/api/status')]);
      renderMain();
    } catch (e) {
      if (token) toast(e.message, 'err');
    }
  }

  function renderMain() {
    const warn =
      STATUS && (STATUS.db === 'json' || STATUS.media === 'local') && !/^(localhost|127\.|192\.168\.)/.test(location.hostname)
        ? el('div', { class: 'banner' }, '⚠ Your host is using temporary storage (', STATUS.db === 'json' ? 'no MySQL' : '', STATUS.db === 'json' && STATUS.media === 'local' ? ' + ' : '', STATUS.media === 'local' ? 'no Cloudinary' : '', '). Changes may be wiped on the next deploy. Add MYSQL_URL and CLOUDINARY_URL in your host settings.')
        : null;

    const body = el('div', { class: 'wrap' }, warn);
    if (tab === 'profile') body.append(profileView());
    else body.append(listView(tab));

    app.replaceChildren(
      el('div', { class: 'top' }, el('h1', null, '⚙ Admin'), el('a', { class: 'btn small', href: '/', target: '_blank', rel: 'noopener' }, 'View site ↗'), el('button', { class: 'btn small', onclick: logout }, 'Log out')),
      body,
      el('nav', { class: 'tabs' }, Object.keys(LABEL).map((k) => el('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; renderMain(); scrollTo(0, 0); } }, el('b', null, ICON[k]), LABEL[k])))
    );
  }

  function profileView() {
    const { nodes, read } = buildForm(SCHEMA.profile, DATA.profile);
    const save = el('button', { class: 'btn primary', type: 'submit' }, 'Save changes');
    return el('form', {
      class: 'f',
      onsubmit: async (e) => {
        e.preventDefault();
        save.disabled = true;
        try {
          DATA.profile = await api('/api/profile', { method: 'PUT', json: read() });
          toast('Saved ✓');
          renderMain();
        } catch (err) { toast(err.message, 'err'); save.disabled = false; }
      },
    }, el('div', { class: 'row-head' }, el('h2', null, 'Profile')), nodes, el('div', { class: 'bar' }, save));
  }

  const titleOf = (col, x) => (col === 'skills' ? x.name : x.title);
  const subOf = (col, x) =>
    col === 'projects' ? (x.tech || []).join(', ') || x.description
    : col === 'certificates' ? [x.issuer, x.date].filter(Boolean).join(' · ')
    : `${x.category} · ${x.level}%`;

  function listView(col) {
    const items = DATA[col];
    const move = async (i, d) => {
      const j = i + d;
      if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      renderMain();
      try { await api(`/api/${col}/reorder`, { method: 'PUT', json: { ids: items.map((x) => x.id) } }); } catch (e) { toast(e.message, 'err'); }
    };
    const del = async (x) => {
      if (!confirm(`Delete "${titleOf(col, x)}"?`)) return;
      try {
        await api(`/api/${col}/${x.id}`, { method: 'DELETE' });
        DATA[col] = items.filter((y) => y.id !== x.id);
        toast('Deleted');
        renderMain();
      } catch (e) { toast(e.message, 'err'); }
    };
    return el('div', null,
      el('div', { class: 'row-head' }, el('h2', null, LABEL[col]), el('button', { class: 'btn primary', onclick: () => openForm(col, null) }, '＋ Add')),
      col === 'skills' ? null : el('p', { class: 'hint' }, 'Tap an item to edit. Use ↑ ↓ to change the order on your site.'),
      items.length
        ? items.map((x, i) =>
            el('div', { class: 'item' },
              el('div', { class: 'th', onclick: () => openForm(col, x) }, x.image ? el('img', { src: x.image, alt: '' }) : (titleOf(col, x) || '?').slice(0, 1)),
              el('div', { class: 'tx', onclick: () => openForm(col, x) }, el('b', null, titleOf(col, x)), el('small', null, subOf(col, x))),
              el('div', { class: 'act' },
                el('button', { class: 'btn small', 'aria-label': 'Move up', onclick: () => move(i, -1) }, '↑'),
                el('button', { class: 'btn small', 'aria-label': 'Move down', onclick: () => move(i, 1) }, '↓'),
                el('button', { class: 'btn small', 'aria-label': 'Edit', onclick: () => openForm(col, x) }, '✎'),
                el('button', { class: 'btn small danger', 'aria-label': 'Delete', onclick: () => del(x) }, '🗑'))))
        : el('div', { class: 'empty' }, `No ${LABEL[col].toLowerCase()} yet. Tap “＋ Add” to create your first one.`)
    );
  }

  function openForm(col, item) {
    const { nodes, read } = buildForm(SCHEMA[col], item);
    const save = el('button', { class: 'btn primary', type: 'submit' }, item ? 'Save' : 'Add');
    const close = () => sheet.remove();
    const form = el('form', {
      class: 'f',
      onsubmit: async (e) => {
        e.preventDefault();
        save.disabled = true;
        try {
          const data = read();
          if (item) {
            const saved = await api(`/api/${col}/${item.id}`, { method: 'PUT', json: data });
            DATA[col] = DATA[col].map((y) => (y.id === item.id ? saved : y));
          } else {
            DATA[col] = [await api(`/api/${col}`, { method: 'POST', json: data }), ...DATA[col]];
          }
          toast('Saved ✓');
          close();
          renderMain();
        } catch (err) { toast(err.message, 'err'); save.disabled = false; }
      },
    }, nodes, el('div', { class: 'bar' }, el('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'), save));
    const sheet = el('div', { class: 'sheet' },
      el('div', { class: 'top' }, el('h1', null, (item ? 'Edit ' : 'New ') + NOUN[col])),
      el('div', { class: 'wrap' }, form));
    document.body.append(sheet);
  }

  // ---------- boot ----------
  if (token) start(); else renderLogin();
})();
