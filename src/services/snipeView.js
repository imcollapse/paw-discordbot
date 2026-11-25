// Developed by Cosmin
// paw — snipe and editsnipe views (shared by both commands).
// latest · list · user · channel · files · number · clear

const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { createPaginationSession } = require('./pagination');

const V2 = MessageFlags.IsComponentsV2;
const stores = () => require('../modules/interactions/general/general');
const storeOf = (kind) => (kind === 'edit' ? stores().editSnipeData : stores().snipeData);

const quote = (t) => String(t || '*no text*').slice(0, 1000).replace(/\n/g, '\n> ');
const links = (list) => (list?.length ? list.map(a => `[${a.name}](${a.url})`).join('\n') : '');

function card(kind, e, i = 0, total = 1) {
  const c = new ContainerBuilder();
  const when = kind === 'edit' ? e.edited_at : e.deleted_at;
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `### ${kind === 'edit' ? 'Edited message' : 'Deleted message'}${total > 1 ? `  ·  ${i + 1}/${total}` : ''}\n` +
    `<@${e.author_id}>  ·  <t:${when}:R>`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  if (kind === 'edit') {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Before**\n> ${quote(e.content_before)}\n**After**\n> ${quote(e.content_after)}`));
    const f = links(e.attachments_before);
    if (f) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Files**\n${f}`));
  } else {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`> ${quote(e.content)}`));
    const f = links(e.attachments);
    if (f) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Files**\n${f}`));
  }
  return c;
}

const note = (text) => new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

/**
 * ctx: message or interaction. opts: { sub, user, channel, number }
 * Slash callers must have deferred the reply already.
 */
async function show(ctx, kind, { sub = 'all', user = null, channel = null, number = null } = {}) {
  const isSlash = !!ctx.isChatInputCommand?.();
  const author = isSlash ? ctx.user : ctx.author;
  const reply = (c) => (isSlash ? ctx.editReply({ components: [c], flags: V2 }) : ctx.reply({ components: [c], flags: V2, allowedMentions: { parse: [] } }));
  const noun = kind === 'edit' ? 'edited' : 'deleted';
  const here = ctx.channel;

  const target = channel || here;
  if (channel && channel.id !== here.id) {
    const can = channel.permissionsFor?.(ctx.member)?.has(PermissionFlagsBits.ViewChannel);
    if (!can) return reply(note('You can only snipe channels you can see'));
  }
  const all = storeOf(kind).get(target.id) || [];

  if (sub === 'clear') {
    if (!ctx.member.permissions.has(PermissionFlagsBits.ManageMessages)) return reply(note('You need **Manage Messages** to clear this'));
    storeOf(kind).delete(target.id);
    return reply(note(`Cleared ${all.length} ${noun} message${all.length === 1 ? '' : 's'} from ${target}`));
  }

  let list = all;
  let empty = `No recently ${noun} messages in ${target}`;
  if (sub === 'user') {
    if (!user) return reply(note('Mention a user, like `snipe user @someone`'));
    list = all.filter(e => e.author_id === user.id);
    empty = `No recently ${noun} messages from ${user.username} in ${target}`;
  }
  if (sub === 'files') {
    list = all.filter(e => (kind === 'edit' ? e.attachments_before : e.attachments)?.length);
    empty = `No ${noun} messages with files in ${target}`;
  }
  if (sub === 'number') {
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1) return reply(note('Give a number, like `snipe number 3`'));
    if (!all[n - 1]) return reply(note(`There are only ${all.length} ${noun} message${all.length === 1 ? '' : 's'} saved here`));
    return reply(card(kind, all[n - 1], n - 1, all.length));
  }
  if (!list.length) return reply(note(empty));
  if (sub === 'latest') return reply(card(kind, list[0]));

  // list, user, files, channel, and plain `snipe`: page through them
  const session = createPaginationSession({
    interactionOrMessage: ctx,
    pages: list,
    renderPage: (i, e) => card(kind, e, i, list.length),
    userId: author.id,
    timeout: 300000,
  });
  return session.renderInitial();
}

module.exports = { show };
