// Developed by Cosmin
// Bump reminder: per-server settings and the time the next bump is due.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class BumpConfig extends BaseModel {
    static init(sequelize) {
        super.init({
            guildId:    { type: DataTypes.STRING, primaryKey: true, allowNull: false },
            channelId:  { type: DataTypes.STRING, allowNull: true },
            roleId:     { type: DataTypes.STRING, allowNull: true },
            enabled:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            thanks:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
            remindAt:   { type: DataTypes.BIGINT, allowNull: true },            // epoch ms, null when nothing is waiting
            lastBumper: { type: DataTypes.STRING, allowNull: true },
            bumps:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        }, { sequelize, modelName: 'BumpConfig', tableName: 'bump_config', timestamps: true });
        return this;
    }
}
module.exports = BumpConfig;
