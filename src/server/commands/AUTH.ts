import Connection from "../connection.ts";
import type { CommandData } from "./_REGISTRY.ts";

export default class Auth {
  static directive = "AUTH";
  static syntax = '{{cmd}} <type>';
  static description = 'Set authentication mechanism';
  static flags = {
    noAuth: true,
    feat: 'AUTH TLS'
  };


  description = Auth.description;
  syntax = Auth.syntax;
  directive = Auth.directive;
  flags = Auth.flags;

  constructor(private conn: Connection, public data: CommandData) {}

  async handler(): Promise<void> {
    try {
      if (!(this.conn.serve.addr as Deno.ListenTlsOptions).certFile) return await this.conn.reply(502, "This server does not support TLS");
      if (this.conn.serve.secure) return await this.conn.reply(202);
      this.conn.serve.listener = Deno.listenTls((this.conn.serve.listener.addr as Deno.ListenTlsOptions));
      const conn = await this.conn.serve.listener.accept();
      this.conn.conn = conn;
      this.conn.serve.secure = true;
      return;
    } catch (e) {
      e.code ||= 504;
      throw e;
    }
  }
}

