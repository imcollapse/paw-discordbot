// Developed by Cosmin

const { SlashCommandBuilder } = require('discord.js');
const { sendServerInfo } = require('../../../services/infoEmbeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Shows information about the server'),

  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: 'Use this in a server', ephemeral: true });
    await interaction.deferReply();
    return sendServerInfo(interaction, interaction.guild, require('../../../localization').translator(interaction));
  },
};
