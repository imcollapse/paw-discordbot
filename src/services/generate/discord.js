// Developed by Cosmin
// paw — fake Discord screenshots, drawn with canvas (no AI, no template files).
// message · reply · convo · quote · profile · minimized profile · apply · account switcher
// Every renderer takes plain data (names, colours, image URLs) and returns a PNG buffer.

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

const FONT_DIR = path.join(__dirname, '..', '..', 'media', 'fonts', 'generate');
const BADGE_DIR = path.join(__dirname, '..', '..', 'media', 'badges');

let fontsReady = false;
function fonts() {
  if (fontsReady) return;
  for (const [file, family] of [['Inter-Regular.otf', 'GenSans'], ['Inter-Medium.otf', 'GenSans Medium'], ['Inter-SemiBold.otf', 'GenSans SemiBold'], ['Inter-Bold.otf', 'GenSans Bold']]) {
    try { GlobalFonts.registerFromPath(path.join(FONT_DIR, file), family); } catch (e) { console.error('[generate] font', file, e.message); }
  }
  fontsReady = true;
}
const FAMILY = { 400: 'GenSans', 500: 'GenSans Medium', 600: 'GenSans SemiBold', 700: 'GenSans Bold' };
const font = (weight, size) => `${size}px "${FAMILY[weight]}", "Noto Sans", sans-serif`;

const C = {
  bg: '#313338', card: '#111214', panel: '#1E1F22', panel2: '#2B2D31', divider: '#3F4147',
  text: '#DBDEE1', white: '#F2F3F5', muted: '#949BA4', link: '#00A8FC', brand: '#5865F2',
  mentionBg: 'rgba(88,101,242,0.3)', mentionText: '#C9CDFB', codeBg: '#1E1F22',
  online: '#23A55A', idle: '#F0B232', dnd: '#F23F43', offline: '#80848E',
};
const STATUS = { online: C.online, idle: C.idle, dnd: C.dnd, offline: C.offline, invisible: C.offline };
const INITIAL_COLORS = ['#5865F2', '#EB459E', '#F0B232', '#23A55A', '#F23F43', '#00A8FC', '#9B59B6'];

// badges

// the variable a member types → file in media/badges, plus a short description for the list
const BADGES = {
  nitro:             ['nitro.png', 'Nitro'],
  'nitro-basic':     ['nitro_basic.png', 'Nitro Basic'],
  staff:             ['staff.png', 'Discord Staff'],
  partner:           ['partner.png', 'Partnered Server Owner'],
  moderator:         ['certified_moderator.png', 'Certified Moderator'],
  events:            ['hypesquad.png', 'HypeSquad Events'],
  bravery:           ['hypesquad_bravery.png', 'HypeSquad Bravery'],
  brilliance:        ['hypesquad_brilliance.png', 'HypeSquad Brilliance'],
  balance:           ['hypesquad_balance.png', 'HypeSquad Balance'],
  bughunter:         ['bughunter1.png', 'Bug Hunter'],
  'bughunter-gold':  ['bughunter2.png', 'Bug Hunter (gold)'],
  'early-supporter': ['early_supporter.png', 'Early Supporter'],
  developer:         ['verified_developer.png', 'Early Verified Bot Developer'],
  'active-developer': ['active_developer.png', 'Active Developer'],
  'old-username':    ['originally_known_as.png', 'Originally known as'],
  quest:             ['quest.png', 'Quest Completer'],
};
const BADGE_ALIASES = {
  boost: null, nitrobasic: 'nitro-basic', basic: 'nitro-basic', employee: 'staff', hypesquad: 'events', event: 'events',
  bug: 'bughunter', bughunter1: 'bughunter', bughunter2: 'bughunter-gold', gold: 'bughunter-gold', supporter: 'early-supporter', early: 'early-supporter',
  verified: 'developer', dev: 'developer', activedev: 'active-developer', 'active-dev': 'active-developer', mod: 'moderator', username: 'old-username', pomelo: 'old-username',
};

