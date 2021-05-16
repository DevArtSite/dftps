import {
  deferred,
  BufWriter,
  assert,
} from "../../deps.ts";
import { Server } from "./mod.ts";
import Logger from "../_utils/logger.ts";
import { STATUS_TEXT } from "./ftp_status.ts";
import { compact } from "../_utils/lodash.ts";

import { findCommand, parseCommand } from "./commands/_REGISTRY.ts";

import FileSystem from "./filesystem.ts";

import PassiveConnection from "./connectors/passive.ts";
import ActiveConnection from "./connectors/active.ts";

import type { Deferred } from "../../deps.ts";
import type { FTPServerOptions } from "./mod.ts";

export type replyOptions = {
  code?: number;
  useEmptyMessage?: boolean;
  eol?: string;
  writer?: BufWriter;
}
export type replyLetter = {
  message?: string;
  encoding?: string;
  raw?: boolean;
  code?: number;
  writer?: BufWriter;
}
export type replyLetters = string | undefined | replyLetter;

export type UsernameResolvable = {
	username: string;
	resolveUsername: Deferred<void>;
}

export type LoginResolvable = {
	password: string;
	resolvePassword: Deferred<LoginData>;
}

export type LoginData = {
	root: string;
  uid: number;
  gid: number;
	cwd?: string;
	fs?: FileSystem;
	blacklist?: string[];
}

export default class Connection {
  #closed = false;

  localAddr: Deno.NetAddr;
  remoteAddr: Deno.NetAddr;

  logger: Logger;

  username?: string;
  awaitUsername: Deferred<UsernameResolvable> = deferred();
  awaitLogin: Deferred<LoginResolvable> = deferred();
  uid?: number;
  gid?: number;
  authenticated = false;
  
  fs?: FileSystem;
  transferType = "binary";
  encoding = 'utf8';
  connector?: PassiveConnection | ActiveConnection;
  restByteCount = 0;
  bufferSize = 0;
  done: Deferred<Error | undefined> = deferred();
  #checkHealthInt?: number;

  serve: Server;
  conn: Deno.Conn;
  options: FTPServerOptions & { pasvUrl: string };
  constructor(serve: Server, conn: Deno.Conn, options: FTPServerOptions & { pasvUrl: string }) {
    this.serve = serve;
    this.conn = conn; 
    this.localAddr = (conn.localAddr as Deno.NetAddr);
    this.remoteAddr = (conn.remoteAddr as Deno.NetAddr);
    this.options = options;
    
    this.logger = new Logger({ prefix: `[Connection (rid: ${conn.rid})] => ` });
    this.reply(220, "Welcome").then().catch((error: Error) => { throw error; });
  }

  get closed() {
    return this.#closed;
  }

  /** Api to wait receiving username from connection */
  async setUsername(username: string): Promise<void> {
    const resolveUsername: Deferred<void> = deferred();
    this.awaitUsername.resolve({ username, resolveUsername })
    try {
      await resolveUsername;
      this.username = username;
      return;
    } catch (e) {
      this.logger.error(e);
      await this.reply(430, e).catch((error: Error) => { throw error; });
    }
  }

  /** Api to wait receiving password from connection and finalize the user authenticate */
  async login (password: string): Promise<void> {
    const resolvePassword: Deferred<LoginData> = deferred();
    this.awaitLogin.resolve({ password, resolvePassword });
    //{ root = '', cwd = '', fs = null, blacklist = [] }
    const data = await resolvePassword.catch(async (error: Error) => {
      this.logger.error(error);
      await this.reply(430, error).catch((error: Error) => { throw error; });
    });
    if (!data) return await this.reply(430, 'LoginData undefined').catch((error: Error) => { throw error; });
    const { root, uid, gid } = data;

    if (data.blacklist && data.blacklist.length > 0) data.blacklist.forEach((directive: string) => {
      if (!this.options.blacklist) this.options.blacklist = [];
      if (this.options.blacklist.indexOf(directive) === -1) this.options.blacklist.push(directive);
    });
    // command.blacklist = _.concat(this.commands.blacklist, blacklist);
    this.fs = data.fs || new FileSystem(this, { root, cwd: data.cwd || '', uid, gid });
    this.authenticated = true;
    this.logger.info(`Login username ${this.username} success`);
    return;
  }

