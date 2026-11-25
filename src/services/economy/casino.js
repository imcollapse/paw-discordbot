// Developed by Cosmin
// paw · casino games: blackjack, roulette and dice. Built on the economy helpers in commands.js.
// Blackjack look: one card per emoji with an arrow between them (white card emojis from media/emoji-pack),
// "You" on top, the dealer under it, and a balance / bet / streak line at the bottom.
// Without the emojis the cards show as plain text such as `AS` (ace of spades) and `10H`.

const crypto = require('crypto');
const { MessageFlags } = require('discord.js');
const ui = require('../ui');
const emojis = require('../emojiMap');
const db = require('../../database/economy');
const D = require('./data');

const { n } = D;
const rid = (m) => crypto.randomInt(m);
const NOMENTION = { allowedMentions: { parse: [], repliedUser: false } };
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];
const IDLE_MS = 90_000;

const active = new Map(); // userId -> game

// cards

function shuffled() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
    for (let i = d.length - 1; i > 0; i--) { const j = rid(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
}
const pts = (c) => (c.r === 'a' ? 11 : 'jqk'.includes(c.r) ? 10 : Number(c.r));
function total(hand) {
    let sum = hand.reduce((a, c) => a + pts(c), 0);
    let aces = hand.filter((c) => c.r === 'a').length;
    while (sum > 21 && aces-- > 0) sum -= 10;
    return sum;
}
const isBlackjack = (hand) => hand.length === 2 && total(hand) === 21;

const face = (c) => emojis.customOf(`card_${c.r}${c.s}`) ?? `\`${c.r.toUpperCase()}${c.s.toUpperCase()}\``;
const back = () => emojis.customOf('card_back') ?? '`??`';
const arrow = () => emojis.customOf('bj_arrow') ?? '>';
const row = (cards) => cards.join(` ${arrow()} `);
const ic = (key) => { const e = emojis.customOf(key); return e ? `${e} ` : ''; };

// blackjack view

function view(game, money, { result = null } = {}) {
    const done = result !== null;
    const dealer = done
        ? { label: total(game.dealer), cards: game.dealer.map(face) }
        : { label: `${pts(game.dealer[0])} + ?`, cards: [face(game.dealer[0]), back()] };

    const box = ui.box()
        .addTextDisplayComponents(ui.text(`> -# ${done ? `Game Complete · ${result}` : 'Game in Progress · Choose Your Next Move'}`))
        .addSeparatorComponents(ui.sep(true))
        .addTextDisplayComponents(ui.text(`**You:** \`${total(game.player)}\`\n${row(game.player.map(face))}`))
        .addTextDisplayComponents(ui.text(`**Dealer:** \`${dealer.label}\`\n${row(dealer.cards)}`))
        .addSeparatorComponents(ui.sep(true))
        .addTextDisplayComponents(ui.text(
            `-# ${ic('eco_wallet')}**Balance:** ${money(game.balance)} · ${ic('eco_coin')}**Bet Amount:** ${money(game.bet)} · ${ic('eco_streak')}**Current Streak:** ${game.streak}`));

    const components = [box];
    if (!done) {
        const buttons = [
            ui.btn('bj_hit', null, { emoji: emojis.bj_hit, style: 'secondary' }),
            ui.btn('bj_stand', null, { emoji: emojis.bj_stand, style: 'secondary' }),
        ];
        if (game.player.length === 2 && !game.doubled && game.balance >= game.bet) {
            buttons.push(ui.btn('bj_double', null, { emoji: emojis.bj_double, style: 'secondary' }));
        }
        components.push(ui.row(...buttons));
    }
    return { components, flags: MessageFlags.IsComponentsV2, ...NOMENTION };
}

// blackjack flow

/** Dealer plays out, money is paid, streak is updated. Returns the result text. */
async function settleHand(ctx, game, forced = null) {
    let result, payout = 0, outcome;
    const p = total(game.player);

    if (forced === 'bust' || p > 21) { result = 'You Busted'; outcome = 'loss'; }
    else {
        while (total(game.dealer) < 17) game.dealer.push(game.deck.pop());
        const d = total(game.dealer);
        if (isBlackjack(game.player) && !isBlackjack(game.dealer)) { result = 'Blackjack, You Won'; payout = Math.floor(game.bet * 2.5); outcome = 'win'; }
        else if (d > 21) { result = 'Dealer Busted, You Won'; payout = game.bet * 2; outcome = 'win'; }
        else if (isBlackjack(game.dealer) && !isBlackjack(game.player)) { result = 'Dealer Blackjack'; outcome = 'loss'; }
        else if (p > d) { result = 'You Won'; payout = game.bet * 2; outcome = 'win'; }
        else if (p === d) { result = 'Push, Bet Returned'; payout = game.bet; outcome = 'push'; }
        else { result = 'Dealer Won'; outcome = 'loss'; }
    }

    let row;
    if (payout > 0) row = await db.change(ctx.gid, ctx.uid, { wallet: payout, earn: Math.max(0, payout - game.bet) });
    row = row ?? await db.user(ctx.gid, ctx.uid);
    game.balance = Number(row.wallet);
    game.streak = await db.bjRecord(ctx.uid, outcome);
    game.outcome = outcome;
    return result;
}

function blackjack({ bet, settle, bad, money }) {
    return async (ctx, args) => {
        if (active.has(ctx.uid)) return bad(ctx, 'you already have a hand in play.', 'Finish it with the buttons first.');
        const amt = await bet(ctx, args[0], 'blackjack');
        if (amt === null) return;
        const after = await settle(ctx, -amt);          // the stake leaves the wallet now and comes back with winnings
        if (!after) return bad(ctx, 'you don\'t have that much anymore.');

        const deck = shuffled();
        const game = {
            deck, bet: amt, doubled: false, balance: Number(after.wallet), streak: await db.bjStreak(ctx.uid),
            player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()],
        };
        active.set(ctx.uid, game);
        const fmt = (v) => money(v, ctx.g);

        let sent;
        try {
            if (isBlackjack(game.player) || isBlackjack(game.dealer)) {
                const text = await settleHand(ctx, game);
                active.delete(ctx.uid);
                return ctx.message.reply(view(game, fmt, { result: text }));
            }
            sent = await ctx.message.reply(view(game, fmt));
        } catch (e) { active.delete(ctx.uid); await db.change(ctx.gid, ctx.uid, { wallet: amt }); throw e; }

        const collector = sent.createMessageComponentCollector({ idle: IDLE_MS });
        let finished = false;

        const finish = async (i, forced = null) => {
            finished = true;
            const result = await settleHand(ctx, game, forced);
            active.delete(ctx.uid);
            collector.stop('done');
            const out = view(game, fmt, { result });
            if (i) await i.update(out).catch(() => sent.edit(out).catch(() => {}));
            else await sent.edit(out).catch(() => {});
        };

        collector.on('collect', async (i) => {
            if (i.user.id !== ctx.uid) return i.reply({ content: "That's not your hand.", ephemeral: true }).catch(() => {});
            try {
                if (i.customId === 'bj_hit') {
                    game.player.push(game.deck.pop());
                    if (total(game.player) >= 21) return await finish(i, total(game.player) > 21 ? 'bust' : null);
                    return await i.update(view(game, fmt));
                }
                if (i.customId === 'bj_stand') return await finish(i);
                if (i.customId === 'bj_double') {
                    const row = await settle(ctx, -game.bet);   // second stake
                    if (!row) return i.reply({ content: "You can't cover a double.", ephemeral: true }).catch(() => {});
                    game.balance = Number(row.wallet);
                    game.bet *= 2; game.doubled = true;
                    game.player.push(game.deck.pop());
                    return await finish(i, total(game.player) > 21 ? 'bust' : null);
                }
            } catch (e) {
                console.error('[blackjack]', e);
                active.delete(ctx.uid);
                collector.stop('error');
            }
        });
        // walking away counts as standing, so a stake is never lost in limbo
        collector.on('end', async (_c, reason) => {
            if (finished || reason === 'error') return;
            try { await finish(null); } catch (e) { console.error('[blackjack] timeout settle:', e); active.delete(ctx.uid); }
        });
    };
}

