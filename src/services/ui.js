// Developed by Cosmin
// paw — shared UI kit
// One place for the look of every reply: a single neutral grey accent, three
// event colours (success / warning / error), and small builders so commands
// stay short. Keep replies minimal: a title or one line, optional controls.

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const emojis = require('../services/emojiMap');

/** Neutral grey = "no colour" (matches Discord's dark surface). */
const COLOR = Object.freeze({
  base:    0xDDEBF5,
  success: 0xBAFFE5,
  warning: 0xFFDAA1,
  error:   0xFFA7A7,
});

const ICON = Object.freeze({
  success: emojis.success,
  warning: emojis.warning,
  error:   emojis.error,
  base:    '',
});

// Custom delete icon: set "delete" in emojis.json to your server emoji (<:name:id>).
const DELETE_EMOJI = emojis.delete;

const UNICODE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}){1,2}(?:\u200d\p{Extended_Pictographic}|\ufe0f|\p{Emoji_Modifier})*$/u;

/** Custom tag or real unicode emoji becomes a component emoji; plain text (the fallback) becomes undefined. */
function parseEmoji(str) {
  if (!str || typeof str !== 'string') return undefined;
  const m = str.match(/^<(a?):(\w+):(\d+)>$/);
  if (m) return { animated: m[1] === 'a', name: m[2], id: m[3] };
  return UNICODE_EMOJI.test(str) ? str : undefined;
}

/** When an emoji is only a text fallback ("<", ">") it becomes the label of an otherwise empty button. */
const fallbackLabel = (emoji) => (typeof emoji === 'string' && emoji && !parseEmoji(emoji) ? emoji.slice(0, 80) : undefined);

// layout primitives

// Containers are clean. Only events (success / warning / error) get a pastel stripe; `white` is for the few that should have one.
const STRIPE = { success: COLOR.success, warning: COLOR.warning, error: COLOR.error, white: 0xFFFFFF };
const box = (kind = 'base') => (STRIPE[kind] ? new ContainerBuilder().setAccentColor(STRIPE[kind]) : new ContainerBuilder());
const text = (content) => new TextDisplayBuilder().setContent(String(content));
const sep = (divider = true, large = false) =>
  new SeparatorBuilder()
    .setDivider(divider)
    .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
const sub = (content) => `-# ${content}`;

/** Text + thumbnail side by side. */
function section(content, thumbnailURL) {
  const s = new SectionBuilder().addTextDisplayComponents(text(content));
  if (thumbnailURL) s.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL));
  return s;
}

// controls

function btn(id, label, { style = 'secondary', emoji, disabled = false } = {}) {
  const styles = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
  };
  const b = new ButtonBuilder().setCustomId(id).setStyle(styles[style] ?? ButtonStyle.Secondary).setDisabled(disabled);
  const e = parseEmoji(emoji);
  const text = label || (e ? undefined : fallbackLabel(emoji));
  if (text) b.setLabel(text);
  if (e) b.setEmoji(e);
  return b;
}

function link(label, url, emoji) {
  const b = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url);
  const e = parseEmoji(emoji);
  const text = label || (e ? undefined : fallbackLabel(emoji));
  if (text) b.setLabel(text);
  if (e) b.setEmoji(e);
  return b;
}

const deleteBtn = (id = 'ui_delete') => btn(id, parseEmoji(DELETE_EMOJI) ? null : 'Delete', { style: 'danger', emoji: DELETE_EMOJI });

const row = (...components) => new ActionRowBuilder().addComponents(...components.flat());

/**
 * options: [{ label, value, description?, emoji?, default? }]
 */
function select(id, placeholder, options, { min, max, disabled = false } = {}) {
  const s = new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setDisabled(disabled);
  if (min !== undefined) s.setMinValues(min);
  if (max !== undefined) s.setMaxValues(max);
  s.addOptions(options.map(o => {
    const opt = { label: String(o.label).slice(0, 100), value: String(o.value) };
    if (o.description) opt.description = String(o.description).slice(0, 100);
    const e = parseEmoji(o.emoji);
    if (e) opt.emoji = e;
    if (o.default) opt.default = true;
    return opt;
  }));
  return s;
}

// ready-made replies

