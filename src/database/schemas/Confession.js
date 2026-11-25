// Developed by Cosmin
// Confessions: every submitted confession. The author is kept only so moderators can ban them without ever seeing who it is.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class Confession extends BaseModel {
    static init(sequelize) {
        super.init({
            id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            guildId:   { type: DataTypes.STRING, allowNull: false },
            number:    { type: DataTypes.INTEGER, allowNull: true },          // assigned when it is posted
            authorId:  { type: DataTypes.STRING, allowNull: false },
            content:   { type: DataTypes.TEXT, allowNull: false },
            status:    { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },   // pending | posted | denied
            channelId: { type: DataTypes.STRING, allowNull: true },
            messageId: { type: DataTypes.STRING, allowNull: true },
        }, {
            sequelize, modelName: 'Confession', tableName: 'confessions', timestamps: true,
            indexes: [{ fields: ['guildId', 'number'] }],
        });
        return this;
    }
}
module.exports = Confession;
