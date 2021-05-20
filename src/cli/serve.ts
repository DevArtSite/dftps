import {
  Command,
  verify,
  Model
} from "../../deps.ts";

import Server from "../server/mod.ts";
import type { UsernameResolvable, LoginResolvable } from "../server/connection.ts";
import Users from "../db/Users.ts";
import tomlJson from "../_utils/toml.ts";

import { upgradable } from "./mod.ts";

const configFile = "/etc/dftps.toml";
const config = tomlJson({ fileUrl: configFile });

const serveCommands = new Command()
  //.option("-u, --username [val:string]", "Username of ftp account.", { global: true, required: true })
  .description("Run your Ftp serveur.")
  .option("-d, --debug [debug:boolean]", "Active debug mode", { default: null })
  .action(async ({ debug }) => {
    await upgradable();
    if ((debug === null && config.options.debug) || debug) console.log("Start serve with debug mode");
    const serve = new Server(config.addr, config.options);
    for await (const connection of serve) {
      const { awaitUsername, awaitLogin } = connection;
      let user: Model;
      awaitUsername.then(async ({ username, resolveUsername }: UsernameResolvable) => {
        const found = await Users.where('username', username).get();
        if ((found instanceof Array && found.length === 0) || !found) return resolveUsername.reject("Incorrect username!");
        user = (found instanceof Array) ? found[0] : found;
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