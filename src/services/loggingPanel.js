// Developed by Cosmin
// paw — logging setup. One container, every log type in it, a Set button per type.
// The button opens a small form with the channel picker inside, so setup is one tap + one pick.

const ui = require('./ui');
const K = require('./guardKit');
const { LoggingConfig, GuildConfig } = require('../database/schemas');

const { D, V2 } = K;

const CATEGORIES = [
  { key: 'messageLogs',    label: 'Message logs',    note: 'Deleted and edited messages' },
  { key: 'memberLogs',     label: 'Member logs',     note: 'Joins, leaves and profile changes' },
  { key: 'moderationLogs', label: 'Moderation logs', note: 'Bans, kicks, mutes and warns, with proof images' },
  { key: 'serverLogs',     label: 'Server logs',     note: 'Channels, roles and server settings' },
  { key: 'voiceLogs',      label: 'Voice logs',      note: 'Joins, leaves, moves and mutes' },
];

async function load(guildId) {
  return (await LoggingConfig.findOne({ where: { guildId } })) || {};
}

async function saveChannel(guild, key, channelId) {
  if (channelId) {
    const ch = guild.channels.cache.get(channelId);
    const me = guild.members.me;
    const perms = ch?.permissionsFor?.(me);
    if (ch && perms && !(perms.has('ViewChannel') && perms.has('SendMessages') && perms.has('EmbedLinks') && perms.has('AttachFiles'))) {
      throw new Error(`I need View, Send Messages, Embed Links and Attach Files in #${ch.name}`);
    }
  }
  await LoggingConfig.upsert({ guildId: guild.id, [`${key}ChannelId`]: channelId });
  if (channelId) await GuildConfig.upsert({ guildId: guild.id, loggingEnabled: true });
  require('../events/logging/loggingUtils').invalidateLoggingCache(guild.id);
}

function render(cfg, disabled = false, err = null) {
  const set = CATEGORIES.filter(c => cfg[`${c.key}ChannelId`]).length;
  const c = ui.box();
  c.addTextDisplayComponents(ui.text(`## Logging\n-# ${set} of ${CATEGORIES.length} set up. Press Set to pick a channel for each one.`));
  c.addSeparatorComponents(ui.sep());
  for (const cat of CATEGORIES) {
    const id = cfg[`${cat.key}ChannelId`];
    c.addSectionComponents(new D.SectionBuilder()
      .addTextDisplayComponents(ui.text(`**${cat.label}**  ·  ${id ? `<#${id}>` : '*not set*'}\n-# ${cat.note}`))
      .setButtonAccessory(ui.btn(`lg_set_${cat.key}`, id ? 'Change' : 'Set', { style: id ? 'secondary' : 'primary', disabled })));
  }
  const line = K.errorLine(err);
  if (line) { c.addSeparatorComponents(ui.sep(false)); c.addTextDisplayComponents(ui.text(line)); }
  c.addSeparatorComponents(ui.sep());
  c.addActionRowComponents(ui.row(
    ui.btn('lg_reset', 'Turn all off', { style: 'danger', disabled: disabled || !set }),
    ui.btn('lg_done', 'Done', { style: 'success', disabled }),
  ));
  return c;
}

async function open(ctx) {
  const guild = ctx.guild;
  const user = ctx.user || ctx.author;
  const member = ctx.member;
  if (!member?.permissions?.has('Administrator')) return ui.say.error(ctx, 'You need the **Administrator** permission to set up logging');

  let cfg = await load(guild.id);
  const draw = (d, e) => render(cfg, d, e);
  const msg = await ui.send(ctx, draw(false), { extra: { allowedMentions: { parse: [] } } });
  if (!msg?.createMessageComponentCollector) return msg;

  const refresh = async () => { cfg = await load(guild.id); };

  K.mount(msg, {
    userId: user.id,
    render: (d) => draw(d),
    handle: async (i) => {
      const id = i.customId;

      if (id === 'lg_done') {
        await i.deferUpdate();
        return i.editReply({ components: [draw(true)], flags: V2 });
      }

      if (id === 'lg_reset') {
        return K.act(i, draw, async () => {
          const off = Object.fromEntries(CATEGORIES.map(c => [`${c.key}ChannelId`, null]));
          await LoggingConfig.upsert({ guildId: guild.id, ...off });
          require('../events/logging/loggingUtils').invalidateLoggingCache(guild.id);
          await refresh();
        });
      }

      if (id.startsWith('lg_set_')) {
        const cat = CATEGORIES.find(c => `lg_set_${c.key}` === id);
        if (!cat) return;
        const m = K.modal(`lg_form_${cat.key}_${msg.id}_${Date.now()}`, cat.label,
          K.labelChannel('Channel', 'channel', cfg[`${cat.key}ChannelId`], 'Leave it empty to turn this log off'));
        return K.askModal(i, m, draw, async (sub) => {
          await saveChannel(guild, cat.key, K.readChannel(sub, 'channel'));
          await refresh();
        });
      }
    },
  });
  return msg;
}

module.exports = { open, CATEGORIES };
