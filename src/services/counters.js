// Developed by Cosmin
// paw · counter channels: voice channels whose name keeps a live number ("Members: 12480").
// Discord lets a channel be renamed about twice every ten minutes, so names refresh on a timer and only when the number changed.

const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const ui = require('./ui');
const rt = require('./roleTools');
const { Counter } = require('../database/schemas');

const REFRESH_MS = 6 * 60 * 1000;
const FETCH_EVERY = 30 * 60 * 1000;
const lastFetch = new Map();                    // guildId -> last full member fetch (bots and humans need every member)

const TYPES = {
  members:  { label: 'Members',  template: 'Members: {count}',  text: 'everyone in the server' },
  humans:   { label: 'Humans',   template: 'Humans: {count}',   text: 'members that are not bots' },
  bots:     { label: 'Bots',     template: 'Bots: {count}',     text: 'bots in the server' },
  boosts:   { label: 'Boosts',   template: 'Boosts: {count}',   text: 'server boosts' },
  channels: { label: 'Channels', template: 'Channels: {count}', text: 'channels, not counting categories' },
  roles:    { label: 'Roles',    template: 'Roles: {count}',    text: 'roles, not counting @everyone' },
};
const TYPE_NAMES = Object.keys(TYPES);

async function countOf(guild, type) {
  if (type === 'members') return guild.memberCount;
  if (type === 'boosts') return guild.premiumSubscriptionCount ?? 0;
  if (type === 'channels') return guild.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).size;
  if (type === 'roles') return Math.max(0, guild.roles.cache.size - 1);
  // humans and bots need the whole member list; fetch it now and then, otherwise use what is cached
  if (guild.members.cache.size < guild.memberCount && Date.now() - (lastFetch.get(guild.id) ?? 0) > FETCH_EVERY) {
    lastFetch.set(guild.id, Date.now());
    await guild.members.fetch().catch(() => {});
  }
  const bots = guild.members.cache.filter((m) => m.user.bot).size;
  return type === 'bots' ? bots : Math.max(0, guild.memberCount - bots);
}

const nameFor = (template, count) => template.replace(/\{count\}/gi, String(count)).slice(0, 100);

/** Bring one counter channel up to date. Removes the row when the channel was deleted. */
async function refresh(guild, row) {
  const channel = guild.channels.cache.get(row.channelId);
  if (!channel) { await row.destroy().catch(() => {}); return false; }
  const name = nameFor(row.template, await countOf(guild, row.type));
  if (name === channel.name) return false;
  try { await channel.setName(name, 'Counter update'); await row.update({ lastName: name }); return true; }
  catch (e) { console.warn(`[counters] ${guild.id} ${row.type}: ${e.message}`); return false; }
}

async function refreshGuild(guild) {
  const rows = await Counter.findAll({ where: { guildId: guild.id } });
  for (const row of rows) await refresh(guild, row);
  return rows.length;
}

async function sweep(client) {
  const guilds = await Counter.findAll({ attributes: ['guildId'], group: ['guildId'] }).catch(() => []);
  for (const { guildId } of guilds) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) await refreshGuild(guild).catch((e) => console.warn('[counters]', e.message));
  }
}

function start(client) {
  setTimeout(() => sweep(client), 20_000);       // after the cache has filled
  setInterval(() => sweep(client), REFRESH_MS);
}

// admin command

async function run(ctx, sub, a) {
  const guild = ctx.guild;
  if (!guild) return rt.bad(ctx, 'Use this in a server.');
  const perms = ctx.memberPermissions ?? ctx.member?.permissions;
  if (!perms?.has(P.ManageChannels)) return rt.bad(ctx, 'you need the **Manage Channels** permission~');

  if (sub === 'add') {
    const type = String(a.type || '').toLowerCase();
    if (!TYPES[type]) return rt.bad(ctx, `Pick a type: ${TYPE_NAMES.map((t) => `\`${t}\``).join(', ')}.`);
    if (!guild.members.me.permissions.has(P.ManageChannels)) return rt.bad(ctx, 'I need the **Manage Channels** permission to create the channel.');
    if (await Counter.findOne({ where: { guildId: guild.id, type } })) return rt.bad(ctx, `There is already a ${type} counter. Remove it first, or change its text with \`counters template\`.`);

    const template = (a.template || TYPES[type].template).slice(0, 90);
    if (!/\{count\}/i.test(template)) return rt.bad(ctx, 'The text needs `{count}` where the number goes, for example `Members: {count}`.');
    const channel = await guild.channels.create({
      name: nameFor(template, await countOf(guild, type)),
      type: ChannelType.GuildVoice,
      parent: a.category?.type === ChannelType.GuildCategory ? a.category.id : null,
      permissionOverwrites: [{ id: guild.id, allow: [P.ViewChannel], deny: [P.Connect] }],     // visible, but nobody can join
      reason: `Counter by ${ctx.user?.tag ?? ctx.author?.tag}`,
    }).catch((e) => { rt.bad(ctx, `Couldn't create the channel: ${e.message}`); return null; });
    if (!channel) return null;
    await Counter.create({ guildId: guild.id, channelId: channel.id, type, template, lastName: channel.name });
    return rt.ok(ctx, `Created ${channel}. It updates by itself every few minutes.`);
  }

  if (sub === 'list' || !sub) {
    const rows = await Counter.findAll({ where: { guildId: guild.id } });
    if (!rows.length) return rt.send(ctx, ui.card({ title: 'Counters', lines: ['No counters yet.', ui.sub('Add one with `counters add members`')] }));
    return rt.send(ctx, ui.card({
      title: 'Counters',
      lines: [...rows.map((r) => `**${TYPES[r.type]?.label ?? r.type}** <#${r.channelId}> \`${r.template}\``), '', ui.sub(`Types: ${TYPE_NAMES.join(', ')}`)],
    }));
  }

  const type = String(a.type || '').toLowerCase();
  const row = await Counter.findOne({ where: { guildId: guild.id, type } });

  if (sub === 'remove') {
    if (!row) return rt.bad(ctx, `There is no ${type || 'matching'} counter.`);
    const channel = guild.channels.cache.get(row.channelId);
    await row.destroy();
    if (a.keep !== true && channel?.manageable !== false) await channel?.delete('Counter removed').catch(() => {});
    return rt.ok(ctx, `Removed the ${type} counter.`);
  }
  if (sub === 'template') {
    if (!row) return rt.bad(ctx, `There is no ${type || 'matching'} counter.`);
    const template = String(a.template || '').slice(0, 90);
    if (!/\{count\}/i.test(template)) return rt.bad(ctx, 'The text needs `{count}` where the number goes, for example `Members: {count}`.');
    await row.update({ template, lastName: null });
    await refresh(guild, row);
    return rt.ok(ctx, `The ${type} counter now reads \`${template}\`.`);
  }
  if (sub === 'refresh') { const n = await refreshGuild(guild); return rt.ok(ctx, `Updated ${n} counter${n === 1 ? '' : 's'}. Discord limits renames to about two every ten minutes.`); }
  return rt.bad(ctx, 'Try `add`, `list`, `template`, `remove` or `refresh`.');
}

module.exports = { TYPES, TYPE_NAMES, run, start, sweep, refreshGuild };
