import {
  deferred,
  Command,
  Table,
  colors,
  hash
} from "../../deps.ts";
import type { Deferred } from "../../deps.ts";

import { upgradable } from "./mod.ts";

import Users from "../db/Users.ts";

export const deferUsers: Deferred<string|null|void> = deferred();

type iUser = {
  username: string,
  password: string,
  root: string,
  uid: number,
  gid: number
}

const table = new Table()
  .header([
    colors.yellow("Username"),
    colors.yellow("Folder"),
    colors.yellow("uid"),
    colors.yellow("gid")
  ])
  .border(true);

const userCmdAdd = new Command()
  .description("Add an ftp user.")
  .option("-p, --password [val:string]", "Password of ftp account", { required: true })
  .option("-r, --root [val:string]", "Path of ftp account", { required: true })
  .option("--uid [val:number]", "User id of ftp account", { required: true })
  .option("--gid [val:number]", "Group id of ftp account", { required: true })
  .action(async ({ username, password, root, uid, gid }: iUser) => {
    await upgradable();
    if (!username) return userCmdAdd.showHelp();
    if (!password) return userCmdAdd.showHelp();
    if (!root) return userCmdAdd.showHelp();
    if (await Users.where('username', username).count() !==0) return deferUsers.reject(`User "${username}" Already exist!`);
    const data: iUser = {
      username,
      password: await hash(password),
      root,
      uid: uid,
      gid: gid
    }
    await Users.create(data);

    deferUsers.resolve(`User "${username}" added with success.`)
  });

const userCmdDel = new Command()
  .description("Remove an ftp user.")
  .action(async ({ username }) => {
    await upgradable();
    if (!username) return userCmdAdd.showHelp();
    if (await Users.where('username', username).count() === 0) return deferUsers.reject(`User "${username}" not found!\n Use -h`);
    await Users.where('username', username).delete();

    deferUsers.resolve(`User "${username}" deleted with success.`);
  });

const userCmdGet = new Command()
  .description("Show informations of an ftp user.")
  .action(async ({ username }) => {
    await upgradable();
    const users = await Users.where('username', username).all();
    if (users.length === 0) return deferUsers.reject(`User "${username}" not found!`);
    let { root, uid, gid } = users[0];
    username = colors.bold.blue(username);
    root = colors.bold.blue((root as string));
    uid = colors.bold.blue(`${uid}`);
    gid = colors.bold.blue(`${gid}`);
    table.body([[username, root, uid, `${gid}`]]).render();

    deferUsers.resolve()
  });

export const usersCommands = new Command()
  .option("-u, --username [val:string]", "Username of ftp account.", { global: true, required: true })
  .description("User section.")
  .action(async () => {
    await upgradable();
    const users = await Users.select("username", "root", "uid", "gid").all();
    if (users.length === 0) return deferUsers.reject(`Users list empty, use add command to add an user.`)
    table
      .body(users.map(({ username, root, uid, gid }) => {
        username = colors.bold.blue((username as string));
        root = colors.bold.blue((root as string)); 
        uid = colors.bold.blue(`${uid}`);
        gid = colors.bold.blue(`${gid}`);
        return [username, root, uid, `${gid}`]
      })).render();

    deferUsers.resolve()
  })
  .command("add", userCmdAdd)
  .command("del", userCmdDel)
  .command("get", userCmdGet);

