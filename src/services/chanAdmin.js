// Developed by Cosmin
// paw — everyday channel commands (prefix only, so they take no slash slots):
// nsfw · sfw · channelname · settopic · createchannel · deletechannel · setcategory · syncperms · limit
// Each one needs Manage Channels for you and for me, answers with one short line, and never pings.

const { PermissionFlagsBits: P, ChannelType: T, ComponentType, MessageFlags } = require('discord.js');
const ui = require('./ui');

const NO_PING = { parse: [] };
const V2 = MessageFlags.IsComponentsV2;
const THREADS = [T.PublicThread, T.PrivateThread, T.AnnouncementThread];
const TEXTY = [T.GuildText, T.GuildAnnouncement, T.GuildForum, T.GuildMedia];
const VOICY = [T.GuildVoice, T.GuildStageVoice];

const reply = (message, c) => ui.send(message, c, { extra: { allowedMentions: NO_PING } });
const ok = (message, line) => reply(message, ui.success(line));
const bad = (message, line) => reply(message, ui.fail(line));
const reasonFor = (message, what) => `${what} | by ${message.author.tag ?? message.author.username}`.slice(0, 500);

function explain(e) {
  if (e?.code === 50013) return "i'm missing a permission for that. i need **Manage Channels**.";
  if (e?.code === 30013 || e?.code === 30005) return 'this server has hit a channel limit.';
  if (e?.code === 50074) return "that's a Community channel (rules / updates). change it in Server Settings → Community first.";
  if (e?.code === 10003) return 'that channel no longer exists.';
  return 'something went wrong, please try again.';
}

