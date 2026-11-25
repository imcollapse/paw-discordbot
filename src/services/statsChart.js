// Developed by Cosmin
// paw · server + member analytics cards.
// Dark rounded panels, Outfit type, cream numbers on black chips, a smooth line chart and a
// "Powered by" footer with the bot's avatar. Everything is drawn on a 1200-wide grid and scaled down.

const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '..', 'media', 'fonts', 'cards');
let fontsReady = false;
function ensureFonts() {
    if (fontsReady) return;
    fontsReady = true;
    for (const [file, name] of [['Outfit-Regular.ttf', 'Paw Sans'], ['Outfit-Bold.ttf', 'Paw Sans Bold']]) {
        try { GlobalFonts.registerFromPath(path.join(FONT_DIR, file), name); }
        catch (err) { console.error(`[stats] font ${file} failed:`, err.message); }
    }
}
const REG = '"Paw Sans", sans-serif';
const BOLD = '"Paw Sans Bold", "Paw Sans", sans-serif';

const COLORS = {
    page: '#0b0b0c', panel: '#121214', edge: '#202023', chip: '#050505', chipEdge: '#25252a',
    text: '#f4f4f5', soft: '#8b8b92', faint: '#5f5f66', number: '#e9e2bb',
    messages: '#3b82f6', reactions: '#f59e0b', voice: '#a855f7', joins: '#34d399', leaves: '#fb7185',
};

const W = 1200, M = 22, GAP = 14, SCALE = 0.75;

/* ---------- formatting ---------- */

