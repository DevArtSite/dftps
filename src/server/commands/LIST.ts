import Connection from "../connection.ts";
import type { CommandData } from "./_REGISTRY.ts";
import { BufWriter } from "../../../deps.ts";
import type { FileInfo } from "../filesystem.ts";
import type { replyLetter } from "../connection.ts";

export default class List {
  static directive = ["LIST", "NLST"];
  static syntax = '{{cmd}} [<path>]';
  static description = 'Returns information of a file or directory if specified, else information of the current working directory is returned';
  static flags = {};


  description = List.description;
  syntax = List.syntax;
  directive = List.directive;
  flags = List.flags;

  constructor(private conn: Connection, public data: CommandData) {}

  async handler(): Promise<void> {
    try {
      if (!this.conn.fs) return await this.conn.reply(550, 'File system not instantiated');
      if (!this.conn.fs.get) return await this.conn.reply(402, 'Not supported by file system');
      if (!this.conn.fs.list) return await this.conn.reply(402, 'Not supported by file system');
      const simple = this.data.directive === 'NLST';
      const path = this.data.args || '.';
      const fs = this.conn.fs
      if (this.conn.connector) {
        await this.conn.connector.accept();
        if (!this.conn.connector.conn) return await this.conn.close(402, 'Not passive writer found');
        const writer = BufWriter.create(this.conn.connector.conn)
        const stat = await fs.get(path);
        const files = (stat && stat.isDirectory) ? await fs.list(path) : [stat];
      
        const fileList = files.map((file: void | FileInfo): replyLetter => {
          if (!file) throw new Error('no file');

          let message: string;
          if (simple) message = file.name;
          const format = (!this.conn.options || !this.conn.options.fileFormat) ? 'ls' : this.conn.options.fileFormat
          const stat = fs.stat(file, format);
          message = (!stat) ? '' : stat

          return { raw: true, message, writer };
        });
        await this.conn.reply(150)
      
        if (fileList && fileList.length) await this.conn.reply({}, fileList);
        else await this.conn.reply({ writer: writer, useEmptyMessage: true});
        
        this.conn.connector.close();
        return await this.conn.reply(226, 'Transfer OK');

      } else return await this.conn.reply(402, 'Not passive found');
    } catch (e) {
      e.code ||= 226;
      throw e;
    }
  }
}