/** Find a channel from a mention, an id or `#name`. */
async function find(guild, raw) {
  if (!raw) return null;
  const id = raw.match(/^<#(\d{17,20})>$/)?.[1] ?? raw.match(/^\d{17,20}$/)?.[0];
  if (id) return guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
  const name = raw.replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find(c => !THREADS.includes(c.type) && c.name?.toLowerCase() === name) ?? null;
}

/** Leading channel argument (optional) and the rest. */
async function split(message, args) {
  const found = args[0] ? await find(message.guild, args[0]) : null;
  return found && !THREADS.includes(found.type) ? { channel: found, rest: args.slice(1) } : { channel: message.channel, rest: args };
}

const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

const SPEC = {
  nsfw: {
    desc: 'Mark a channel as age-restricted (NSFW)', usage: 'nsfw [channel]', aliases: [],
    async run(message, args) {
      const { channel } = await split(message, args);
      if (![...TEXTY, ...VOICY].includes(channel.type)) return bad(message, "that channel type can't be age-restricted.");
      if (channel.nsfw) return reply(message, ui.warn(`${channel} is already marked as **NSFW**`));
      await channel.setNSFW(true, reasonFor(message, 'nsfw'));
      return ok(message, `${message.author}: marked ${channel} as **NSFW**`);
    },
  },
  sfw: {
    desc: 'Remove the age restriction (NSFW) from a channel', usage: 'sfw [channel]', aliases: [],
    async run(message, args) {
      const { channel } = await split(message, args);
      if (![...TEXTY, ...VOICY].includes(channel.type)) return bad(message, "that channel type can't be age-restricted.");
      if (!channel.nsfw) return reply(message, ui.warn(`${channel} is already **SFW**`));
      await channel.setNSFW(false, reasonFor(message, 'sfw'));
      return ok(message, `${message.author}: marked ${channel} as **SFW**`);
    },
  },
  channelname: {
    desc: 'Rename a channel', usage: 'channelname [channel] <new name>', aliases: ['chname', 'renamechannel'],
    async run(message, args) {
      const { channel, rest } = await split(message, args);
      const name = (VOICY.includes(channel.type) ? rest.join(' ').trim().slice(0, 100) : slug(rest.join(' ')));
      if (!name) return bad(message, 'tell me the new name, like `channelname #general chat`.');
      const before = channel.name;
      await channel.setName(name, reasonFor(message, 'rename'));
      return ok(message, `renamed **${before}** to ${channel}`);
    },
  },
  settopic: {
    desc: 'Set a channel topic, or clear it with `clear`', usage: 'settopic [channel] <text | clear>', aliases: ['channeltopic'],
    async run(message, args) {
      const { channel, rest } = await split(message, args);
      if (![T.GuildText, T.GuildAnnouncement, T.GuildForum, T.GuildMedia].includes(channel.type)) return bad(message, "that channel type doesn't have a topic.");
      const text = rest.join(' ').trim();
      if (!text) return bad(message, 'write the topic, or say `clear` to remove it.');
      const clear = text.toLowerCase() === 'clear';
      await channel.setTopic(clear ? null : text.slice(0, 1024), reasonFor(message, 'topic'));
      return ok(message, clear ? `cleared the topic of ${channel}` : `topic of ${channel} updated`);
    },
  },
  createchannel: {
    desc: 'Create a channel: text, voice, category, forum, announcement or stage', usage: 'createchannel <type> <name>', aliases: ['mkchannel', 'newchannel'],
    async run(message, args) {
      const types = { text: T.GuildText, voice: T.GuildVoice, category: T.GuildCategory, forum: T.GuildForum, announcement: T.GuildAnnouncement, news: T.GuildAnnouncement, stage: T.GuildStageVoice };
      const kind = (args[0] || '').toLowerCase();
      if (!(kind in types)) return bad(message, 'pick a type: `text`, `voice`, `category`, `forum`, `announcement` or `stage`.');
      const raw = args.slice(1).join(' ').trim();
      const name = [T.GuildVoice, T.GuildStageVoice, T.GuildCategory].includes(types[kind]) ? raw.slice(0, 100) : slug(raw);
      if (!name) return bad(message, 'give it a name, like `createchannel text general-chat`.');
      const parent = message.channel.parentId && types[kind] !== T.GuildCategory ? message.channel.parentId : undefined;
      const fresh = await message.guild.channels.create({ name, type: types[kind], parent, reason: reasonFor(message, 'create') });
      return ok(message, `created ${fresh}`);
    },
  },
  deletechannel: {
    desc: 'Delete a channel (asks first)', usage: 'deletechannel [channel]', aliases: ['delchannel', 'rmchannel'],
    async run(message, args) {
      const { channel } = await split(message, args);
      const g = message.guild;
      if ([g.rulesChannelId, g.publicUpdatesChannelId, g.safetyAlertsChannelId].includes(channel.id)) return bad(message, explain({ code: 50074 }));
      const ask = ui.box('error')
        .addTextDisplayComponents(ui.text(`### delete ${channel.name}?`), ui.text(`${channel} and everything in it will be gone for good.\n-# this can't be undone`))
        .addSeparatorComponents(ui.sep())
        .addActionRowComponents(ui.row(ui.btn('chdel_yes', 'delete', { style: 'danger' }), ui.btn('chdel_no', 'keep it')));
      const msg = await reply(message, ask);
      if (typeof msg?.createMessageComponentCollector !== 'function') return msg;
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000, max: 1, filter: ui.onlyUser(message.author.id) });
      let answered = false;
      col.on('collect', async (i) => {
        answered = true;
        if (i.customId === 'chdel_no') return i.update({ components: [ui.info(`${channel} stays~`)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
        try {
          const name = channel.name, same = channel.id === message.channel.id;
          await channel.delete(reasonFor(message, 'delete'));
          if (!same) await i.update({ components: [ui.success(`poof, **${name}** is gone`)], flags: V2 });
        } catch (e) { await i.update({ components: [ui.fail(explain(e))], flags: V2 }).catch(() => {}); }
      });
      col.on('end', () => { if (!answered) msg.edit({ components: [ui.info('no answer, so i left it alone')], flags: V2 }).catch(() => {}); });
      return msg;
    },
  },
  setcategory: {
    desc: 'Move a channel into a category (or `none`)', usage: 'setcategory [channel] <category | none>', aliases: ['movechannel'],
    async run(message, args) {
      const { channel, rest } = await split(message, args);
      const raw = rest.join(' ').trim();
      if (!raw) return bad(message, 'name the category, or say `none` to move it out.');
      if (channel.type === T.GuildCategory) return bad(message, "categories can't live inside categories.");
      let parent = null;
      if (raw.toLowerCase() !== 'none') {
        const id = raw.match(/\d{17,20}/)?.[0];
        parent = id ? message.guild.channels.cache.get(id) : message.guild.channels.cache.find(c => c.type === T.GuildCategory && c.name.toLowerCase() === raw.toLowerCase());
        if (!parent || parent.type !== T.GuildCategory) return bad(message, "i couldn't find that category.");
      }
      await channel.setParent(parent?.id ?? null, { lockPermissions: false, reason: reasonFor(message, 'move') });
      return ok(message, parent ? `moved ${channel} to **${parent.name}**` : `moved ${channel} out of its category`);
    },
  },
  syncperms: {
    desc: "Make a channel's permissions match its category", usage: 'syncperms [channel]', aliases: [],
    async run(message, args) {
      const { channel } = await split(message, args);
      if (!channel.parentId) return bad(message, `${channel} isn't in a category.`);
      await channel.lockPermissions();
      return ok(message, `${channel} now follows **${channel.parent?.name ?? 'its category'}**`);
    },
  },
  limit: {
    desc: 'Set the user limit of a voice channel (0 removes it)', usage: 'limit <0-99> [voice channel]', aliases: ['userlimit', 'vclimit'],
    async run(message, args) {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 0 || n > 99) return bad(message, 'pick a number from 0 to 99, where 0 means no limit.');
      const named = args[1] ? await find(message.guild, args.slice(1).join(' ')) : null;
      const vc = named ?? message.member?.voice?.channel;
      if (!vc || !VOICY.includes(vc.type)) return bad(message, 'join a voice channel or name one, like `limit 5 #lounge`.');
      await vc.setUserLimit(n, reasonFor(message, 'limit'));
      return ok(message, n ? `${vc} now holds up to **${n}**` : `${vc} has no limit anymore`);
    },
  },
};

function define(name) {
  const s = SPEC[name];
  return {
    name,
    description: s.desc,
    usage: s.usage,
    aliases: s.aliases,
    category: 'moderation',
    async execute(message, args = []) {
      if (!message.guild) return bad(message, 'use this in a server.');
      if (!message.member?.permissions.has(P.ManageChannels)) return bad(message, 'you need **Manage Channels** for that.');
      if (!message.guild.members.me?.permissions.has(P.ManageChannels)) return bad(message, 'i need **Manage Channels** for that.');
      try { return await s.run(message, args); }
      catch (e) { return bad(message, explain(e)); }
    },
  };
}

module.exports = { define, SPEC };
