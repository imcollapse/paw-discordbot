// Developed by Cosmin
// paw — user and server info: one small container each, no colours, nothing that is not needed.
// userinfo   Overview · Roles · Assets (buttons switch the view in place)
// serverinfo name, owner, age, verification, the counts and the image links

const { ChannelType, MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const ui = require('./ui');

const V2 = MessageFlags.IsComponentsV2;
const NO_PINGS = { parse: [] };

const ts = (ms) => Math.floor(ms / 1000);
const quote = (lines) => lines.map(l => `> ${l}`).join('\n');
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

const membersFetched = new Map(); // guildId → last full fetch
async function ensureMembers(guild) {
  if (guild.members.cache.size >= guild.memberCount) return;
  if (guild.memberCount > 5000) return;
  if (Date.now() - (membersFetched.get(guild.id) || 0) < 6e5) return;
  membersFetched.set(guild.id, Date.now());
  await guild.members.fetch({ time: 8000 }).catch(() => null);
}

// user

async function sendUserInfo(ctx, guild, user, tr = require('../localization').translatorFor('en')) {
  const asker = ctx.user ?? ctx.author;
  const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
  const full = await user.fetch().catch(() => null);
  const name = member?.displayName ?? user.displayName ?? user.username;
  const avatar = user.displayAvatarURL({ extension: 'png', size: 512 });

  let position = null;
  if (member?.joinedTimestamp) {
    await ensureMembers(guild);
    const sorted = [...guild.members.cache.values()].filter(m => m.joinedTimestamp).sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
    const at = sorted.findIndex(m => m.id === member.id);
    if (at >= 0) position = at + 1;
  }
  const roles = member ? [...member.roles.cache.values()].filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position) : [];

  const state = { view: 'overview' };

  function overview() {
    const dates = member?.joinedTimestamp
      ? `<t:${ts(user.createdTimestamp)}:D> → <t:${ts(member.joinedTimestamp)}:D>`
      : `<t:${ts(user.createdTimestamp)}:D>`;
    const head = [`### ${name}`, ui.sub(`${name} (@${user.username})`), dates].join('\n');
    const facts = [tr('info.accountCreated', { when: `<t:${ts(user.createdTimestamp)}:R>` })];
    if (position) facts.push(tr('info.memberOf', { n: position, server: guild.name }));
    if (member) facts.push(tr('info.rolesCount', { count: roles.length }));
    if (user.bot) facts.push(tr('info.bot'));
    return [
      ['section', ui.section(head, avatar)],
      ['sep', ui.sep()],
      ['text', ui.text(`**${tr('info.overview')}**\n${quote(facts)}\n${ui.sub(`${tr('info.id')} ${user.id}`)}`)],
    ];
  }

  function rolesView() {
    const shown = roles.slice(0, 40).map(r => `<@&${r.id}>`).join(' ');
    const body = roles.length
      ? shown + (roles.length > 40 ? ` ${tr('info.moreRoles', { count: roles.length - 40 })}` : '')
      : tr('info.noRoles');
    return [['text', ui.text(`### ${name}`)], ['sep', ui.sep()], ['text', ui.text(`**${tr('info.roles', { count: roles.length })}**\n${body}`)]];
  }

  function assetsView() {
    const entries = [[tr('info.avatar'), user.displayAvatarURL({ extension: 'png', size: 1024 })]];
    const own = member?.avatar ? member.displayAvatarURL({ extension: 'png', size: 1024 }) : null;
    if (own) entries.push([tr('info.serverAvatar'), own]);
    const banner = full?.banner ? full.bannerURL({ extension: 'png', size: 1024 }) : null;
    if (banner) entries.push([tr('info.banner'), banner]);

    const gallery = new MediaGalleryBuilder().addItems(entries.slice(0, 3).map(([, url]) => new MediaGalleryItemBuilder().setURL(url)));
    return [
      ['text', ui.text(`### ${name}`)], ['sep', ui.sep()],
      ['text', ui.text(`**${tr('info.assets')}**\n${quote(entries.map(([label, url]) => `[${label}](${url})`))}`)],
      ['gallery', gallery],
    ];
  }

  const VIEWS = { overview, roles: rolesView, assets: assetsView };
  const TABS = [['overview', tr('info.overview')], ['roles', tr('info.rolesLabel')], ['assets', tr('info.assets')]];

  function build(disabled = false) {
    const c = ui.box();
    for (const [kind, part] of VIEWS[state.view]()) {
      if (kind === 'section') c.addSectionComponents(part);
      else if (kind === 'sep') c.addSeparatorComponents(part);
      else if (kind === 'gallery') c.addMediaGalleryComponents(part);
      else c.addTextDisplayComponents(part);
    }
    c.addSeparatorComponents(ui.sep());
    c.addActionRowComponents(ui.row(TABS.map(([key, label]) =>
      ui.btn(`uinfo_${key}`, label, { style: state.view === key ? 'primary' : 'secondary', disabled: disabled || state.view === key }))));
    return c;
  }

  const msg = await ui.send(ctx, build(), { extra: { allowedMentions: NO_PINGS } });
  if (!msg?.createMessageComponentCollector) return msg;

  const collector = msg.createMessageComponentCollector({ filter: ui.onlyUser(asker.id), time: 300000 });
  collector.on('collect', async (i) => {
    try {
      state.view = i.customId.replace('uinfo_', '');
      if (!VIEWS[state.view]) state.view = 'overview';
      await i.update({ components: [build()], flags: V2, allowedMentions: NO_PINGS });
    } catch (_) { /* expired */ }
  });
  collector.on('end', () => { msg.edit({ components: [build(true)], flags: V2, allowedMentions: NO_PINGS }).catch(() => {}); });
  return msg;
}