/** "nitro, staff, bravery" → { keys: ['nitro','staff','bravery'], unknown: [] } */
function parseBadges(input) {
  const keys = []; const unknown = [];
  for (const raw of String(input || '').toLowerCase().split(/[,\s]+/).filter(Boolean)) {
    const k = BADGES[raw] ? raw : BADGE_ALIASES[raw];
    if (k && BADGES[k]) { if (!keys.includes(k)) keys.push(k); } else unknown.push(raw);
  }
  return { keys: keys.slice(0, 8), unknown };
}

// small helpers

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const imageCache = new Map();
async function img(src) {
  if (!src) return null;
  try { return await withTimeout(loadImage(src), 8000); } catch { return null; }
}
async function badgeImage(key) {
  if (!imageCache.has(key)) imageCache.set(key, loadImage(path.join(BADGE_DIR, BADGES[key][0])).catch(() => null));
  return imageCache.get(key);
}

const hexOk = (v) => /^#?[0-9a-f]{6}$/i.test(String(v || '').trim());
const hex = (v, fallback) => (hexOk(v) ? `#${String(v).trim().replace('#', '')}` : fallback);

function shade(color, amount) {   // positive lightens, negative darkens
  const n = parseInt(color.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amount)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function clipCircle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip(); }
function pill(ctx, x, y, w, h, r, fill) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }

/** Avatar: the picture, or a coloured circle with the first letter when there is none. */
function drawAvatar(ctx, image, name, x, y, size) {
  ctx.save();
  clipCircle(ctx, x + size / 2, y + size / 2, size / 2);
  if (image) ctx.drawImage(image, x, y, size, size);
  else {
    const i = [...String(name || '?')].reduce((a, c) => a + c.codePointAt(0), 0) % INITIAL_COLORS.length;
    ctx.fillStyle = INITIAL_COLORS[i]; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#FFFFFF'; ctx.font = font(600, Math.round(size * 0.45)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText([...String(name || '?')][0]?.toUpperCase() ?? '?', x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
}

function statusDot(ctx, status, cx, cy, r, ring) {
  ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = STATUS[status] || C.online; ctx.fill();
  if (status === 'idle') { ctx.beginPath(); ctx.arc(cx - r * 0.4, cy - r * 0.4, r * 0.62, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill(); }
  if (status === 'dnd') { pill(ctx, cx - r * 0.6, cy - r * 0.18, r * 1.2, r * 0.36, r * 0.18, ring); }
  if (status === 'offline' || status === 'invisible') { ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill(); }
}

function fitText(ctx, text, maxWidth) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// rich text: **bold**, *italic*, `code`, @mention, #channel, links

function parseRuns(text) {
  const out = []; let last = 0; const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|@[\w.\-]+|#[\w\-]+|https?:\/\/\S+)/g; let m;
  const plain = (s) => { if (s) out.push({ t: s }); };
  while ((m = re.exec(text))) {
    plain(text.slice(last, m.index)); const s = m[0];
    if (s.startsWith('**')) out.push({ t: s.slice(2, -2), bold: true });
    else if (s.startsWith('*')) out.push({ t: s.slice(1, -1), italic: true });
    else if (s.startsWith('`')) out.push({ t: s.slice(1, -1), code: true });
    else if (s.startsWith('@') || s.startsWith('#')) out.push({ t: s, mention: true });
    else out.push({ t: s, link: true });
    last = m.index + s.length;
  }
  plain(text.slice(last));
  return out;
}

/** Break runs into lines that fit `maxWidth`. Each line is a list of { t, w, style }. */
function wrap(ctx, text, maxWidth, size) {
  const lines = [[]]; let x = 0;
  const push = (seg) => { lines[lines.length - 1].push(seg); x += seg.w; };
  for (const run of parseRuns(String(text))) {
    ctx.font = font(run.bold ? 700 : run.mention ? 500 : 400, size);
    const pad = run.mention || run.code ? 6 : 0;
    for (const part of run.t.split(/(\n)/)) {
      if (part === '\n') { lines.push([]); x = 0; continue; }
      for (const word of part.split(/(?<=\s)/)) {
        let w = ctx.measureText(word).width + pad;
        if (x + w > maxWidth && x > 0) { lines.push([]); x = 0; word.trimStart(); }
        if (w > maxWidth) {                              // one very long word: cut it
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width + pad > maxWidth) { push({ t: chunk, w: ctx.measureText(chunk).width + pad, run }); lines.push([]); x = 0; chunk = ''; }
            chunk += ch;
          }
          word = chunk; w = ctx.measureText(chunk).width + pad;
        }
        if (word) push({ t: word, w, run });
      }
    }
  }
  return lines;
}

