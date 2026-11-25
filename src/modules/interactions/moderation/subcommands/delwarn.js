// Developed by Cosmin
// /moderation delwarn

const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const ui = require('../../../../services/ui');

module.exports = {
  name: 'delwarn',
  async execute(i) {
    const eph = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
    if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return i.reply({ components: [ui.notice('error', 'You need the **Moderate Members** permission')], flags: eph });
    const id = i.options.getInteger('id');
    const { Warn } = require('../../../../database/schemas');
    const removed = await Warn.destroy({ where: { id, guildId: i.guild.id } });
    if (!removed) return i.reply({ components: [ui.notice('warning', `No warning **#${id}** in this server`)], flags: eph });
    return i.reply({ components: [ui.notice('success', `Warning **#${id}** deleted`)], flags: MessageFlags.IsComponentsV2 });
  },
};
