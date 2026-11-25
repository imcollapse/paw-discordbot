// Developed by Cosmin
// Confessions: per-server settings.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class ConfessionConfig extends BaseModel {
    static init(sequelize) {
        super.init({
            guildId:         { type: DataTypes.STRING, primaryKey: true, allowNull: false },
            channelId:       { type: DataTypes.STRING, allowNull: true },
            reviewChannelId: { type: DataTypes.STRING, allowNull: true },   // set = every confession waits for approval
            enabled:         { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            votes:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            cooldown:        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },     // seconds between confessions per person
            nextNumber:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        }, { sequelize, modelName: 'ConfessionConfig', tableName: 'confession_config', timestamps: true });
        return this;
    }
}
module.exports = ConfessionConfig;
