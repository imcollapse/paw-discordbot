// Developed by Cosmin
// paw — roleplay (hybrid). GIFs come from github.com/itsfizys/gifcdn.
// slash   /roleplay love hug user:@someone      (groups: love · mood · fun)
// prefix  ,hug @user   ,wave   ,roleplay kiss @user   ,rp love pat <id>
// For several people at once see /groupaction.
// Every action is a prefix command of its own; `run` stays with the owner
// `eval` alias, so use `,rp run` for that one.

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ui = require('../../../services/ui');
const { buildRoleplayResponse, roleplayActions, actionNames, actionGroups, GROUP_INFO } = require('../../../services/roleplayHelper');

const RESERVED = new Set(['run', 'roll', 'stop', 'poke']); // already an alias of another command
const NO_MENTIONS = { parse: [] };

const clip = (t, n = 100) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Resolve the target from a mention, an id, or the message being replied to. */
async function targetFromMessage(message, args) {
  const mention = message.mentions.users.first();
  if (mention) return mention;
  const id = args.find(a => /^\d{17,20}$/.test(a));
  if (id) return message.client.users.fetch(id).catch(() => null);
  if (message.reference?.messageId) {
    const ref = await message.fetchReference().catch(() => null);
    if (ref) return ref.author;
  }
  return null;
}

// /roleplay <group> <action> [user] — every group stays under Discord's 25 subcommand limit
const data = new SlashCommandBuilder().setName('roleplay').setDescription('Send an anime roleplay GIF');
for (const [group, list] of Object.entries(actionGroups)) {
  data.addSubcommandGroup(g => {
    g.setName(group).setDescription(clip(GROUP_INFO[group]));
    for (const action of list) {
      g.addSubcommand(s => s.setName(action).setDescription(clip(`${roleplayActions[action].solo.replace('{a}', 'You')}, or do it to someone`))
        .addUserOption(o => o.setName('user').setDescription('Who to do it to (optional)')));
    }
    return g;
  });
}

module.exports = {
  data,
  name: 'roleplay',
  description: 'Send an anime roleplay GIF',
  aliases: ['rp', ...actionNames.filter(a => !RESERVED.has(a))],
  category: 'fun',

  async execute(ctx, args = []) {
    const isSlash = ctx.isChatInputCommand?.();
    let action; let target = null; let author;

    if (isSlash) {
      action = ctx.options.getSubcommand().toLowerCase();
      target = ctx.options.getUser('user');
      author = ctx.user;
    } else {
      author = ctx.author;
      const used = (ctx.invokedAs || '').split(' ')[0];
      const rest = [...args];
      if (!roleplayActions[used] && actionGroups[(rest[0] || '').toLowerCase()]) rest.shift();   // ",rp love hug @user"
      action = roleplayActions[used] ? used : (rest.shift() || '').toLowerCase();
      target = await targetFromMessage(ctx, rest);

      // users with no-prefix mode: a bare word like "yes please" must not fire a GIF
      if (roleplayActions[used] && !ctx.usedPrefix && !ctx.mentions.users.size) return;
    }

    if (!roleplayActions[action]) {
      const hint = actionNames.filter(n => n.startsWith(action.slice(0, 2))).slice(0, 8).map(n => `\`${n}\``).join(', ');
      return ui.say.error(ctx, `Unknown action${hint ? `. Try ${hint}` : ''}`);
    }

    if (target && target.id !== author.id) {
      const prefs = await require('../../../database/schemas').UserSettings.read(target.id).catch(() => null);
      if (prefs?.allowRoleplay === false) return ui.say.error(ctx, `${target.displayName ?? target.username} has turned off roleplay actions`);
    }

    const box = await buildRoleplayResponse(action, author, target, true);
    if (!box) return ui.say.error(ctx, 'Could not load a GIF, try again');

    return ctx.reply({ components: [box], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS });
  },
};
