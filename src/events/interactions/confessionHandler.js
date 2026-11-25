// Developed by Cosmin
// paw · confession buttons: cf:up:<id> and cf:down:<id> (votes), cf:ok|no|ban:<id> (review). Logic is in services/confessions.js.

const { MessageFlags } = require('discord.js');
const C = require('../../services/confessions');
const ui = require('../../services/ui');

async function handle(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('cf:')) return false;
  const [, action, id] = interaction.customId.split(':');
  try {
    if (action === 'up') await C.vote(interaction, id, 1);
    else if (action === 'down') await C.vote(interaction, id, -1);
    else if (['ok', 'no', 'ban'].includes(action)) await C.review(interaction, id, action);
  } catch (e) {
    console.error('[confessions]', e);
    const body = { components: [ui.fail('Something went wrong. Try again.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(body).catch(() => {});
    else await interaction.reply(body).catch(() => {});
  }
  return true;
}

module.exports = { handle };
