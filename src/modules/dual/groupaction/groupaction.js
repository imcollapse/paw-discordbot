// Developed by Cosmin
// paw — group actions (hybrid). One GIF, several people.
// slash   /groupaction hug user:@a user2:@b user3:@c   (up to 5 people)
// prefix  ,groupaction hug @a @b @c      ,group wave @a @b
// Solo and two-person actions live in /roleplay.

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ui = require('../../../services/ui');
const { roleplayActions, buildGroupResponse, buildRoleplayResponse, GROUP_ACTIONS } = require('../../../services/roleplayHelper');

const NO_MENTIONS = { parse: [] };
const MAX = 5;
const OPTS = ['user', 'user2', 'user3', 'user4', 'user5'];

const data = new SlashCommandBuilder().setName('groupaction').setDescription('Do an anime action with several people at once');
for (const action of GROUP_ACTIONS) {
  data.addSubcommand(s => {
    s.setName(action).setDescription(`${action[0].toUpperCase()}${action.slice(1)} up to ${MAX} people at once`);
    OPTS.forEach((n, i) => s.addUserOption(o => o.setName(n).setDescription(i === 0 ? 'First person' : `Person ${i + 1}`).setRequired(i === 0)));
    return s;
  });
}

async function usersFromArgs(message, args) {
  const out = [...message.mentions.users.values()];
  for (const a of args) {
    if (out.length >= MAX) break;
    if (/^\d{17,20}$/.test(a) && !out.some(u => u.id === a)) {
      const u = await message.client.users.fetch(a).catch(() => null);
      if (u) out.push(u);
    }
  }
  return out;
}

module.exports = {
  data,
  name: 'groupaction',
  description: 'Do an anime action with several people at once (hug, pat, wave, dance...)',
  aliases: ['group', 'ga'],
  category: 'fun',

  async execute(ctx, args = []) {
    const isSlash = ctx.isChatInputCommand?.();
    const author = isSlash ? ctx.user : ctx.author;
    let action; let people;

    if (isSlash) {
      action = ctx.options.getSubcommand();
      people = OPTS.map(n => ctx.options.getUser(n)).filter(Boolean);
    } else {
      const rest = [...args];
      action = (rest.shift() || '').toLowerCase();
      people = await usersFromArgs(ctx, rest);
    }

    if (!GROUP_ACTIONS.includes(action)) {
      return ui.say.error(ctx, `Pick an action: ${GROUP_ACTIONS.slice(0, 12).map(a => `\`${a}\``).join(', ')} and more. Example: \`groupaction hug @a @b\``);
    }

    // unique, not the author, and skip people who turned roleplay off
    const seen = new Set([author.id]);
    let targets = people.filter(u => !seen.has(u.id) && seen.add(u.id)).slice(0, MAX);
    if (!targets.length) return ui.say.error(ctx, 'Mention at least one other person');

    const { UserSettings } = require('../../../database/schemas');
    const optedOut = [];
    const allowed = [];
    for (const u of targets) {
      const prefs = await UserSettings.read(u.id).catch(() => null);
      (prefs?.allowRoleplay === false ? optedOut : allowed).push(u);
    }
    targets = allowed;
    if (!targets.length) return ui.say.error(ctx, `${optedOut.map(u => u.displayName ?? u.username).join(', ')} turned off roleplay actions`);

    const box = targets.length === 1
      ? await buildRoleplayResponse(action, author, targets[0], false)
      : await buildGroupResponse(action, author, targets);
    if (!box) return ui.say.error(ctx, 'Could not load a GIF, try again');

    if (optedOut.length) box.addTextDisplayComponents(ui.text(`-# skipped ${optedOut.map(u => u.displayName ?? u.username).join(', ')}, they turned roleplay off`));
    return ctx.reply({ components: [box], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS });
  },
};
