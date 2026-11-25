// Developed by Cosmin
// paw · counters (hybrid): voice channels that show live numbers.
// ,counters add <members|humans|bots|boosts|channels|roles> [text with {count}]
// ,counters list    ,counters template <type> <text>    ,counters remove <type>    ,counters refresh

const { SlashCommandBuilder, ChannelType } = require('discord.js');
const rt = require('../../../services/roleTools');
const C = require('../../../services/counters');

const typeOption = (o) => o.setName('type').setDescription('What to count').setRequired(true).addChoices(...C.TYPE_NAMES.map((t) => ({ name: C.TYPES[t].label, value: t })));
const SUBS = ['add', 'list', 'template', 'remove', 'refresh'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('counters')
    .setDescription('Voice channels that show live member, boost and bot counts')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('add').setDescription('Create a counter channel')
      .addStringOption(typeOption)
      .addStringOption(o => o.setName('text').setDescription('Channel name, use {count} for the number. Example: Members: {count}').setMaxLength(90))
      .addChannelOption(o => o.setName('category').setDescription('Put the channel in this category').addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand(s => s.setName('list').setDescription('Show the counters in this server'))
    .addSubcommand(s => s.setName('template').setDescription('Change the text of a counter')
      .addStringOption(typeOption)
      .addStringOption(o => o.setName('text').setDescription('Use {count} for the number').setRequired(true).setMaxLength(90)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a counter and its channel')
      .addStringOption(typeOption))
    .addSubcommand(s => s.setName('refresh').setDescription('Update the counters now')),

  name: 'counters',
  description: 'Voice channels that show live member, boost and bot counts',
  aliases: ['counter'],
  category: 'community',

  async execute(ctx, args = []) {
    const slash = ctx.isChatInputCommand?.();
    const sub = slash ? ctx.options.getSubcommand() : (args[0] || 'list').toLowerCase();
    if (!SUBS.includes(sub)) return rt.bad(ctx, `Try ${SUBS.map(s => `\`${s}\``).join(', ')}.`);
    const a = slash
      ? { type: ctx.options.getString('type'), template: ctx.options.getString('text'), category: ctx.options.getChannel('category') }
      : { type: args[1], template: args.slice(2).join(' ') || null, category: null };
    return C.run(ctx, sub, a);
  },
};