// roulette

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colourOf = (k) => (k === 0 ? 'green' : REDS.has(k) ? 'red' : 'black');
const SIDES = {
    red: (k) => colourOf(k) === 'red', black: (k) => colourOf(k) === 'black',
    odd: (k) => k > 0 && k % 2 === 1, even: (k) => k > 0 && k % 2 === 0,
    low: (k) => k >= 1 && k <= 18, high: (k) => k >= 19 && k <= 36,
    green: (k) => k === 0,
};

function roulette({ bet, settle, reply, bad, E, balLine, HEART, money }) {
    return async (ctx, args) => {
        const pick = String(args[0] || '').toLowerCase();
        const asNumber = /^\d{1,2}$/.test(pick) && Number(pick) <= 36 ? Number(pick) : null;
        if (!SIDES[pick] && asNumber === null) {
            return bad(ctx, 'pick red, black, green, odd, even, low, high or a number from 0 to 36.', 'Example: `roulette red 100`');
        }
        const amt = await bet(ctx, args[1], 'roulette');
        if (amt === null) return;
        const k = rid(37);
        const win = asNumber !== null ? k === asNumber : SIDES[pick](k);
        const mult = (asNumber !== null || pick === 'green') ? 36 : 2;       // number and green pay 35 to 1
        const delta = win ? amt * (mult - 1) : -amt;
        const after = await settle(ctx, delta);
        if (!after) return bad(ctx, 'you don\'t have that much anymore.');
        return reply(ctx, E([
            `**${ctx.name} spun the roulette** ${HEART}`,
            `> the ball landed on **${k} ${colourOf(k)}**, you bet on **${pick}**`,
            `> ${win ? `won ${money(delta, ctx.g)}` : `lost ${money(amt, ctx.g)}`}`,
            balLine(after, ctx.g),
        ].join('\n'), win ? 'success' : 'error'));
    };
}