// server

async function sendServerInfo(ctx, guild, tr = require('../localization').translatorFor('en')) {
  await ensureMembers(guild);
  const owner = await guild.fetchOwner().catch(() => null);
  const icon = guild.iconURL({ extension: 'png', size: 512 });
  const channels = guild.channels.cache.filter(c => !c.isThread() && c.type !== ChannelType.GuildCategory).size;
  const verification = tr(`info.verif.${['none', 'low', 'medium', 'high', 'veryHigh'][guild.verificationLevel] ?? 'unknown'}`);

  const facts = [
    owner ? tr('info.ownedByUser', { owner: `<@${owner.id}>` }) : null,
    tr('info.createdWhen', { when: `<t:${ts(guild.createdTimestamp)}:R>` }),
    tr('info.verificationLine', { level: verification }),
  ].filter(Boolean).join(' • ');

  const lines = [
    `### ${guild.name}`,
    facts,
    guild.description ? clip(guild.description, 110) : null,
    '',
    `\`${guild.memberCount}\` ${tr('info.membersShort')}`,
    `\`${channels}\` ${tr('info.channelsShort')}`,
    `\`${guild.roles.cache.size}\` ${tr('info.rolesLabel')}`,
    tr('info.boostsLine', { count: `\`${guild.premiumSubscriptionCount ?? 0}\``, level: guild.premiumTier }),
  ].filter(l => l !== null).join('\n');

  const c = ui.box();
  c.addSectionComponents(ui.section(lines, icon));

  const links = [];
  if (icon) links.push(ui.link(tr('info.iconBtn'), guild.iconURL({ extension: 'png', size: 1024 })));
  if (guild.banner) links.push(ui.link(tr('info.banner'), guild.bannerURL({ extension: 'png', size: 1024 })));
  if (guild.splash) links.push(ui.link(tr('info.splashBtn'), guild.splashURL({ extension: 'png', size: 1024 })));
  if (links.length) c.addActionRowComponents(ui.row(...links));

  return ui.send(ctx, c, { extra: { allowedMentions: NO_PINGS } });
}

module.exports = { sendUserInfo, sendServerInfo };