function formatNumber(n) {
    n = Number(n) || 0;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`.replace('.0k', 'k');
    return String(n);
}
const formatHours = (seconds) => (seconds / 3600).toFixed(2);
function formatDuration(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
    if (h >= 100) return `${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
}
const perDay = (total, days) => Math.round((total / Math.max(days, 1)) * 10) / 10;
const shortDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/* ---------- drawing bits ---------- */

function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function panel(ctx, x, y, w, h, r = 22) {
    rr(ctx, x, y, w, h, r); ctx.fillStyle = COLORS.panel; ctx.fill();
    ctx.strokeStyle = COLORS.edge; ctx.lineWidth = 1.5; ctx.stroke();
}
function chipBox(ctx, x, y, w, h, r = 14) {
    rr(ctx, x, y, w, h, r); ctx.fillStyle = COLORS.chip; ctx.fill();
    ctx.strokeStyle = COLORS.chipEdge; ctx.lineWidth = 1.5; ctx.stroke();
}

function T(ctx, str, x, y, { size = 20, bold = false, italic = false, color = COLORS.text, align = 'left', maxWidth, caps = false } = {}) {
    str = String(str ?? '');
    if (caps) str = str.toUpperCase();
    try { ctx.letterSpacing = caps ? '1.4px' : '0px'; } catch { /* older builds */ }
    let s = size;
    const set = () => { ctx.font = `${italic ? 'italic ' : ''}${s}px ${bold ? BOLD : REG}`; };
    set();
    if (maxWidth) while (ctx.measureText(str).width > maxWidth && s > 10) { s -= 1; set(); }
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
    return ctx.measureText(str).width;
}
const measure = (ctx, str, size, bold) => { ctx.font = `${size}px ${bold ? BOLD : REG}`; return ctx.measureText(String(str)).width; };

async function image(url) { if (!url) return null; try { return await loadImage(url); } catch { return null; } }
function picture(ctx, img, x, y, d, r, fallback) {
    ctx.save(); rr(ctx, x, y, d, d, r); ctx.clip();
    if (img) ctx.drawImage(img, x, y, d, d);
    else { ctx.fillStyle = '#1c1c20'; ctx.fillRect(x, y, d, d); T(ctx, String(fallback || '?').slice(0, 1).toUpperCase(), x + d / 2, y + d / 2 + d * 0.17, { size: d * 0.5, bold: true, color: COLORS.soft, align: 'center' }); }
    ctx.restore();
}

/* tiny line icons for the panel titles */
function glyph(ctx, kind, cx, cy, color = COLORS.soft) {
    ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'chat') { rr(ctx, -10, -10, 20, 16, 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-7, 12); ctx.lineTo(1, 6); ctx.stroke(); }
    else if (kind === 'heart') { ctx.beginPath(); ctx.moveTo(0, 10); ctx.bezierCurveTo(-16, -1, -9, -13, 0, -5); ctx.bezierCurveTo(9, -13, 16, -1, 0, 10); ctx.stroke(); }
    else if (kind === 'mic') { rr(ctx, -4, -12, 8, 14, 4); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 9, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, 13); ctx.stroke(); }
    else if (kind === 'hash') { ctx.beginPath(); ctx.moveTo(-3, -10); ctx.lineTo(-6, 10); ctx.moveTo(6, -10); ctx.lineTo(3, 10); ctx.moveTo(-10, -3); ctx.lineTo(10, -3); ctx.moveTo(-10, 4); ctx.lineTo(10, 4); ctx.stroke(); }
    else if (kind === 'clock') { ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 0); ctx.lineTo(5, 3); ctx.stroke(); }
    else if (kind === 'trend') { ctx.beginPath(); ctx.moveTo(-11, 9); ctx.lineTo(-11, -10); ctx.moveTo(-11, 9); ctx.lineTo(11, 9); ctx.moveTo(-7, 3); ctx.lineTo(-1, -3); ctx.lineTo(3, 1); ctx.lineTo(10, -8); ctx.stroke(); }
    else if (kind === 'users') { ctx.beginPath(); ctx.arc(-3, -4, 5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(-3, 12, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); ctx.beginPath(); ctx.arc(8, -3, 3.5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
}

/** Panel with a title and a small icon on the right. Returns the first row y. */
function titled(ctx, x, y, w, h, title, icon) {
    panel(ctx, x, y, w, h);
    T(ctx, title, x + 22, y + 40, { size: 25, bold: true, maxWidth: w - 90 });
    if (icon) glyph(ctx, icon, x + w - 34, y + 31);
    return y + 62;
}

/** Rows of "chip  value unit": [{ chip, value, unit }] */
function chipRows(ctx, x, y, w, items, { rowH = 56, gap = 10, chipW = 70, chipFont = 22, valueFont = 31, wide = false } = {}) {
    items.forEach((it, i) => {
        const ry = y + i * (rowH + gap);
        rr(ctx, x + 14, ry, w - 28, rowH, 16); ctx.fillStyle = '#0d0d0f'; ctx.fill();
        ctx.strokeStyle = '#1b1b1e'; ctx.lineWidth = 1.5; ctx.stroke();
        const cw = wide ? Math.min(w * 0.46, Math.max(chipW, measure(ctx, it.chip, chipFont, true) + 36)) : chipW;
        chipBox(ctx, x + 22, ry + 6, cw, rowH - 12, 12);
        T(ctx, it.chip, x + 22 + cw / 2, ry + rowH / 2 + chipFont * 0.35, { size: chipFont, bold: true, align: 'center', maxWidth: cw - 14 });
        const vx = x + 22 + cw + 16;
        const vw = T(ctx, it.value, vx, ry + rowH / 2 + valueFont * 0.34, { size: valueFont, bold: true, color: COLORS.number, maxWidth: w - (vx - x) - 30 });
        if (it.unit) T(ctx, it.unit, vx + vw + 10, ry + rowH / 2 + 7, { size: 20, italic: true, color: COLORS.soft });
    });
}

/** Smooth line chart with a soft fill: series = [{ color, values }] */
function lineChart(ctx, { x, y, w, h, series, empty = 'Nothing tracked yet' }) {
    const any = Math.max(...series.flatMap(s => s.values), 0);
    ctx.save(); ctx.strokeStyle = '#1a1a1d'; ctx.lineWidth = 1.5;
    for (let i = 0; i <= 3; i++) { const gy = y + (h * i) / 3; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
    ctx.restore();
    if (any === 0) { T(ctx, empty, x + w / 2, y + h / 2 + 7, { size: 20, color: COLORS.faint, align: 'center' }); return; }
    for (const s of series) {
        const n = s.values.length; if (n < 2) continue;
        const max = Math.max(...s.values, 1);   // every line is scaled to its own peak, so a small series stays visible
        const pts = s.values.map((v, i) => [x + (w * i) / (n - 1), y + h - (v / max) * (h - 10) - 2]);
        const curve = () => {
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 0; i < n - 1; i++) {
                const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
                const c1y = Math.min(y + h, Math.max(y, p1[1] + (p2[1] - p0[1]) / 6)), c2y = Math.min(y + h, Math.max(y, p2[1] - (p3[1] - p1[1]) / 6));
                ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, c1y, p2[0] - (p3[0] - p1[0]) / 6, c2y, p2[0], p2[1]);
            }
        };
        const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, `${s.color}40`); g.addColorStop(1, `${s.color}00`);
        ctx.beginPath(); curve(); ctx.lineTo(pts[n - 1][0], y + h); ctx.lineTo(pts[0][0], y + h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); curve(); ctx.strokeStyle = s.color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    }
}