/** paw's voice: short replies start in lowercase ("you need the permission~"), the rest is left alone. */
const soft = (m) => (typeof m === 'string' ? m.replace(/^([A-Z])(?=[a-z'’]{1,})/, (c) => c.toLowerCase()) : m);

/**
 * One-line status reply. kind: success | warning | error | base
 *   notice('success', 'Saved')  →  green card, "✔ Saved"
 */
const CUTE = {
  success: ['♡', '✧', '(˶ᵔ ᵕ ᵔ˶)', '~', '₊˚⊹ ♡', '⋆˚✿'],
  warning: ['~', '(• - •)', '(｡•́︿•̀｡)', '૮₍ ´• ˕ •` ₎ა'],
  error:   ['(╥﹏╥)', '~', '(｡•́︿•̀｡)', '૮₍ ˃ ⤙ ˂ ₎ა'],
  base:    ['~', '♡', '✧'],
};
/** A small text-symbol touch at the end of short one-line replies (stable for the same message, never on code or long text). */
function cute(kind, message) {
  if (typeof message !== 'string' || message.length > 140 || /[\n`]|<a?:|[~♡✧⋆˚]\s*$|[)ა]\s*$|[?]\s*$/.test(message)) return message;
  const set = CUTE[kind] ?? CUTE.base;
  let h = 0; for (const ch of message) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  if (h % 3 === 0) return message;           // about a third stay plain, so it is not everywhere
  const tail = set[h % set.length];
  return `${message.replace(/[.!]$/, '')}${/^[~♡✧(₊⋆૮]/.test(tail) && tail !== '~' ? ' ' : ''}${tail}`;
}

function notice(kind, message, { footer } = {}) {
  message = cute(kind, soft(message));
  const icon = ICON[kind] ?? '';
  const c = box(kind).addTextDisplayComponents(text(`${icon ? icon + ' ' : ''}${message}`));
  if (footer) c.addTextDisplayComponents(text(sub(footer)));
  return c;
}
/** Plain one-line reply: no icon, no symbols. Used where a screen should stay quiet (ticket setup). */
const quiet = (message) => box().addTextDisplayComponents(text(soft(String(message))));
const success = (m, o) => notice('success', m, o);
const warn    = (m, o) => notice('warning', m, o);
const fail    = (m, o) => notice('error', m, o);
const info    = (m, o) => notice('base', m, o);

/**
 * Titled card.
 *   card({ title, lines, footer, kind, rows, thumbnail })
 * `lines` may be a string or an array (joined with newlines).
 */
function card({ title, lines, footer, kind = 'base', rows = [], thumbnail } = {}) {
  const c = box(kind);
  const body = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : lines;
  const head = title ? `### ${title}` : null;
  if (thumbnail) {
    c.addSectionComponents(section([head, body].filter(Boolean).join('\n'), thumbnail));
  } else {
    if (head) c.addTextDisplayComponents(text(head));
    if (body) c.addTextDisplayComponents(text(body));
  }
  for (const r of rows) c.addActionRowComponents(r);
  if (footer) c.addTextDisplayComponents(text(sub(footer)));
  return c;
}

/**
 * Embed for places that need a real author line / footer
 * (logs, user lookups, snipes …). Grey unless an event kind is given.
 */
function embed({ kind = 'base', title, description, author, footer, thumbnail, image, fields, timestamp, url } = {}) {
  const e = new EmbedBuilder().setColor(COLOR[kind] ?? COLOR.base);
  if (title) e.setTitle(String(title).slice(0, 256));
  if (url) e.setURL(url);
  if (description) e.setDescription(String(description).slice(0, 4096));
  if (author) e.setAuthor(typeof author === 'string' ? { name: author } : author);
  if (footer) e.setFooter(typeof footer === 'string' ? { text: footer } : footer);
  if (thumbnail) e.setThumbnail(thumbnail);
  if (image) e.setImage(image);
  if (fields?.length) e.addFields(fields);
  if (timestamp) e.setTimestamp(timestamp === true ? new Date() : timestamp);
  return e;
}

// sending

const isInteraction = (t) => typeof t?.isRepliable === 'function' || typeof t?.deferReply === 'function';

/**
 * Send a components-v2 reply to a message OR an interaction.
 * Returns the sent Message.  `ephemeral` only applies to interactions.
 */
async function send(target, components, { ephemeral = false, extra = {} } = {}) {
  const list = Array.isArray(components) ? components : [components];
  let flags = MessageFlags.IsComponentsV2;
  if (isInteraction(target)) {
    if (ephemeral) flags |= MessageFlags.Ephemeral;
    const body = { components: list, flags, ...extra };
    if (target.deferred && !target.replied) return target.editReply({ components: list, ...extra, flags: MessageFlags.IsComponentsV2 });
    if (target.replied) return target.followUp(body);
    const res = await target.reply({ ...body, withResponse: true });
    return res?.resource?.message ?? target.fetchReply();
  }
  return target.reply({ components: list, flags, ...extra });
}

/** Reply with an embed (+ optional classic action rows). */
async function sendEmbed(target, embeds, { rows = [], ephemeral = false, extra = {} } = {}) {
  const list = Array.isArray(embeds) ? embeds : [embeds];
  const body = { embeds: list, components: rows, ...extra };
  if (isInteraction(target)) {
    if (ephemeral) body.flags = MessageFlags.Ephemeral;
    if (target.deferred && !target.replied) return target.editReply(body);
    if (target.replied) return target.followUp(body);
    const res = await target.reply({ ...body, withResponse: true });
    return res?.resource?.message ?? target.fetchReply();
  }
  return target.reply(body);
}

/** Quick event replies: ui.say.error(ctx, 'Missing permission') */
const say = {
  success: (t, m, o = {}) => send(t, success(m), o),
  warning: (t, m, o = {}) => send(t, warn(m), o),
  error:   (t, m, o = {}) => send(t, fail(m), { ephemeral: true, ...o }),
  info:    (t, m, o = {}) => send(t, info(m), o),
};

// interaction helpers

/** Collector filter that lets only `userId` through; others get a private note. */
function onlyUser(userId) {
  return async (i) => {
    if (i.user.id === userId) return true;
    try { await i.reply({ components: [fail('Not your menu')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }); } catch (_) {}
    return false;
  };
}

/** Confirm / cancel buttons (ids `${id}_yes` / `${id}_no`). */
const confirmRow = (id, { yes = 'Confirm', no = 'Cancel', danger = false } = {}) =>
  row(btn(`${id}_yes`, yes, { style: danger ? 'danger' : 'success' }), btn(`${id}_no`, no));

module.exports = {
  COLOR, ICON, DELETE_EMOJI, emojis,
  parseEmoji,
  box, text, sep, sub, section,
  btn, link, deleteBtn, row, select, confirmRow,
  notice, quiet, success, warn, fail, info, card, embed,
  send, sendEmbed, say, onlyUser,
};
