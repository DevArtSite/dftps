import {
  Model,
  DataTypes
} from '../../deps.ts';

export default class Users extends Model {
  static table = "users";
  static timestamps = true;
  static fields = {
    username: DataTypes.STRING,
    password: DataTypes.STRING,
    root: DataTypes.STRING,
    uid: DataTypes.INTEGER,
    gid: DataTypes.INTEGER,
  };
}