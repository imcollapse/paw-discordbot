// Developed by Cosmin
// paw · confessions.
// /confess sends an anonymous post to the confession channel, numbered, with up and down vote buttons.
// With a review channel set, every confession waits there for a moderator to approve or deny it first.
// The author is stored only so a moderator can ban them by confession number, nobody ever sees who it was.

const { MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const ui = require('./ui');
const emojis = require('./emojiMap');
const rt = require('./roleTools');
const { ConfessionConfig, Confession, ConfessionVote, ConfessionBan } = require('../database/schemas');

const V2 = MessageFlags.IsComponentsV2;
const NO = { parse: [], roles: [], users: [], repliedUser: false };
const MAX_LEN = 1800;
const INVITE = /(discord\.gg|discord(?:app)?\.com\/invite)\/\S+/i;
const lastAt = new Map();                       // guild:user -> time of the last confession (cooldown)

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const quote = (s) => s.split('\n').map((l) => `> ${l}`).join('\n');
const canReview = (i) => i.memberPermissions?.has(P.ManageMessages) || i.memberPermissions?.has(P.ManageGuild) || i.memberPermissions?.has(P.Administrator);
const canAdmin = (ctx) => (ctx.memberPermissions ?? ctx.member?.permissions)?.has(P.ManageGuild);

// cards

async function tally(confessionId) {
  const [up, down] = await Promise.all([
    ConfessionVote.count({ where: { confessionId, value: 1 } }),
    ConfessionVote.count({ where: { confessionId, value: -1 } }),
  ]);
  return { up, down };
}

function postCard(c) {
  const anon = emojis.customOf('confess_anon');
  return ui.box('base')
    .addTextDisplayComponents(ui.text(`### ${anon ? `${anon} ` : ''}anonymous confession #${c.number}`))
    .addTextDisplayComponents(ui.text(quote(clip(c.content, MAX_LEN))))
    .addTextDisplayComponents(ui.text(ui.sub('Type /confess to send a confession')));
}

function voteRow(c, { up, down }, disabled = false) {
  const upE = emojis.customOf('confess_up'), downE = emojis.customOf('confess_down');
  return ui.row(
    ui.btn(`cf:up:${c.id}`, upE ? String(up) : `Up ${up}`, { style: 'secondary', emoji: upE, disabled }),
    ui.btn(`cf:down:${c.id}`, downE ? String(down) : `Down ${down}`, { style: 'secondary', emoji: downE, disabled }),
  );
}

async function postComponents(c, votes) {
  const parts = [postCard(c)];
  if (votes) parts.push(voteRow(c, await tally(c.id)));
  return parts;
}

function reviewCard(c) {
  return ui.box('warning')
    .addTextDisplayComponents(ui.text('### Confession waiting for review'))
    .addTextDisplayComponents(ui.text(quote(clip(c.content, MAX_LEN))))
    .addTextDisplayComponents(ui.text(ui.sub('Sent anonymously. Approving posts it with the next number; the author stays hidden.')))
    .addActionRowComponents(ui.row(
      ui.btn(`cf:ok:${c.id}`, 'Approve', { style: 'success' }),
      ui.btn(`cf:no:${c.id}`, 'Deny', { style: 'secondary' }),
      ui.btn(`cf:ban:${c.id}`, 'Deny and ban author', { style: 'danger' }),
    ));
}

// config helpers

const getConfig = (guildId) => ConfessionConfig.findByPk(guildId);
async function ensureConfig(guildId) { const [c] = await ConfessionConfig.findOrCreate({ where: { guildId } }); return c; }

// posting

/** Number the confession, send it to the confession channel, remember the message. */
async function publish(guild, confession) {
  const cfg = await getConfig(guild.id);
  const channel = cfg?.channelId && guild.channels.cache.get(cfg.channelId);
  if (!channel?.isTextBased?.()) throw new Error('The confession channel is missing.');
  const me = guild.members.me;
  if (!channel.permissionsFor(me)?.has(['ViewChannel', 'SendMessages'])) throw new Error(`I can't send messages in ${channel}.`);

  await cfg.increment('nextNumber');
  await cfg.reload();
  confession.number = cfg.nextNumber - 1;

  const msg = await channel.send({ components: await postComponents(confession, cfg.votes), flags: V2, allowedMentions: NO });
  await confession.update({ number: confession.number, status: 'posted', channelId: channel.id, messageId: msg.id });
  return msg;
}

/** `/confess`: validate, then post or send for review. */
async function submit(interaction, rawText) {
  const guild = interaction.guild;
  const reply = (kind, text) => interaction.reply({ components: [ui.notice(kind, text)], flags: V2 | MessageFlags.Ephemeral, allowedMentions: NO });
  if (!guild) return reply('error', 'Use this in a server.');

  const cfg = await getConfig(guild.id);
  if (!cfg?.channelId || !cfg.enabled) return reply('error', 'Confessions are not turned on in this server.');
  if (await ConfessionBan.findOne({ where: { guildId: guild.id, userId: interaction.user.id } })) {
    return reply('error', 'You can no longer send confessions here.');
  }

  const key = `${guild.id}:${interaction.user.id}`;
  const wait = (lastAt.get(key) ?? 0) + cfg.cooldown * 1000 - Date.now();
  if (wait > 0) return reply('warning', `Slow down. You can confess again in ${Math.ceil(wait / 1000)}s.`);

  const content = String(rawText || '').trim();
  if (!content) return reply('error', 'Write something first.');
  if (content.length > MAX_LEN) return reply('error', `That is too long. The limit is ${MAX_LEN} characters.`);
  if (INVITE.test(content)) return reply('error', 'Invite links are not allowed in confessions.');

  lastAt.set(key, Date.now());
  const confession = await Confession.create({ guildId: guild.id, authorId: interaction.user.id, content, status: 'pending' });

  try {
    if (cfg.reviewChannelId) {
      const review = guild.channels.cache.get(cfg.reviewChannelId);
      if (!review?.isTextBased?.()) throw new Error('The review channel is missing.');
      await review.send({ components: [reviewCard(confession)], flags: V2, allowedMentions: NO });
      return reply('success', 'Your confession was sent to the moderators for review. It stays anonymous.');
    }
    const msg = await publish(guild, confession);
    return reply('success', `Your confession was posted anonymously as #${confession.number}. ${msg.url}`);
  } catch (e) {
    await confession.destroy().catch(() => {});
    lastAt.delete(key);
    return reply('error', `Couldn't send that: ${e.message}`);
  }
}

// buttons

async function vote(interaction, id, value) {
  const c = await Confession.findByPk(id);
  if (!c || c.status !== 'posted') return interaction.reply({ components: [ui.fail('That confession is gone.')], flags: V2 | MessageFlags.Ephemeral });
  const where = { confessionId: c.id, userId: interaction.user.id };
  const existing = await ConfessionVote.findOne({ where });
  if (existing && existing.value === value) await existing.destroy();               // same button again takes the vote back
  else if (existing) await existing.update({ value });
  else await ConfessionVote.create({ ...where, value });
  return interaction.update({ components: [postCard(c), voteRow(c, await tally(c.id))], flags: V2, allowedMentions: NO });
}

async function review(interaction, id, action) {
  const eph = V2 | MessageFlags.Ephemeral;
  if (!canReview(interaction)) return interaction.reply({ components: [ui.fail('You need Manage Messages to review confessions.')], flags: eph });
  const c = await Confession.findByPk(id);
  if (!c || c.status !== 'pending') {
    return interaction.update({ components: [ui.notice('base', 'This confession was already handled.')], flags: V2, allowedMentions: NO });
  }
  const who = `<@${interaction.user.id}>`;
  if (action === 'ok') {
    try { await publish(interaction.guild, c); }
    catch (e) { return interaction.reply({ components: [ui.fail(`Couldn't post it: ${e.message}`)], flags: eph }); }
    return interaction.update({ components: [ui.notice('success', `Approved by ${who} and posted as #${c.number}.`)], flags: V2, allowedMentions: NO });
  }
  await c.update({ status: 'denied' });
  if (action === 'ban') {
    await ConfessionBan.findOrCreate({ where: { guildId: c.guildId, userId: c.authorId } });
    return interaction.update({ components: [ui.notice('error', `Denied by ${who}. The author can no longer confess here.`)], flags: V2, allowedMentions: NO });
  }
  return interaction.update({ components: [ui.notice('warning', `Denied by ${who}.`)], flags: V2, allowedMentions: NO });
}

// admin command

const textChannel = (ch) => ch?.isTextBased?.() && !ch.isVoiceBased?.() && ch.guild;

async function run(ctx, sub, a) {
  const guild = ctx.guild;
  if (!guild) return rt.bad(ctx, 'Use this in a server.');
  if (!canAdmin(ctx)) return rt.bad(ctx, 'you need the **Manage Server** permission~');

  if (sub === 'setup') {
    if (!textChannel(a.channel)) return rt.bad(ctx, 'Pick a text channel for the confessions.');
    if (a.review && !textChannel(a.review)) return rt.bad(ctx, 'The review channel has to be a text channel.');
    const cfg = await ensureConfig(guild.id);
    await cfg.update({ channelId: a.channel.id, reviewChannelId: a.review?.id ?? null, enabled: true });
    return rt.ok(ctx, `Confessions go to ${a.channel}${a.review ? `, and wait for approval in ${a.review}` : ''}. Members use \`/confess\`.`);
  }

  const cfg = await getConfig(guild.id);
  if (!cfg) return rt.bad(ctx, 'Run the setup first: `confessions setup <channel> [review channel]`.');

  switch (sub) {
    case 'enable': await cfg.update({ enabled: true }); return rt.ok(ctx, 'Confessions are on.');
    case 'disable': await cfg.update({ enabled: false }); return rt.warn(ctx, 'Confessions are off.');
    case 'votes': await cfg.update({ votes: !!a.on }); return rt.ok(ctx, `Vote buttons are ${a.on ? 'on' : 'off'} for new confessions.`);
    case 'review':
      if (a.review && !textChannel(a.review)) return rt.bad(ctx, 'The review channel has to be a text channel.');
      await cfg.update({ reviewChannelId: a.review?.id ?? null });
      return rt.ok(ctx, a.review ? `Confessions now wait for approval in ${a.review}.` : 'Confessions are posted straight away, no review.');
    case 'cooldown': {
      const s = Math.min(Math.max(Number(a.seconds) || 0, 0), 86400);
      await cfg.update({ cooldown: s });
      return rt.ok(ctx, `Each person can confess once every ${s} seconds.`);
    }
    case 'ban': case 'unban': {
      const c = await Confession.findOne({ where: { guildId: guild.id, number: Number(a.number) } });
      if (!c) return rt.bad(ctx, 'No confession has that number.');
      if (sub === 'ban') { await ConfessionBan.findOrCreate({ where: { guildId: guild.id, userId: c.authorId } }); return rt.ok(ctx, `The author of #${c.number} can no longer confess here. You still don't know who it is.`); }
      await ConfessionBan.destroy({ where: { guildId: guild.id, userId: c.authorId } });
      return rt.ok(ctx, `The author of #${c.number} can confess again.`);
    }
    case 'config': default: {
      const posted = await Confession.count({ where: { guildId: guild.id, status: 'posted' } });
      const banned = await ConfessionBan.count({ where: { guildId: guild.id } });
      return ui.send(ctx, [ui.card({
        title: 'Confessions',
        lines: [
          `**Status** ${cfg.enabled ? 'on' : 'off'}`,
          `**Channel** ${cfg.channelId ? `<#${cfg.channelId}>` : 'not set'}`,
          `**Review** ${cfg.reviewChannelId ? `<#${cfg.reviewChannelId}>` : 'off, posted straight away'}`,
          `**Votes** ${cfg.votes ? 'on' : 'off'}`,
          `**Cooldown** ${cfg.cooldown}s`,
          `**Posted** ${posted} · **Banned** ${banned}`,
        ],
      })], { extra: { allowedMentions: NO } });
    }
  }
}

module.exports = { submit, vote, review, run, publish, getConfig };
