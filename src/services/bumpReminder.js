// Developed by Cosmin
// paw · bump reminder.
// Watches for a successful DISBOARD /bump, thanks whoever did it, and reminds the server two hours later
// (DISBOARD allows one bump every two hours). Reminder times are saved, so a restart does not lose them.

const { MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const ui = require('./ui');
const rt = require('./roleTools');
const { BumpConfig } = require('../database/schemas');

const V2 = MessageFlags.IsComponentsV2;
const DISBOARD = '302050872383242240';
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const timers = new Map();                                // guildId -> timeout

const getConfig = (guildId) => BumpConfig.findByPk(guildId);
const unix = (ms) => Math.floor(ms / 1000);

// reminder

async function fire(client, guildId) {
  timers.delete(guildId);
  const cfg = await getConfig(guildId);
  if (!cfg?.enabled || !cfg.remindAt || Number(cfg.remindAt) > Date.now() + 1000) return;
  await cfg.update({ remindAt: null });

  const guild = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(cfg.channelId);
  if (!channel?.isTextBased?.() || !channel.permissionsFor(guild.members.me)?.has(['ViewChannel', 'SendMessages'])) return;

  const box = ui.box('base')
    .addTextDisplayComponents(ui.text(`${cfg.roleId ? `<@&${cfg.roleId}> ` : ''}### Time to bump`))
    .addTextDisplayComponents(ui.text('The server can be bumped again. Use `/bump` so it climbs the list.'));
  await channel.send({ components: [box], flags: V2, allowedMentions: { parse: [], roles: cfg.roleId ? [cfg.roleId] : [] } }).catch(() => {});
}

function schedule(client, guildId, at) {
  clearTimeout(timers.get(guildId));
  const delay = Math.min(Math.max(at - Date.now(), 0), 2 ** 31 - 1);
  timers.set(guildId, setTimeout(() => fire(client, guildId).catch((e) => console.warn('[bump]', e.message)), delay));
}

/** After a restart: put every waiting reminder back on the clock. */
async function restore(client) {
  const rows = await BumpConfig.findAll().catch(() => []);
  for (const r of rows) if (r.enabled && r.remindAt) schedule(client, r.guildId, Number(r.remindAt));
}

// detection

const isSuccess = (m) => {
  if (m.author.id !== DISBOARD) return false;
  const used = m.interactionMetadata?.user ?? m.interaction?.user;
  if (!used) return false;
  const text = m.embeds.map((e) => `${e.description ?? ''} ${e.title ?? ''}`).join(' ');
  return /bump done|bumped/i.test(text) && !/wait|until|cooldown/i.test(text);
};

async function onMessage(client, message) {
  if (!message.guild || !isSuccess(message)) return;
  const cfg = await getConfig(message.guild.id);
  if (!cfg?.enabled || !cfg.channelId) return;

  const bumper = message.interactionMetadata?.user ?? message.interaction?.user;
  const at = Date.now() + COOLDOWN_MS;
  await cfg.update({ remindAt: at, lastBumper: bumper.id, bumps: cfg.bumps + 1 });
  schedule(client, message.guild.id, at);

  if (cfg.thanks) {
    const box = ui.box('base')
      .addTextDisplayComponents(ui.text(`### Thanks for bumping, <@${bumper.id}>`))
      .addTextDisplayComponents(ui.text(`I'll remind everyone <t:${unix(at)}:R>.\n${ui.sub(`${cfg.bumps} bump${cfg.bumps === 1 ? '' : 's'} so far`)}`));
    await message.channel.send({ components: [box], flags: V2, allowedMentions: { parse: [] } }).catch(() => {});
  }
}

// admin command

const textChannel = (ch) => ch?.isTextBased?.() && !ch.isVoiceBased?.() && ch.guild;

async function run(ctx, sub, a) {
  const guild = ctx.guild;
  if (!guild) return rt.bad(ctx, 'Use this in a server.');
  const perms = ctx.memberPermissions ?? ctx.member?.permissions;
  if (!perms?.has(P.ManageGuild)) return rt.bad(ctx, 'you need the **Manage Server** permission~');

  if (sub === 'setup') {
    const channel = a.channel ?? ctx.channel;
    if (!textChannel(channel)) return rt.bad(ctx, 'Pick a text channel for the reminders.');
    if (!channel.permissionsFor(guild.members.me)?.has(['ViewChannel', 'SendMessages'])) return rt.bad(ctx, `I can't send messages in ${channel}.`);
    const [cfg] = await BumpConfig.findOrCreate({ where: { guildId: guild.id } });
    await cfg.update({ channelId: channel.id, roleId: a.role?.id ?? cfg.roleId, enabled: true });
    return rt.ok(ctx, `Bump reminders go to ${channel}${cfg.roleId ? ` and ping <@&${cfg.roleId}>` : ''}. Bump with DISBOARD \`/bump\` and I'll take it from there.`);
  }

  const cfg = await getConfig(guild.id);
  if (!cfg) return rt.bad(ctx, 'Run the setup first: `bumpreminder setup [channel] [role]`.');

  switch (sub) {
    case 'enable': await cfg.update({ enabled: true }); return rt.ok(ctx, 'Bump reminders are on.');
    case 'disable': clearTimeout(timers.get(guild.id)); timers.delete(guild.id); await cfg.update({ enabled: false, remindAt: null }); return rt.warn(ctx, 'Bump reminders are off.');
    case 'role': await cfg.update({ roleId: a.role?.id ?? null }); return rt.ok(ctx, a.role ? `I will ping ${a.role} for reminders.` : 'Reminders no longer ping a role.');
    case 'thanks': await cfg.update({ thanks: !!a.on }); return rt.ok(ctx, `Thank-you messages are ${a.on ? 'on' : 'off'}.`);
    default: {
      const next = cfg.remindAt && Number(cfg.remindAt) > Date.now() ? `<t:${unix(Number(cfg.remindAt))}:R>` : 'nothing waiting';
      return rt.send(ctx, ui.card({
        title: 'Bump reminder',
        lines: [
          `**Status** ${cfg.enabled ? 'on' : 'off'}`,
          `**Channel** ${cfg.channelId ? `<#${cfg.channelId}>` : 'not set'}`,
          `**Role** ${cfg.roleId ? `<@&${cfg.roleId}>` : 'none'}`,
          `**Thank-you** ${cfg.thanks ? 'on' : 'off'}`,
          `**Next reminder** ${next}`,
          `**Bumps counted** ${cfg.bumps}${cfg.lastBumper ? ` · last by <@${cfg.lastBumper}>` : ''}`,
        ],
      }));
    }
  }
}

module.exports = { run, onMessage, restore };