function legend(ctx, x, y, items) {      // right-aligned at x
    let rx = x;
    for (const it of [...items].reverse()) {
        const w = measure(ctx, it.label, 19, false);
        T(ctx, it.label, rx, y, { size: 19, color: COLORS.soft, align: 'right' });
        ctx.beginPath(); ctx.arc(rx - w - 14, y - 6, 6, 0, Math.PI * 2); ctx.fillStyle = it.color; ctx.fill();
        rx -= w + 14 + 12 + 22;
    }
}

/* ---------- page: header, footer, finish ---------- */

async function header(ctx, o, { title, sub, iconUrl, chips = [] }) {
    const img = await image(iconUrl);
    picture(ctx, img, M + 2, 24, 60, 15, title);
    T(ctx, title, M + 82, 54, { size: 32, bold: true, maxWidth: 560 });
    if (sub) T(ctx, sub, M + 82, 82, { size: 19, color: COLORS.soft, maxWidth: 560 });
    let rx = W - M;
    for (const c of [...chips].reverse()) {
        const w = Math.max(measure(ctx, c.label, 14, false) + 30, measure(ctx, c.value, 24, true) + 40, 110);
        panel(ctx, rx - w, 20, w, 72, 18);
        T(ctx, c.label, rx - w + 20, 47, { size: 14, color: COLORS.soft, caps: true });
        T(ctx, c.value, rx - w + 20, 77, { size: 24, bold: true, maxWidth: w - 36 });
        rx -= w + 12;
    }
    return 112;
}

async function footer(ctx, y, o, scope = 'Server') {
    const left = T(ctx, `${scope} Lookback:`, M + 4, y + 22, { size: 18, bold: true });
    const mid = T(ctx, o.rangeLabel, M + 4 + left + 10, y + 22, { size: 18, color: COLORS.soft });
    const dash = T(ctx, '—', M + 4 + left + mid + 28, y + 22, { size: 18, color: COLORS.faint });
    const tz = T(ctx, 'Timezone:', M + 4 + left + mid + dash + 46, y + 22, { size: 18, bold: true });
    T(ctx, 'UTC', M + 4 + left + mid + dash + tz + 56, y + 22, { size: 18, color: COLORS.soft });
    const img = await image(o.botAvatarURL);
    const name = `Powered by ${o.botName}`;
    const w = measure(ctx, name, 19, false);
    T(ctx, name, W - M - 4, y + 22, { size: 19, color: COLORS.soft, align: 'right' });
    picture(ctx, img, W - M - 4 - w - 44, y - 4, 34, 17, o.botName);
    return y + 40;
}

