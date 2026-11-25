// Developed by Cosmin
// paw — snipe (hybrid), with subcommands.
// ,snipe                 every saved one, paged
// ,snipe latest          just the newest
// ,snipe list            every saved one, paged
// ,snipe user @someone   only from one person
// ,snipe channel #chat   another channel you can see
// ,snipe number 3        the third newest
// ,snipe clear           forget them (Manage Messages)

const { SlashCommandBuilder } = require('discord.js');
const view = require('../../../services/snipeView');

const KIND = 'snipe';
const sub = (n, d, fn) => (b) => b.addSubcommand(s => (fn ? fn(s.setName(n).setDescription(d)) : s.setName(n).setDescription(d)));

let data = new SlashCommandBuilder().setName('snipe').setDescription('View recently deleted messages');
data = sub('latest', 'Just the newest one')(data);
data = sub('list', 'Every saved one, paged')(data);
data = sub('user', 'Only messages from one person', s => s.addUserOption(o => o.setName('user').setDescription('Whose messages').setRequired(true)))(data);
data = sub('channel', 'Look in another channel', s => s.addChannelOption(o => o.setName('channel').setDescription('Which channel').setRequired(true)))(data);
data = sub('number', 'Pick one by its number, 1 is the newest', s => s.addIntegerOption(o => o.setName('number').setDescription('Which one').setRequired(true).setMinValue(1).setMaxValue(10)))(data);
data = sub('files', 'Only deleted messages that had files')(data);
data = sub('clear', 'Forget the saved messages here (Manage Messages)')(data);

const SUBS = ['latest', 'list', 'user', 'channel', 'number', 'files', 'clear'];

module.exports = {
  data,
  name: 'snipe',
  description: 'View recently deleted messages',
  usage: 'snipe [latest|list|user|channel|number|files|clear]',
  category: 'general',

  async execute(ctx, args = []) {
    if (ctx.isChatInputCommand?.()) {
      await ctx.deferReply();
      const s = ctx.options.getSubcommand();
      return view.show(ctx, KIND, { sub: s, user: ctx.options.getUser('user'), channel: ctx.options.getChannel('channel'), number: ctx.options.getInteger('number') });
    }

    const rest = [...args];
    let s = (rest[0] || '').toLowerCase();
    if (/^\d+$/.test(s)) return view.show(ctx, KIND, { sub: 'number', number: s });
    if (SUBS.includes(s)) rest.shift(); else s = ctx.mentions.users.size ? 'user' : 'all';

    const user = ctx.mentions.users.first() || (rest[0] && /^\d{17,20}$/.test(rest[0]) ? await ctx.client.users.fetch(rest[0]).catch(() => null) : null);
    const chId = rest.map(a => a.match(/^<#(\d+)>$/)?.[1]).find(Boolean);
    const channel = chId ? ctx.guild.channels.cache.get(chId) : null;
    if (s === 'channel' && !channel) return view.show(ctx, KIND, { sub: 'all', channel: null });
    return view.show(ctx, KIND, { sub: s, user, channel, number: rest[0] });
  },
};
