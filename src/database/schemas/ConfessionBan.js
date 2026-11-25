// Developed by Cosmin
// Confessions: people who may no longer confess in a server.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class ConfessionBan extends BaseModel {
    static init(sequelize) {
        super.init({
            guildId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
            userId:  { type: DataTypes.STRING, primaryKey: true, allowNull: false },
        }, { sequelize, modelName: 'ConfessionBan', tableName: 'confession_bans', timestamps: true });
        return this;
    }
}
module.exports = ConfessionBan;
