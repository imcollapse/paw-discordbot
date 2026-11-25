// Developed by Cosmin
// /moderation warn — same rules as the prefix command

const { PermissionFlagsBits } = require('discord.js');
const { blockProtectedTarget } = require('../../../../services/modGuard');
const { buildModResult, modResultOptions } = require('../../../../services/modCard');
const ui = require('../../../../services/ui');

const say = (i, kind, msg) => i.reply({ components: [ui.notice(kind, msg)], flags: require('discord.js').MessageFlags.IsComponentsV2 | require('discord.js').MessageFlags.Ephemeral });

module.exports = {
  name: 'warn',
  async execute(i) {
    if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return say(i, 'error', 'You need the **Moderate Members** permission');
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    if (await blockProtectedTarget(i, i.user, user.id, 'warn')) return;
    if (user.bot) return say(i, 'warning', 'You cannot warn a bot');
    if (user.id === i.user.id) return say(i, 'warning', 'You cannot warn yourself');
    if (member && member.roles.highest.position >= i.member.roles.highest.position && i.guild.ownerId !== i.user.id) return say(i, 'warning', 'They have an equal or higher role than you');
    const reason = (i.options.getString('reason') || 'No reason provided').slice(0, 1000);
    const { Warn } = require('../../../../database/schemas');
    await Warn.create({ guildId: i.guild.id, userId: user.id, moderatorId: i.user.id, reason });
    const proof = require('../../../../services/modProof');
    const proofs = proof.fromInteraction(i);
    proof.postLog(i.guild, { title: 'Member Warned', target: user, moderator: i.user, reason, proofs });
    return i.reply({ components: buildModResult({ proofs, verb: 'warned', target: user, moderator: i.user, reason }), ...modResultOptions });
  },
};
