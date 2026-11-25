// Developed by Cosmin
// @file config.js

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');
const { LoggingConfig } = require('../../../../database/schemas');

module.exports = {
    name: 'config',
    description: 'View logging configuration',

    async execute(interactionOrMessage) {
        return require('../../../../services/loggingPanel').open(interactionOrMessage);
    }
};