/** Draw the content on a 1200-wide sheet, then scale it down into a rounded card. */
async function build(o, draw) {
    ensureFonts();
    const sheet = createCanvas(W, 1400), ctx = sheet.getContext('2d');
    let y = await draw(ctx);
    y = await footer(ctx, y + 8, o, o.scope);
    const H = Math.ceil(y + 14);
    const out = createCanvas(Math.round(W * SCALE), Math.round(H * SCALE)), g = out.getContext('2d');
    g.save(); rr(g, 1, 1, out.width - 2, out.height - 2, 28); g.fillStyle = COLORS.page; g.fill(); g.clip();
    g.imageSmoothingQuality = 'high';
    g.drawImage(sheet, 0, 0, W, H, 0, 0, out.width, out.height);
    g.restore();
    rr(g, 1, 1, out.width - 2, out.height - 2, 28); g.strokeStyle = '#26262a'; g.lineWidth = 2; g.stroke();
    return out.toBuffer('image/png');
}

const seriesOf = (series, key) => series.map(p => p[key]);
const sum = (series, key) => series.reduce((s, p) => s + p[key], 0);
const third = (W - M * 2 - GAP * 2) / 3;
const windowsRows = (w, kind) => [1, 7, 30].map((d) => {
    const v = w[d] ?? 0;
    return { chip: `${d}d`, value: kind === 'hours' ? formatHours(v) : kind === 'perday' ? String(perDay(v, d)) : formatNumber(v), unit: kind === 'hours' ? 'hours' : kind === 'perday' ? '/ day' : kind === 'reactions' ? 'reactions' : 'messages' };
});
const countRows = (items, unit) => items.map(i => ({ chip: i.name, value: i.value, unit }));

/* ---------- cards ---------- */

async function renderOverviewCard(o) {
    return build(o, async (ctx) => {
        let y = await header(ctx, o, { title: o.guildName, sub: `${formatNumber(o.memberCount)} members`, iconUrl: o.guildIconURL, chips: [{ label: 'Created', value: o.createdAt }, { label: 'Members', value: formatNumber(o.memberCount) }] });
        const h = 262;
        [['Messages', 'chat', windowsRows(o.windows.messages)], ['Reactions', 'heart', windowsRows(o.windows.reactions, 'reactions')], ['Voice Activity', 'mic', windowsRows(o.windows.voice, 'hours')]].forEach(([title, icon, rows], i) => {
            const x = M + i * (third + GAP);
            const ry = titled(ctx, x, y, third, h, title, icon);
            chipRows(ctx, x, ry, third, rows);
        });
        y += h + GAP;
        const lh = 276, lw = 560;
        let ry = titled(ctx, M, y, lw, lh, 'Top Channels', 'hash');
        if (o.topChannels.length) chipRows(ctx, M, ry, lw, countRows(o.topChannels.slice(0, 3), 'messages'), { wide: true, chipFont: 21 });
        else T(ctx, 'No messages tracked yet', M + lw / 2, y + lh / 2 + 24, { size: 20, color: COLORS.faint, align: 'center' });
        const cx = M + lw + GAP, cw = W - M - cx;
        titled(ctx, cx, y, cw, lh, 'Charts', 'trend');
        legend(ctx, cx + cw - 64, y + 38, [{ label: 'Messages', color: COLORS.messages }, { label: 'Reactions', color: COLORS.reactions }, { label: 'Voice', color: COLORS.voice }]);
        lineChart(ctx, { x: cx + 20, y: y + 72, w: cw - 40, h: lh - 96, series: [
            { color: COLORS.messages, values: seriesOf(o.series, 'messages') }, { color: COLORS.reactions, values: seriesOf(o.series, 'reactions') }, { color: COLORS.voice, values: seriesOf(o.series, 'voiceSeconds') },
        ] });
        return y + lh + GAP;
    });
}

