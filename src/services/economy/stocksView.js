// Developed by Cosmin
// paw · stocks cards (Components V2): the market list with pages, and one stock's detail.
// Pure views: no database, no commands. services/economy/commands.js decides what to show.

const {
    ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder,
} = require('discord.js');
const ui = require('../ui');
const { icon } = require('../icons');
const D = require('./data');

const PAGE_SIZE = 10;
const LAVENDER = 0xC9B7F4;
const ID = { prev: 'stk_prev', next: 'stk_next', search: 'stk_search', stop: 'stk_stop' };

const pageCount = () => Math.max(1, Math.ceil(D.ASSETS.length / PAGE_SIZE));
const ticker = (a) => `\`${a.id.toUpperCase()}\``;
const pct = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

/** green / red / flat marker: your own custom emoji when set (eco_up, eco_down, eco_flat), otherwise a coloured dot. */
function arrow(change) {
    if (Math.abs(change) < 0.005) return icon('eco_flat') || '⚪';
    return change > 0 ? (icon('eco_up') || '🟢') : (icon('eco_down') || '🔴');
}

/** One row of the list: `⌃ [PAW] Paw Corp — 102 (+0.76%) · Conglomerate` */
function line(a, at) {
    const ch = D.changeTick(a, at);
    return `${arrow(ch)} ${ticker(a)} **${a.name}** — ${D.n(D.price(a, at))} (${pct(ch)}) · ${a.sector}`;
}

/** The market list, like the reference: title, how it works, the rows, the page and four buttons. */
function market(page = 0, { disabled = false, at = Date.now() } = {}) {
    const last = pageCount() - 1;
    page = Math.min(Math.max(0, page), last);
    const rows = D.ASSETS.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    const lock = Math.round(D.STOCK_LOCK / 60000);

    const c = ui.box().setAccentColor(LAVENDER);
    c.addTextDisplayComponents(ui.text(
        `## market ♡\nprices move at random~ there's no pattern to beat. you buy at the ask, sell at the bid, and shares are locked for ${lock} minutes after you buy.`));
    c.addSeparatorComponents(ui.sep());
    c.addTextDisplayComponents(ui.text(rows.map((a) => line(a, at)).join('\n')));
    c.addSeparatorComponents(ui.sep());
    c.addTextDisplayComponents(ui.text(`${ui.sub(`page ${page + 1}/${last + 1}`)}\n${ui.sub('stocks buy <code> <amount> · stocks sell <code> <amount|all>')}`));
    c.addActionRowComponents(ui.row(
        ui.btn(ID.prev, '', { emoji: icon('page_prev') || '◀️', disabled: disabled || page === 0 }),
        ui.btn(ID.next, '', { emoji: icon('page_next') || '▶️', disabled: disabled || page === last }),
        ui.btn(ID.search, '', { emoji: icon('search') || '🔍', disabled }),
        ui.btn(ID.stop, '', { style: 'danger', emoji: icon('stop') || '🚫', disabled }),
    ));
    return { box: c, page };
}

/** One stock in detail. `held` = { qty, spent, lockedUntil } or null. */
function detail(a, held, g, { at = Date.now() } = {}) {
    const ch = D.changeTick(a, at);
    const dec = (v) => (v >= 100 ? D.n(Math.round(v)) : v.toFixed(2));
    const money = (v) => `${D.n(v)} ${g?.currency ?? 'coins'}`;
    const lines = [
        `### ${ticker(a)} ${a.name} ♡`,
        `${a.sector}`,
        `${arrow(ch)} **${D.n(D.price(a, at))}** (${pct(ch)} in 5 minutes)`,
        `buy at the ask **${dec(D.ask(a, at))}** · sell at the bid **${dec(D.bid(a, at))}**`,
    ];
    if (held?.qty) {
        const locked = held.lockedUntil && held.lockedUntil.getTime() > Date.now();
        lines.push('', `you own **${D.n(held.qty)}** share${held.qty === 1 ? '' : 's'}, paid ${money(held.spent)}`);
        if (locked) lines.push(`locked until <t:${Math.floor(held.lockedUntil.getTime() / 1000)}:R>`);
    }
    const c = ui.box().setAccentColor(LAVENDER);
    c.addTextDisplayComponents(ui.text(lines.join('\n')));
    c.addTextDisplayComponents(ui.text(ui.sub(`stocks buy ${a.id} <amount> · stocks sell ${a.id} <amount|all>`)));
    return c;
}

/** The little "find a stock" window behind the magnifier button. */
function searchModal(customId) {
    const input = new TextInputBuilder().setCustomId('code').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40).setPlaceholder('paw, moon, cloud…');
    return new ModalBuilder().setCustomId(customId).setTitle('find a stock')
        .addLabelComponents(new LabelBuilder().setLabel('Stock code or name').setTextInputComponent(input));
}

/** code (paw) or part of a name (cloud) → the stock, or undefined. */
function find(query) {
    const q = String(query ?? '').toLowerCase().trim();
    if (!q) return undefined;
    return D.asset(q) ?? D.ASSETS.find((a) => a.name.toLowerCase().includes(q));
}

module.exports = { ID, PAGE_SIZE, pageCount, market, detail, searchModal, find, arrow, pct, ticker };
