// Developed by Cosmin

const { SlashCommandBuilder } = require('discord.js');
const { sendUserInfo } = require('../../../services/infoEmbeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Shows information about a user')
    .addUserOption(o => o.setName('user').setDescription('The user to look up').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user') || interaction.user;
    return sendUserInfo(interaction, interaction.guild, user, require('../../../localization').translator(interaction));
  },
};