async function renderActivityCard(o) {
    return build(o, async (ctx) => {
        let y = await header(ctx, o, { title: 'Activity', sub: o.guildName, iconUrl: o.guildIconURL, chips: [{ label: 'Members', value: formatNumber(o.memberCount) }] });
        const h = 262;
        [['Messages', 'chat', windowsRows(o.windows.messages, 'perday')], ['Reactions', 'heart', windowsRows(o.windows.reactions, 'perday')], ['Voice', 'mic', windowsRows(o.windows.voice, 'hours')]].forEach(([title, icon, rows], i) => {
            const x = M + i * (third + GAP);
            const ry = titled(ctx, x, y, third, h, title === 'Voice' ? 'Voice Hours' : `${title} a Day`, icon);
            chipRows(ctx, x, ry, third, rows);
        });
        y += h + GAP;
        const ch = 300;
        titled(ctx, M, y, W - M * 2, ch, 'Charts', 'trend');
        legend(ctx, W - M - 64, y + 38, [{ label: 'Messages', color: COLORS.messages }, { label: 'Reactions', color: COLORS.reactions }, { label: 'Voice', color: COLORS.voice }]);
        lineChart(ctx, { x: M + 22, y: y + 74, w: W - M * 2 - 44, h: ch - 100, series: [
            { color: COLORS.messages, values: seriesOf(o.series, 'messages') }, { color: COLORS.reactions, values: seriesOf(o.series, 'reactions') }, { color: COLORS.voice, values: seriesOf(o.series, 'voiceSeconds') },
        ] });
        return y + ch + GAP;
    });
}

async function renderMessagesCard(o) {
    return build(o, async (ctx) => {
        let y = await header(ctx, o, { title: 'Messages', sub: o.guildName, iconUrl: o.guildIconURL, chips: [{ label: 'Chatters', value: formatNumber(o.chatters ?? 0) }] });
        const h = 262;
        let x = M, ry = titled(ctx, x, y, third, h, 'Server Lookback', 'clock');
        panelBig(ctx, x, ry - 8, third, h - 62, formatNumber(o.totals.messages), 'messages');
        x = M + third + GAP; ry = titled(ctx, x, y, third, h, 'Messages', 'hash'); chipRows(ctx, x, ry, third, windowsRows(o.windows.messages));
        x = M + (third + GAP) * 2; ry = titled(ctx, x, y, third, h, 'Daily Average', 'trend'); chipRows(ctx, x, ry, third, windowsRows(o.windows.messages, 'perday'));
        y += h + GAP;
        const half = (W - M * 2 - GAP) / 2, lh = 276;
        ry = titled(ctx, M, y, half, lh, 'Top Message Members', 'hash');
        if (o.topMembers.length) chipRows(ctx, M, ry, half, countRows(o.topMembers.slice(0, 3), 'messages'), { wide: true, chipFont: 21 });
        else T(ctx, 'No messages tracked yet', M + half / 2, y + lh / 2 + 24, { size: 20, color: COLORS.faint, align: 'center' });
        const bx = M + half + GAP;
        ry = titled(ctx, bx, y, half, lh, 'Top Message Channels', 'hash');
        if (o.topChannels.length) chipRows(ctx, bx, ry, half, countRows(o.topChannels.slice(0, 3), 'messages'), { wide: true, chipFont: 21 });
        else T(ctx, 'No messages tracked yet', bx + half / 2, y + lh / 2 + 24, { size: 20, color: COLORS.faint, align: 'center' });
        return y + lh + GAP;
    });
}

function panelBig(ctx, x, y, w, h, value, unit) {
    rr(ctx, x + 14, y + 6, w - 28, h - 6, 18); ctx.fillStyle = '#0d0d0f'; ctx.fill(); ctx.strokeStyle = '#1b1b1e'; ctx.lineWidth = 1.5; ctx.stroke();
    T(ctx, value, x + w / 2, y + h / 2 + 12, { size: 74, bold: true, align: 'center', maxWidth: w - 70 });
    T(ctx, unit, x + w / 2, y + h / 2 + 46, { size: 21, italic: true, color: COLORS.soft, align: 'center' });
}

