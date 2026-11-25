// Developed by Cosmin
// /moderation warnings

const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const ui = require('../../../../services/ui');

module.exports = {
  name: 'warnings',
  async execute(i) {
    const eph = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
    if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return i.reply({ components: [ui.notice('error', 'You need the **Moderate Members** permission')], flags: eph });
    const user = i.options.getUser('user') || i.user;
    const { Warn } = require('../../../../database/schemas');
    const where = { guildId: i.guild.id, userId: user.id };
    const [rows, total] = await Promise.all([Warn.findAll({ where, order: [['createdAt', 'DESC']], limit: 10 }), Warn.count({ where })]);
    if (!total) return i.reply({ components: [ui.quiet(`${user} has no warnings`)], flags: eph, allowedMentions: { parse: [] } });
    const lines = rows.map(w => `**#${w.id}** · <t:${Math.floor(new Date(w.createdAt).getTime() / 1000)}:R> by <@${w.moderatorId}>\n> ${w.reason || 'No reason provided'}`);
    const c = ui.box().addTextDisplayComponents(ui.text(`### Warnings for ${user.username} (${total})\n${lines.join('\n\n')}${total > 10 ? '\n-# Showing the 10 most recent' : ''}`));
    return i.reply({ components: [c], flags: eph, allowedMentions: { parse: [] } });
  },
};