// dice

function dice({ bet, settle, reply, bad, E, balLine, HEART, money }) {
    return async (ctx, args) => {
        const side = ['over', 'under', 'seven', '7'].includes(String(args[0] || '').toLowerCase()) ? String(args[0]).toLowerCase() : null;
        if (!side) return bad(ctx, 'call over, under or seven, then your bet.', 'Two dice are rolled. Over is 8 to 12, under is 2 to 6. Example: `dice over 50`');
        const amt = await bet(ctx, args[1], 'dice');
        if (amt === null) return;
        const a = 1 + rid(6), b = 1 + rid(6), sum = a + b;
        const seven = side === 'seven' || side === '7';
        const win = seven ? sum === 7 : side === 'over' ? sum > 7 : sum < 7;
        const total_ = seven ? amt * 5 : Math.floor(amt * 2.2);
        const delta = win ? total_ - amt : -amt;
        const after = await settle(ctx, delta);
        if (!after) return bad(ctx, 'you don\'t have that much anymore.');
        return reply(ctx, E([
            `**${ctx.name} rolled the dice** ${HEART}`,
            `> **${a}** and **${b}**, a total of **${sum}**`,
            `> ${win ? `${seven ? 'seven' : side} hit, won ${money(delta, ctx.g)}` : `${seven ? 'seven' : side} missed, lost ${money(amt, ctx.g)}`}`,
            balLine(after, ctx.g),
        ].join('\n'), win ? 'success' : 'error'));
    };
}

module.exports = (helpers) => ({ blackjack: blackjack(helpers), roulette: roulette(helpers), dice: dice(helpers) });
