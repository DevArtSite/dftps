import Connection from "../connection.ts";
import type { CommandData } from "./_REGISTRY.ts";
import { readableStreamFromReader } from "../../../deps.ts";

export default class Stor {
  static directive = ["STOR", "APPE"];
  static syntax = '{{cmd}} [<path>]';
  static description = 'Store data as a file at the server';
  static flags = {};


  description = Stor.description;
  syntax = Stor.syntax;
  directive = Stor.directive;
  flags = Stor.flags;

  constructor(private conn: Connection, public data: CommandData) {}

  async handler(): Promise<void> {
    try {
      if (!this.conn.fs) return await this.conn.reply(550, 'File system not instantiated');
      if (!this.conn.fs.read) return await this.conn.reply(402, 'Not supported by file system');
      if (!this.data.args) return await this.conn.reply(501, 'File name not found!');
      if (!this.conn.connector) return await this.conn.reply(402, 'Not passive found');
      if (!this.conn.connector.conn) await this.conn.connector.accept();
      if (!this.conn.connector.conn) return await this.conn.reply(402, 'Not passive connection found');
      const append = this.data.directive === 'APPE';
      const filePath = this.data.args;

      await this.conn.reply(150);
      const readbleStream = readableStreamFromReader(this.conn.connector.conn).getIterator();
      for await (const chunk of readbleStream) await this.conn.fs.write(filePath, chunk, { append });
      await this.conn.reply(226, filePath);
      return this.conn.connector.close();
    } catch (e) {
      e.code ||= 550;
      throw e;
    }
  }
}
