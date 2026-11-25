// Developed by Cosmin
// Confessions: one up or down vote per person per confession.

const { DataTypes } = require('sequelize');
const BaseModel = require('../BaseModel');

class ConfessionVote extends BaseModel {
    static init(sequelize) {
        super.init({
            confessionId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
            userId:       { type: DataTypes.STRING, primaryKey: true, allowNull: false },
            value:        { type: DataTypes.INTEGER, allowNull: false },       // 1 up, -1 down
        }, { sequelize, modelName: 'ConfessionVote', tableName: 'confession_votes', timestamps: false });
        return this;
    }
}
module.exports = ConfessionVote;