function drawLines(ctx, lines, x, y, lineHeight, size, color = C.text) {
  lines.forEach((line, i) => {
    let cx = x; const base = y + i * lineHeight + lineHeight / 2;
    for (const seg of line) {
      const r = seg.run;
      ctx.font = r.italic ? `italic ${font(400, size)}` : font(r.bold ? 700 : r.mention ? 500 : 400, size);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      if (r.mention) { pill(ctx, cx, base - 11, seg.w - 2, 22, 4, C.mentionBg); ctx.fillStyle = C.mentionText; ctx.fillText(seg.t, cx + 3, base); }
      else if (r.code) { pill(ctx, cx, base - 11, seg.w - 2, 22, 4, C.codeBg); ctx.fillStyle = C.text; ctx.fillText(seg.t, cx + 3, base); }
      else { ctx.fillStyle = r.link ? C.link : color; ctx.fillText(seg.t, cx, base); }
      cx += seg.w;
    }
  });
}

// shared pieces

/** Server tag pill ("HOF" with an optional small icon). Returns its width. */
function measureTag(ctx, tag, icon, size) {
  ctx.font = font(600, size - 1);
  return Math.ceil(ctx.measureText(tag).width) + 12 + (icon ? size + 2 : 0);
}
function drawTag(ctx, tag, icon, x, cy, size) {
  const w = measureTag(ctx, tag, icon, size);
  pill(ctx, x, cy - size / 2 - 2, w, size + 4, 5, 'rgba(78,80,88,0.6)');
  let tx = x + 6;
  if (icon) { ctx.save(); ctx.beginPath(); ctx.roundRect(tx, cy - size / 2, size, size, 3); ctx.clip(); ctx.drawImage(icon, tx, cy - size / 2, size, size); ctx.restore(); tx += size + 2; }
  ctx.font = font(600, size - 1); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(tag, tx, cy + 1);
  return w;
}
function drawBadges(ctx, images, x, cy, size, gap = 3) {
  let cx = x;
  for (const b of images) { if (b) ctx.drawImage(b, cx, cy - size / 2, size, size); cx += size + gap; }
  return cx - x;
}
function finish(canvas) { return canvas.toBuffer('image/png'); }
function newCanvas(w, h, scale) {
  const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  return { canvas, ctx };
}
const probe = () => createCanvas(10, 10).getContext('2d');

async function loadSet(urls) {
  const out = {};
  await Promise.all(Object.entries(urls).map(async ([k, v]) => { out[k] = Array.isArray(v) ? await Promise.all(v.map(x => (typeof x === 'string' && BADGES[x] ? badgeImage(x) : img(x)))) : await img(v); }));
  return out;
}

// messages

const MW = 760;   // logical width of message screenshots
const TEXT_X = 72;

/**
 * One message group entry.
 * m = { name, color, avatar, badges[], tag, tagIcon, bot, time, text, image, edited, grouped, reply }
 * reply = { name, color, avatar, text }
 */
