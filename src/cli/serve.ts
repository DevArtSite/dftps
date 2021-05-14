import {
  Command,
  verify,
  Model
} from "../../deps.ts";

import { Server } from "../server/mod.ts";
import type { UsernameResolvable, LoginResolvable } from "../server/connection.ts";
import Users from "../db/Users.ts";
import tomlJson from "../_utils/toml.ts";

import { upgradable } from "./mod.ts";

const configFile = "/etc/dftps.toml";
const config = tomlJson({ fileUrl: configFile });

const serveCommands = new Command()
  //.option("-u, --username [val:string]", "Username of ftp account.", { global: true, required: true })
  .description("Run your Ftp serveur.")
  .action(async () => {
    await upgradable();
    const serve = new Server(config.addr, config.options);
    for await (const connection of serve) {
      const { awaitUsername, awaitLogin } = connection;
      const users = await Users.select("username", "password", "root", "uid", "gid").all();
      let user: Model;
      awaitUsername.then(({ username, resolveUsername }: UsernameResolvable) => {
        const found = users.find(u => u.username === username);
        if (!found) return resolveUsername.reject("Incorrect username!");
        user = found;
        resolveUsername.resolve();
      });
      awaitLogin.then(async ({ password, resolvePassword }: LoginResolvable) => {
        if (!user) return resolvePassword.reject("User not found!");
        if (! await verify(password, (user.password as string))) return resolvePassword.reject("Wrong password!");
        
        const { root, uid, gid } = user;
        resolvePassword.resolve({ root: (root as string), uid: (uid as number), gid: (gid as number) });
      });
    }
  })

export default serveCommands