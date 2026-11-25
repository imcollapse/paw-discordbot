// Developed by Cosmin
// paw · bumpreminder (hybrid): thanks whoever bumps with DISBOARD and reminds the server two hours later.
// ,bumpreminder setup [#channel] [@role]    ,bumpreminder role [@role]    ,bumpreminder thanks <on|off>
// ,bumpreminder enable | disable | config

const { SlashCommandBuilder, ChannelType } = require('discord.js');
const rt = require('../../../services/roleTools');
const B = require('../../../services/bumpReminder');

const SUBS = ['setup', 'role', 'thanks', 'enable', 'disable', 'config'];
const on = (v) => ['on', 'true', 'yes', 'enable', 'enabled', '1'].includes(String(v).toLowerCase());

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bumpreminder')
    .setDescription('Thank bumpers and remind the server when it can be bumped again')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('setup').setDescription('Choose where reminders are posted')
      .addChannelOption(o => o.setName('channel').setDescription('Reminder channel (default: this one)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption(o => o.setName('role').setDescription('Role to ping when it is time to bump')))
    .addSubcommand(s => s.setName('role').setDescription('Set or clear the role that is pinged')
      .addRoleOption(o => o.setName('role').setDescription('Leave empty to stop pinging a role')))
    .addSubcommand(s => s.setName('thanks').setDescription('Turn the thank-you message on or off')
      .addBooleanOption(o => o.setName('enabled').setDescription('Thank people who bump').setRequired(true)))
    .addSubcommand(s => s.setName('enable').setDescription('Turn bump reminders on'))
    .addSubcommand(s => s.setName('disable').setDescription('Turn bump reminders off'))
    .addSubcommand(s => s.setName('config').setDescription('Show the settings and the next reminder')),

  name: 'bumpreminder',
  description: 'Thank bumpers and remind the server when it can be bumped again',
  aliases: ['bumpremind', 'bumpr'],
  category: 'community',

  async execute(ctx, args = []) {
    const slash = ctx.isChatInputCommand?.();
    const guild = ctx.guild;
    const sub = slash ? ctx.options.getSubcommand() : (args[0] || 'config').toLowerCase();
    if (!SUBS.includes(sub)) return rt.bad(ctx, `Try ${SUBS.map(s => `\`${s}\``).join(', ')}.`);
    let a;
    if (slash) a = { channel: ctx.options.getChannel('channel'), role: ctx.options.getRole('role'), on: ctx.options.getBoolean('enabled') };
    else {
      const rest = args.slice(1);
      a = {
        channel: rest.map(t => rt.findChannel(guild, t)).find(Boolean) ?? null,
        role: rest.map(t => (/^<@&\d+>$|^\d{15,22}$/.test(t) ? rt.findRole(guild, t) : null)).find(Boolean) ?? null,
        on: on(rest[0]),
      };
    }
    return B.run(ctx, sub, a);
  },
};
