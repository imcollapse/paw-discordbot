// Developed by Cosmin
// paw · /confess: send an anonymous confession to the server's confession channel.

const { SlashCommandBuilder } = require('discord.js');
const C = require('../../services/confessions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('confess')
    .setDescription('Send an anonymous confession')
    .setDMPermission(false)
    .addStringOption(o => o.setName('message').setDescription('What do you want to confess?').setRequired(true).setMaxLength(1800)),
  async execute(interaction) {
    return C.submit(interaction, interaction.options.getString('message'));
  },
};
