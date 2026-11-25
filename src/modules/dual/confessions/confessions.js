// Developed by Cosmin
// paw · confessions (hybrid): setup and moderation for anonymous confessions. Members use /confess.
// ,confessions setup <#channel> [#review]    ,confessions review [#channel]    ,confessions votes <on|off>
// ,confessions cooldown <seconds>    ,confessions ban <number>    ,confessions unban <number>
// ,confessions enable | disable | config

const { SlashCommandBuilder, ChannelType } = require('discord.js');
const rt = require('../../../services/roleTools');
const C = require('../../../services/confessions');

const SUBS = ['setup', 'review', 'votes', 'cooldown', 'ban', 'unban', 'enable', 'disable', 'config'];
const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const on = (v) => ['on', 'true', 'yes', 'enable', 'enabled', '1'].includes(String(v).toLowerCase());

module.exports = {
  data: new SlashCommandBuilder()
    .setName('confessions')
    .setDescription('Set up and moderate anonymous confessions')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('setup').setDescription('Choose the confession channel')
      .addChannelOption(o => o.setName('channel').setDescription('Where confessions are posted').addChannelTypes(...TEXT).setRequired(true))
      .addChannelOption(o => o.setName('review').setDescription('Optional: moderators approve each confession here first').addChannelTypes(...TEXT)))
    .addSubcommand(s => s.setName('review').setDescription('Require approval in a channel, or leave empty to turn review off')
      .addChannelOption(o => o.setName('channel').setDescription('Review channel').addChannelTypes(...TEXT)))
    .addSubcommand(s => s.setName('votes').setDescription('Turn the up and down vote buttons on or off')
      .addBooleanOption(o => o.setName('enabled').setDescription('Show vote buttons').setRequired(true)))
    .addSubcommand(s => s.setName('cooldown').setDescription('Seconds between confessions per person')
      .addIntegerOption(o => o.setName('seconds').setDescription('0 to 86400').setMinValue(0).setMaxValue(86400).setRequired(true)))
    .addSubcommand(s => s.setName('ban').setDescription('Stop the author of a confession from confessing, without revealing them')
      .addIntegerOption(o => o.setName('number').setDescription('Confession number').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('unban').setDescription('Let the author of a confession confess again')
      .addIntegerOption(o => o.setName('number').setDescription('Confession number').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('enable').setDescription('Turn confessions on'))
    .addSubcommand(s => s.setName('disable').setDescription('Turn confessions off'))
    .addSubcommand(s => s.setName('config').setDescription('Show the confession settings')),

  name: 'confessions',
  description: 'Set up and moderate anonymous confessions',
  aliases: ['confession'],
  category: 'community',

  async execute(ctx, args = []) {
    const slash = ctx.isChatInputCommand?.();
    const guild = ctx.guild;
    const sub = slash ? ctx.options.getSubcommand() : (args[0] || 'config').toLowerCase();
    if (!SUBS.includes(sub)) return rt.bad(ctx, `Unknown option. Try: ${SUBS.map(s => `\`${s}\``).join(', ')}.`);

    let a;
    if (slash) {
      a = {
        channel: ctx.options.getChannel('channel'), review: sub === 'setup' ? ctx.options.getChannel('review') : ctx.options.getChannel('channel'),
        on: ctx.options.getBoolean('enabled'), seconds: ctx.options.getInteger('seconds'), number: ctx.options.getInteger('number'),
      };
    } else {
      a = {
        channel: rt.findChannel(guild, args[1]), review: sub === 'setup' ? rt.findChannel(guild, args[2]) : rt.findChannel(guild, args[1]),
        on: on(args[1]), seconds: args[1], number: args[1],
      };
    }
    return C.run(ctx, sub, a);
  },
};
