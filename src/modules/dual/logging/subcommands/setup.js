// Developed by Cosmin

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { LoggingConfig } = require('../../../../database/schemas');

const LOG_CATEGORIES = [
    { value: 'messageLogs', label: 'Message Logs', description: 'Delete, edit & bulk delete' },
    { value: 'memberLogs', label: 'Member Logs', description: 'Join, leave & profile updates' },
    { value: 'moderationLogs', label: 'Moderation Logs', description: 'Ban, unban, kick & timeout' },
    { value: 'serverLogs', label: 'Server Logs', description: 'Channels, roles & server settings' },
    { value: 'voiceLogs', label: 'Voice Logs', description: 'Join, leave, switch & mute' }
];

function buildCategorySelect(placeholder = 'Select a log type to configure') {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('logging_category_select')
        .setPlaceholder(placeholder)
        .setMinValues(1)
        .setMaxValues(1);
    for (const cat of LOG_CATEGORIES) {
        menu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setValue(cat.value)
                .setLabel(cat.label)
                .setDescription(cat.description)
        );
    }
    return menu;
}

module.exports = {
    name: 'setup',
    description: 'Setup logging channels',
    LOG_CATEGORIES,
    buildCategorySelect,

    // One container with every log type and a Set button for each (see services/loggingPanel.js)
    async execute(interactionOrMessage) {
        return require('../../../../services/loggingPanel').open(interactionOrMessage);
    }
};
