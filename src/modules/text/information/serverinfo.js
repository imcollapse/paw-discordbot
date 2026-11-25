// Developed by Cosmin

const { sendServerInfo } = require('../../../services/infoEmbeds');
const ui = require('../../../services/ui');
const i18n = require('../../../localization');

module.exports = {
  name: 'serverinfo',
  description: 'Shows information about the server',
  aliases: ['sinfo', 'si'],

  async execute(message) {
    if (!message.guild) return ui.say.error(message, 'Use this in a server');
    return sendServerInfo(message, message.guild, i18n.translator(message));
  },
};