async function renderMessages(list, { scale = 2 } = {}) {
  fonts();
  const assets = await Promise.all(list.map(m => loadSet({ avatar: m.avatar, tagIcon: m.tagIcon, image: m.image, badges: m.badges || [], replyAvatar: m.reply?.avatar })));
  const p = probe();

  // layout
  let y = 14; const items = [];
  list.forEach((m, i) => {
    const grouped = m.grouped && i > 0;
    const top = y + (i === 0 ? 0 : grouped ? 2 : 14);
    let h = 0;
    if (m.reply) h += 24;
    const lines = wrap(p, m.text || '', MW - TEXT_X - 24, 16);
    const textH = (m.text ? lines.length : 0) * 22;
    const a = assets[i];
    let imgW = 0; let imgH = 0;
    if (a.image) { const k = Math.min(1, 400 / a.image.width, 300 / a.image.height); imgW = Math.round(a.image.width * k); imgH = Math.round(a.image.height * k); }
    const head = grouped ? 0 : 22;
    h += head + textH + (imgH ? imgH + 6 : 0);
    if (!grouped) h = Math.max(h, (m.reply ? 24 : 0) + 40);
    items.push({ m, a, lines, top, h, grouped, imgW, imgH });
    y = top + h;
  });
  const H = y + 14;
  const { canvas, ctx } = newCanvas(MW, H, scale);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, MW, H);

  for (const it of items) {
    const { m, a, lines, top, grouped } = it;
    let cy = top;
    if (m.reply) {
      const r = m.reply;
      ctx.strokeStyle = '#4E5058'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(36, cy + 22); ctx.lineTo(36, cy + 11 + 6); ctx.arcTo(36, cy + 11, 44, cy + 11, 6); ctx.lineTo(54, cy + 11); ctx.stroke();
      drawAvatar(ctx, a.replyAvatar, r.name, 58, cy + 3, 16);
      ctx.font = font(600, 14); ctx.fillStyle = hex(r.color, C.text); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const nameW = ctx.measureText(`@${r.name}`).width;
      ctx.fillText(`@${r.name}`, 80, cy + 11);
      ctx.font = font(400, 14); ctx.fillStyle = C.muted;
      ctx.fillText(fitText(ctx, r.text || '', MW - 80 - nameW - 40), 80 + nameW + 6, cy + 11);
      cy += 24;
    }
    if (!grouped) {
      drawAvatar(ctx, a.avatar, m.name, 16, cy + 2, 40);
      ctx.font = font(600, 16); ctx.fillStyle = hex(m.color, C.white); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(m.name, TEXT_X, cy + 11);
      let x = TEXT_X + ctx.measureText(m.name).width + 6;
      if (m.tag) x += drawTag(ctx, m.tag, a.tagIcon, x, cy + 11, 14) + 5;
      if (a.badges?.length) x += drawBadges(ctx, a.badges, x, cy + 11, 16, 4) + 3;
      if (m.bot) { ctx.font = font(600, 10); const w = ctx.measureText('APP').width + 14; pill(ctx, x, cy + 3, w, 16, 4, C.brand); ctx.fillStyle = '#FFF'; ctx.textBaseline = 'middle'; ctx.fillText('APP', x + 7, cy + 12); x += w + 6; }
      ctx.font = font(400, 12); ctx.fillStyle = C.muted; ctx.textBaseline = 'middle'; ctx.fillText(m.time || '', x + 2, cy + 12);
      cy += 22;
    }
    if (m.text) { drawLines(ctx, lines, TEXT_X, cy, 22, 16); cy += lines.length * 22; }
    if (m.edited && m.text) {
      const last = lines[lines.length - 1]; const lw = last.reduce((s, seg) => s + seg.w, 0);
      ctx.font = font(400, 10); ctx.fillStyle = C.muted; ctx.textBaseline = 'middle'; ctx.fillText('(edited)', TEXT_X + lw + 4, cy - 11);
    }
    if (it.imgH) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(TEXT_X, cy + 4, it.imgW, it.imgH, 8); ctx.clip(); ctx.drawImage(a.image, TEXT_X, cy + 4, it.imgW, it.imgH); ctx.restore();
    }
  }
  return finish(canvas);
}

// quote card

async function renderQuote(q, { scale = 2 } = {}) {
  fonts();
  const a = await loadSet({ avatar: q.avatar, tagIcon: q.tagIcon });
  const W = 680; const p = probe();
  const lines = wrap(p, q.text, W - 150, 24);
  const H = Math.max(200, 100 + lines.length * 34 + 70);
  const { canvas, ctx } = newCanvas(W, H, scale);
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1E1F22'); g.addColorStop(1, '#2B2D31');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  drawAvatar(ctx, a.avatar, q.name, 36, 40, 72);
  ctx.font = font(700, 64); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('“', 126, 24);
  drawLines(ctx, lines, 126, 70, 34, 24, C.white);
  const y = 70 + lines.length * 34 + 22;
  ctx.font = font(600, 17); ctx.fillStyle = hex(q.color, C.white); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(`- ${q.name}`, 126, y);
  if (q.tag) drawTag(ctx, q.tag, a.tagIcon, 126 + ctx.measureText(`- ${q.name}`).width + 8, y, 14);
  return finish(canvas);
}

