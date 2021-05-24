import {
  deferred,
  BufWriter,
  assert
} from "../../deps.ts";
import Server from "./mod.ts";
import IterablleReader from "../_utils/iterableReader.ts";
import Logger, { Colors } from "../_utils/logger.ts";
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

const HIDDEN_TO_SECURE = "HIDDEN_TO_SECURE";

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
  software?: string;

  reader: IterablleReader;
  fs?: FileSystem;
  transferType = "binary";
  encoding = 'utf8';
  connector?: PassiveConnection | ActiveConnection;
  restByteCount = 0;
  bufferSize = 0;
  done: Deferred<string | undefined> = deferred();

  serve: Server;
  conn: Deno.Conn;
  options: FTPServerOptions & { pasvUrl: string };
  rid: number;
  constructor(serve: Server, conn: Deno.Conn, options: FTPServerOptions & { pasvUrl: string }) {
    this.serve = serve;
    this.conn = conn;
    this.reader = new IterablleReader(conn);
    this.rid = conn.rid;
    this.localAddr = (conn.localAddr as Deno.NetAddr);
    this.remoteAddr = (conn.remoteAddr as Deno.NetAddr);
    this.options = options;
    
    this.logger = Logger.create({ prefix: `[Connection (rid: ${conn.rid})] => ` });
    setTimeout(async () => await this.reply(220, "Welcome"), 500);
  }

  // deno-lint-ignore no-explicit-any
  private debug(...args: any[]): void {
    this.logger.debug("Debug: ", ...args);
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
      return this.logger.success(`Username: ${this.username} accepted.`);
    } catch (e) {
      this.logger.error(e);
      await this.reply(430, e);
    }
  }

  /** Api to wait receiving password from connection and finalize the user authenticate */
  async login (password: string): Promise<void> {
    const resolvePassword: Deferred<LoginData> = deferred();
    this.awaitLogin.resolve({ password, resolvePassword });
    //{ root = '', cwd = '', fs = null, blacklist = [] }
    const data = await resolvePassword.catch(async (error: Error) => {
      this.logger.error(error);
      await this.reply(430, error);
    });
    if (!data) return await this.reply(430, 'LoginData undefined');
    const { root, uid, gid } = data;

    if (data.blacklist && data.blacklist.length > 0) data.blacklist.forEach((directive: string) => {
      if (!this.options.blacklist) this.options.blacklist = [];
      if (this.options.blacklist.indexOf(directive) === -1) this.options.blacklist.push(directive);
    });
    // command.blacklist = _.concat(this.commands.blacklist, blacklist);
    this.fs = data.fs || new FileSystem(this, { root, cwd: data.cwd || '', uid, gid });
    const access = await this.fs.access(root);
    if (!access) return await this.reply(550, "You do not have the required permissions to access the root directory or the root folder does not exist.");
    this.authenticated = true;
    this.logger.success(`Login: user ${this.username} connected.`);
    return;
  }

  /** Close connection */
  async close(code?: number, message?: string): Promise<void> {
    try {
      if (code) await this.reply(code, message);
      if (this.connector) this.connector.close();
      this.#closed = true;
      await this.done.resolve(message);
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
        this.logger.info(Colors.FgCyan, ` Reply: ${letter.message}`);
        try {
          const content = encode(letter.message + '\r\n');
          const n = await letter.writer.write(content);
          /** Debug reply message */
          this.debug(`reply assert write, (${n}===${content.byteLength}) => ${(n === content.byteLength)}`);
          assert(n === content.byteLength);
          await letter.writer.flush();
        } catch (e) {
          if (!(e instanceof Deno.errors.BadResource)) {
            await this.serve.webhookError(e);
            this.logger.error(e);
          }
          try {
            // Eagerly close on error.
            await this.conn.close();
          } catch {
            // Pass
          }
        }
      } else {
        this.logger.error({message: letter.message}, 'Could not write message');
      }
    }
  }

  /** Handle commands from connection */
  async commands(): Promise<void> {
    for await (const uint of this.reader) {
      try {
        const line = new TextDecoder().decode(uint);
        if (!line) return;

        /** Debug line */
        this.debug(`commands new line: ${line}`);

        /** Parse data */
        const parsed = parseCommand(line);
        if (!parsed.directive) return;

        /** Debug parsed */
        if(parsed.directive === "PASS") {
          const pass = parsed.args;
          const raw = parsed.raw;
          parsed.args = HIDDEN_TO_SECURE;
          parsed.raw = HIDDEN_TO_SECURE;
          this.debug(`commands line parsed: `, parsed);
          parsed.args = pass;
          parsed.raw = raw;

        } else this.debug(`commands line parsed: `, parsed);

        /** Reject blacklisted */
        if (this.options.blacklist && this.options.blacklist.indexOf(parsed.directive) !== -1) {
          return this.reply(502, `Command blacklisted: ${parsed.directive}`);
        }

        /** Find command */
        const Constructor = findCommand(parsed.directive);
        if (!Constructor) return await this.reply(502, "Command not implemented");

        /** Debug Constructor */
        this.debug(`commands Constructor name: ${Constructor.name}`);

        /** Instanciate of command */
        const command = new Constructor(this, parsed);
        if (!command) return await this.reply(502, "Command not implemented");

        this.logger.info(`Command: ${command.directive} with args: ${(command.directive === "PASS") ? HIDDEN_TO_SECURE : command.data.args}`);
        
        /** Run function handler */
        await command.handler();

        /** Debug command handler */
        this.debug(`commands handler is to finish without error.`);
      } catch (e) {
        /** Debug command errors */
        this.debug(`commands error catch.`, e);
        if (e instanceof Deno.errors.BadResource) continue;
        this.logger.error(e);
        await this.serve.webhookError(e);
        await this.reply(e.code || 550, e.message);
      }
    }
    try {
      this.serve.debug(`Close connection after data iterator, id: ${this.conn.rid}`);
      await this.close();
    } catch (_) { /** It's closed */ }
  }
}

function encode(input?: string): Uint8Array {
  return new TextEncoder().encode(input);
}