async function renderVoiceCard(o) {
    return build(o, async (ctx) => {
        let y = await header(ctx, o, { title: 'Voice Activity', sub: o.guildName, iconUrl: o.guildIconURL, chips: [{ label: 'In voice now', value: String(o.inVoice ?? 0) }, { label: 'Members', value: formatNumber(o.memberCount) }] });
        const h = 262;
        let x = M, ry = titled(ctx, x, y, third, h, 'Server Lookback', 'clock');
        panelBig(ctx, x, ry - 8, third, h - 62, formatDuration(o.totals.voiceSeconds), 'in voice');
        x = M + third + GAP; ry = titled(ctx, x, y, third, h, 'Voice Activity', 'mic'); chipRows(ctx, x, ry, third, windowsRows(o.windows.voice, 'hours'));
        x = M + (third + GAP) * 2; ry = titled(ctx, x, y, third, h, 'Members', 'users');
        chipRows(ctx, x, ry, third, [
            { chip: 'in voice', value: formatNumber(o.voiceMembers ?? 0), unit: 'members' },
            { chip: 'average', value: formatDuration(o.totals.voiceSeconds / Math.max(o.voiceMembers ?? 0, 1)), unit: 'each' },
            { chip: 'per day', value: formatDuration(o.totals.voiceSeconds / Math.max(o.days, 1)), unit: '' },
        ], { wide: true, chipFont: 20, valueFont: 28 });
        y += h + GAP;
        const half = (W - M * 2 - GAP) / 2, lh = 276;
        ry = titled(ctx, M, y, half, lh, 'Top Voice Members', 'mic');
        if (o.topVoice.length) chipRows(ctx, M, ry, half, countRows(o.topVoice.slice(0, 3), ''), { wide: true, chipFont: 21, valueFont: 28 });
        else T(ctx, 'No voice time tracked yet', M + half / 2, y + lh / 2 + 24, { size: 20, color: COLORS.faint, align: 'center' });
        const cx = M + half + GAP;
        titled(ctx, cx, y, half, lh, 'Charts', 'trend');
        lineChart(ctx, { x: cx + 20, y: y + 72, w: half - 40, h: lh - 96, series: [{ color: COLORS.voice, values: seriesOf(o.series, 'voiceSeconds') }], empty: 'No tracked voice time yet' });
        return y + lh + GAP;
    });
}

async function renderMembershipCard(o) {
    return build(o, async (ctx) => {
        const joins = sum(o.series, 'joins'), leaves = sum(o.series, 'leaves'), net = joins - leaves, n = Math.max(o.series.length, 1);
        let y = await header(ctx, o, { title: 'Membership', sub: o.guildName, iconUrl: o.guildIconURL, chips: [{ label: 'Created', value: o.createdAt }, { label: 'Members', value: formatNumber(o.memberCount) }] });
        const h = 262;
        const cols = [
            ['Joined', 'users', [{ chip: 'total', value: formatNumber(joins), unit: 'joined' }, { chip: 'per day', value: String(perDay(joins, n)), unit: '/ day' }]],
            ['Left', 'users', [{ chip: 'total', value: formatNumber(leaves), unit: 'left' }, { chip: 'per day', value: String(perDay(leaves, n)), unit: '/ day' }]],
            ['Growth', 'trend', [{ chip: 'net', value: `${net >= 0 ? '+' : ''}${net}`, unit: 'members' }, { chip: 'now', value: formatNumber(o.memberCount), unit: 'members' }]],
        ];
        cols.forEach(([title, icon, rows], i) => { const x = M + i * (third + GAP); const ry = titled(ctx, x, y, third, 200, title, icon); chipRows(ctx, x, ry, third, rows, { wide: true, chipFont: 20 }); });
        y += 200 + GAP;
        const ch = 290;
        titled(ctx, M, y, W - M * 2, ch, 'Charts', 'trend');
        legend(ctx, W - M - 64, y + 38, [{ label: 'Joined', color: COLORS.joins }, { label: 'Left', color: COLORS.leaves }]);
        lineChart(ctx, { x: M + 22, y: y + 74, w: W - M * 2 - 44, h: ch - 100, series: [{ color: COLORS.joins, values: seriesOf(o.series, 'joins') }, { color: COLORS.leaves, values: seriesOf(o.series, 'leaves') }], empty: 'No joins or leaves tracked yet' });
        void h;
        return y + ch + GAP;
    });
}