  /** Close connection */
  async close(code?: number, message?: string): Promise<void> {
    try {
      if (code) await this.reply(code, message);
      if (this.connector) this.connector.close();
      this.#closed = true;
      return await this.done.resolve(new Error(message));
    } catch (e) {
      throw e;
    } 
  }
  
  /** reply to connection */
  async reply(_options: replyOptions | number, letters?: replyLetters | replyLetters[]): Promise<void> {
    let options: replyOptions = {};
    if (typeof _options === 'number') options = { code: _options }; // allow passing in code as first param
    else options = _options;
    if (!Array.isArray(letters)) letters = [letters];
    if (!letters.length) letters = [{}];

    const satisfiedLetters = letters.map((letter, index): replyLetter => {
      if (!letter) letter = {};
      else if (typeof letter === 'string') letter = { message: letter }; // allow passing in message as first param

      if (!letter.writer) letter.writer = options.writer ? options.writer : BufWriter.create(this.conn);
      if (!options.useEmptyMessage) {
        if (!letter.message) letter.message = (!options.code || !STATUS_TEXT.has(options.code)) ? 'No information' : STATUS_TEXT.get(options.code);
        if (!letter.encoding) letter.encoding = this.encoding;
      }
      if (!options.useEmptyMessage) {
        const seperator = (letters && letters instanceof Array && !options.eol) ?
          letters.length - 1 === index ? ' ' : '-' :
          options.eol ? ' ' : '-';
          if (letter && typeof letter !== 'string') letter.message = (!letter || typeof letter === 'string' || !letter.raw || typeof letter.raw !== 'string') ? compact([(!letter || typeof letter === 'string' || !letter.code) ? options.code : letter.code, letter.message]).join(seperator) : letter.message;
      } else {
        if (letter && typeof letter !== 'string') letter.message = '';
      }
      return letter;
    })

    for (const letter of satisfiedLetters) {
      if (letter && typeof letter !== 'string' && letter.writer) {
        this.logger.info(`Reply: ${letter.message}`)
        try {
          const content = encode(letter.message + '\r\n');
          const n = await letter.writer.write(content);
          assert(n === content.byteLength);
          await letter.writer.flush();
        } catch (e) {
          this.logger.error(e);
          try {
            // Eagerly close on error.
            await this.conn.close();
          } catch {
            // Pass
          }
        }
      } else this.logger.error({message: letter.message}, 'Could not write message');
    }
  }

  /** Handle commands from connection */
  async commands(): Promise<void> {
    for await (const buffer of Deno.iter(this.conn)) {
      try {

        /** Read data from connection */
        const line = new TextDecoder().decode(buffer);
        if (!line) return;
        //this.logger.debug(line, line.length);
        /** Parse data */
        const parsed = parseCommand(line);
        if (!parsed.directive) return;

        /** Reject blacklisted */
        if (this.options.blacklist && this.options.blacklist.indexOf(parsed.directive) !== -1) {
          return this.reply(502, `Command blacklisted: ${parsed.directive}`);
        }

        /** Find command */
        const Constructor = findCommand(parsed.directive);
        if (!Constructor) return;

        /** Instanciate of command */
        const command = new Constructor(this, parsed);
        if (!command) return await this.reply(502, "Command not implemented");

        this.logger.info(`Command: ${command.directive} with args: ${(command.directive === "PASS") ? "********" : command.data.args}`);
        
        /*** Clear check health interval to prevent conflict with command */
        clearInterval(this.#checkHealthInt)
        
        /** Run function handler */
        await command.handler();
      } catch (e) {
        throw e;
      }
    }
    try {
      await this.close();
    } catch (_) { /** It's closed */ }
  }
}

function encode(input?: string): Uint8Array {
  return new TextEncoder().encode(input);
}