// profiles

function bannerFill(ctx, banner, color, x, y, w, h) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (banner) { const k = Math.max(w / banner.width, h / banner.height); ctx.drawImage(banner, x + (w - banner.width * k) / 2, y + (h - banner.height * k) / 2, banner.width * k, banner.height * k); }
  else { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}

function section(ctx, title, x, y) { ctx.font = font(700, 12); ctx.fillStyle = C.white; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(title.toUpperCase(), x, y); }

async function renderProfile(d, { compact = false, scale = 3 } = {}) {
  fonts();
  const a = await loadSet({ avatar: d.avatar, banner: d.banner, tagIcon: d.tagIcon, badges: d.badges || [] });
  const W = compact ? 300 : 340; const p = probe();
  const bannerH = compact ? 62 : 110; const av = compact ? 64 : 80; const pad = 16;
  const color = hex(d.bannerColor, '#5865F2');
  const bioLines = !compact && d.bio ? wrap(p, d.bio, W - pad * 2 - 24, 14) : [];
  const roles = !compact && d.roles?.length ? d.roles : [];

  // measure the roles block (pills wrap onto rows)
  p.font = font(500, 12); const roleRows = [[]]; let rx = 0;
  for (const r of roles) { const w = p.measureText(r.name).width + 28; if (rx + w > W - pad * 2 - 24) { roleRows.push([]); rx = 0; } roleRows[roleRows.length - 1].push({ ...r, w }); rx += w + 6; }

  let H = bannerH + av / 2 + 12 + 58;                       // header + name block
  if (d.customStatus) H += 30;
  if (!compact) {
    const blocks = [];
    if (bioLines.length) blocks.push(22 + bioLines.length * 20);
    if (d.since) blocks.push(22 + 20);
    if (roles.length) blocks.push(22 + roleRows.length * 28);
    H += 16 + blocks.reduce((s, b) => s + b + 14, 0) + 14;
  } else H += 14;

  const { canvas, ctx } = newCanvas(W, H, scale);
  ctx.fillStyle = C.card; ctx.fillRect(0, 0, W, H);
  bannerFill(ctx, a.banner, color, 0, 0, W, bannerH);

  // avatar + status
  const ax = pad; const ay = bannerH - av / 2;
  ctx.beginPath(); ctx.arc(ax + av / 2, ay + av / 2, av / 2 + 6, 0, Math.PI * 2); ctx.fillStyle = C.card; ctx.fill();
  drawAvatar(ctx, a.avatar, d.name, ax, ay, av);
  statusDot(ctx, d.status || 'online', ax + av - 8, ay + av - 8, compact ? 8 : 10, C.card);

  // badges (top right of the name block, in a rounded tray)
  const badgeImgs = (a.badges || []).filter(Boolean);
  if (badgeImgs.length) {
    const bw = badgeImgs.length * 22 + 8;
    pill(ctx, W - pad - bw, bannerH + 10, bw, 30, 8, C.panel);
    drawBadges(ctx, badgeImgs, W - pad - bw + 6, bannerH + 25, 20, 2);
  }

  // card body
  let y = ay + av + 10;
  const bodyX = pad; const bodyW = W - pad * 2;
  const bodyH = H - y - pad;
  pill(ctx, bodyX - 4, y - 4, bodyW + 8, bodyH + 8, 8, C.panel);
  y += 8; const ix = bodyX + 10;

  ctx.font = font(700, compact ? 18 : 20); ctx.fillStyle = C.white; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, d.name, bodyW - 20), ix, y); y += compact ? 24 : 26;
  ctx.font = font(400, 14); ctx.fillStyle = C.text; ctx.fillText(d.username ? `${d.username}${d.pronouns ? `  •  ${d.pronouns}` : ''}` : (d.pronouns || ''), ix, y);
  if (d.tag) {
    const tx = ix + ctx.measureText(d.username || '').width + (d.username ? (d.pronouns ? ctx.measureText(`  •  ${d.pronouns}`).width + 8 : 8) : 0);
    if (tx + 40 < W - pad - 10) drawTag(ctx, d.tag, a.tagIcon, tx, y + 8, 13);
  }
  y += 26;
  if (d.customStatus) { ctx.font = font(400, 14); ctx.fillStyle = C.text; ctx.fillText(fitText(ctx, d.customStatus, bodyW - 20), ix, y); y += 24; }

  if (!compact) {
    y += 8; ctx.fillStyle = C.divider; ctx.fillRect(ix, y, bodyW - 20, 1); y += 12;
    if (bioLines.length) { section(ctx, 'About Me', ix, y); y += 20; drawLines(ctx, bioLines, ix, y, 20, 14); y += bioLines.length * 20 + 14; }
    if (d.since) { section(ctx, 'Member Since', ix, y); y += 20; ctx.font = font(400, 14); ctx.fillStyle = C.text; ctx.textBaseline = 'top'; ctx.fillText(d.since, ix, y); y += 20 + 14; }
    if (roles.length) {
      section(ctx, roles.length > 1 ? 'Roles' : 'Role', ix, y); y += 22;
      for (const row of roleRows) {
        let x = ix;
        for (const r of row) {
          pill(ctx, x, y, r.w, 24, 6, C.panel2);
          ctx.beginPath(); ctx.arc(x + 12, y + 12, 5, 0, Math.PI * 2); ctx.fillStyle = hex(r.color, '#99AAB5'); ctx.fill();
          ctx.font = font(500, 12); ctx.fillStyle = C.text; ctx.textBaseline = 'middle'; ctx.fillText(r.name, x + 22, y + 13);
          x += r.w + 6;
        }
        y += 28;
      }
    }
  }
  return finish(canvas);
}

