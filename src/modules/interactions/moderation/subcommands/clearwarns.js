// Developed by Cosmin
// /moderation clearwarns

const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const ui = require('../../../../services/ui');

module.exports = {
  name: 'clearwarns',
  async execute(i) {
    const eph = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
    if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return i.reply({ components: [ui.notice('error', 'You need the **Moderate Members** permission')], flags: eph });
    const user = i.options.getUser('user');
    const { Warn } = require('../../../../database/schemas');
    const removed = await Warn.destroy({ where: { guildId: i.guild.id, userId: user.id } });
    return i.reply({ components: [ui.notice('success', `Removed **${removed}** warning${removed === 1 ? '' : 's'} from ${user.username}`)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  },
};