async function renderUserCard(o) {
    return build({ ...o, scope: 'Member' }, async (ctx) => {
        const rank = (r) => (r ? `#${r}` : '—');
        let y = await header(ctx, o, { title: o.name, sub: `Member analytics`, iconUrl: o.avatarUrl, chips: [{ label: 'Msg rank', value: rank(o.messageRank) }, { label: 'Voice rank', value: rank(o.voiceRank) }] });
        const h = 262;
        let x = M, ry = titled(ctx, x, y, third, h, 'Messages', 'chat');
        chipRows(ctx, x, ry, third, [{ chip: 'total', value: formatNumber(o.messages), unit: 'messages' }, { chip: 'per day', value: String(perDay(o.messages, o.days)), unit: '/ day' }, { chip: 'active', value: String(o.activeDays), unit: 'days' }], { wide: true, chipFont: 20 });
        x = M + third + GAP; ry = titled(ctx, x, y, third, h, 'Voice Activity', 'mic');
        chipRows(ctx, x, ry, third, [{ chip: 'total', value: formatHours(o.voiceSeconds), unit: 'hours' }, { chip: 'per day', value: formatDuration(o.voiceSeconds / Math.max(o.days, 1)), unit: '' }, { chip: 'now', value: o.snapshot[5]?.value ?? '—', unit: 'in voice' }], { wide: true, chipFont: 20 });
        x = M + (third + GAP) * 2; ry = titled(ctx, x, y, third, h, 'Snapshot', 'users');
        chipRows(ctx, x, ry, third, [o.snapshot[0], o.snapshot[1], o.snapshot[3]].map((c, i) => ({ chip: ['msgs', 'voice', 'joined'][i], value: c?.value ?? '—', unit: ['share', 'share', 'ago'][i] })), { wide: true, chipFont: 20 });
        y += h + GAP;
        const lh = 276, lw = 560;
        ry = titled(ctx, M, y, lw, lh, 'Top Channels', 'hash');
        if (o.topChannels.length) chipRows(ctx, M, ry, lw, countRows(o.topChannels.slice(0, 3), 'messages'), { wide: true, chipFont: 21 });
        else T(ctx, 'No messages yet', M + lw / 2, y + lh / 2 + 24, { size: 20, color: COLORS.faint, align: 'center' });
        const cx = M + lw + GAP, cw = W - M - cx;
        titled(ctx, cx, y, cw, lh, 'Charts', 'trend');
        legend(ctx, cx + cw - 64, y + 38, [{ label: 'Messages', color: COLORS.messages }, { label: 'Voice', color: COLORS.voice }]);
        lineChart(ctx, { x: cx + 20, y: y + 72, w: cw - 40, h: lh - 96, series: [{ color: COLORS.messages, values: seriesOf(o.series, 'messages') }, { color: COLORS.voice, values: seriesOf(o.series, 'voiceSeconds') }] });
        return y + lh + GAP;
    });
}

module.exports = {
    COLORS, formatNumber, formatHours, formatDuration, perDay, shortDate,
    renderOverviewCard, renderActivityCard, renderMembershipCard, renderMessagesCard, renderVoiceCard, renderUserCard,
};