// apply to join

async function renderApply(d, { scale = 2 } = {}) {
  fonts();
  const a = await loadSet({ icon: d.icon });
  const W = 480; const p = probe(); const pad = 24;
  const desc = d.description ? wrap(p, d.description, W - pad * 2, 14) : [];
  const qs = d.questions.slice(0, 5).map((q, i) => ({ q, a: d.answers?.[i] || '', ql: wrap(p, q, W - pad * 2, 14), al: wrap(p, d.answers?.[i] || '', W - pad * 2 - 24, 14) }));
  let H = 40 + 72 + 24 + 30 + (desc.length ? desc.length * 20 + 12 : 0) + 18;
  for (const q of qs) H += q.ql.length * 20 + 6 + Math.max(44, q.al.length * 20 + 24) + 18;
  H += 56 + 20;

  const { canvas, ctx } = newCanvas(W, H, scale);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // icon + title
  ctx.save(); ctx.beginPath(); ctx.roundRect(pad, 32, 72, 72, 20); ctx.clip();
  if (a.icon) ctx.drawImage(a.icon, pad, 32, 72, 72); else { ctx.fillStyle = C.brand; ctx.fillRect(pad, 32, 72, 72); ctx.font = font(700, 30); ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText([...d.server][0]?.toUpperCase() ?? '?', pad + 36, 69); }
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = font(700, 22); ctx.fillStyle = C.white; ctx.fillText(fitText(ctx, d.server, W - pad * 2 - 90), pad + 88, 46);
  ctx.font = font(400, 13); ctx.fillStyle = C.muted; ctx.beginPath(); ctx.arc(pad + 94, 84, 4, 0, Math.PI * 2); ctx.fillStyle = C.online; ctx.fill();
  ctx.fillStyle = C.muted; ctx.fillText(`${d.online || '1,204'} Online`, pad + 104, 77);
  const ow = ctx.measureText(`${d.online || '1,204'} Online`).width;
  ctx.beginPath(); ctx.arc(pad + 104 + ow + 14, 84, 4, 0, Math.PI * 2); ctx.fillStyle = C.offline; ctx.fill();
  ctx.fillStyle = C.muted; ctx.fillText(`${d.members || '5,730'} Members`, pad + 104 + ow + 24, 77);

  let y = 130;
  ctx.font = font(700, 18); ctx.fillStyle = C.white; ctx.fillText('Apply to Join', pad, y); y += 30;
  if (desc.length) { drawLines(ctx, desc, pad, y, 20, 14, C.muted); y += desc.length * 20 + 12; }
  ctx.fillStyle = C.divider; ctx.fillRect(pad, y, W - pad * 2, 1); y += 18;
  for (const q of qs) {
    drawLines(ctx, q.ql, pad, y, 20, 14, C.white); y += q.ql.length * 20 + 6;
    const bh = Math.max(44, q.al.length * 20 + 24);
    pill(ctx, pad, y, W - pad * 2, bh, 8, C.panel); ctx.strokeStyle = C.divider; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(pad + 0.5, y + 0.5, W - pad * 2 - 1, bh - 1, 8); ctx.stroke();
    if (q.al.length) drawLines(ctx, q.al, pad + 12, y + 12, 20, 14); else { ctx.font = font(400, 14); ctx.fillStyle = C.muted; ctx.textBaseline = 'middle'; ctx.fillText('Type your answer here', pad + 12, y + bh / 2); ctx.textBaseline = 'top'; }
    y += bh + 18;
  }
  pill(ctx, pad, y + 4, W - pad * 2, 44, 8, C.brand);
  ctx.font = font(600, 15); ctx.fillStyle = '#FFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Submit Application', W / 2, y + 26);
  return finish(canvas);
}

// account switcher

async function renderSwitcher(accounts, { scale = 3 } = {}) {
  fonts();
  const list = accounts.slice(0, 6);
  const assets = await Promise.all(list.map(x => img(x.avatar)));
  const W = 320; const rowH = 58;
  const H = 16 + 28 + list.length * rowH + 12 + 2 * 46 + 12;
  const { canvas, ctx } = newCanvas(W, H, scale);
  ctx.fillStyle = C.card; ctx.fillRect(0, 0, W, H);
  ctx.font = font(700, 12); ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('SWITCH ACCOUNTS', 16, 28);
  let y = 44;
  list.forEach((acc, i) => {
    if (i === 0) pill(ctx, 8, y, W - 16, rowH - 4, 8, C.panel2);
    drawAvatar(ctx, assets[i], acc.name, 18, y + 8, 38);
    statusDot(ctx, acc.status || 'online', 18 + 32, y + 8 + 32, 6, i === 0 ? C.panel2 : C.card);
    ctx.font = font(600, 15); ctx.fillStyle = C.white; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fitText(ctx, acc.name, 180), 68, y + 18);
    ctx.font = font(400, 12); ctx.fillStyle = C.muted; ctx.fillText(fitText(ctx, acc.username || acc.name.toLowerCase().replace(/\s+/g, ''), 180), 68, y + 36);
    if (i === 0) { ctx.beginPath(); ctx.arc(W - 30, y + 26, 10, 0, Math.PI * 2); ctx.fillStyle = C.brand; ctx.fill(); ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(W - 35, y + 26); ctx.lineTo(W - 31, y + 30); ctx.lineTo(W - 24, y + 22); ctx.stroke(); }
    y += rowH;
  });
  y += 4; ctx.fillStyle = C.divider; ctx.fillRect(16, y, W - 32, 1); y += 8;
  for (const label of ['Add Account', 'Manage Accounts']) {
    ctx.font = font(500, 14); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, 56, y + 23);
    ctx.strokeStyle = C.muted; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (label === 'Add Account') { ctx.beginPath(); ctx.moveTo(26, y + 23); ctx.lineTo(38, y + 23); ctx.moveTo(32, y + 17); ctx.lineTo(32, y + 29); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(32, y + 23, 7, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(32, y + 23, 2.5, 0, Math.PI * 2); ctx.stroke(); }
    y += 46;
  }
  return finish(canvas);
}

module.exports = { BADGES, parseBadges, hexOk, renderMessages, renderQuote, renderProfile, renderApply, renderSwitcher };
