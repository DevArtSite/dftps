import {
  BufReader,
  BufWriter
} from "../../../deps.ts";
import Connection from "../connection.ts";
export default class ActiveConnector {
  hostname?: string;
  port?: number;
  connection: Connection;
  reader?: BufReader;
  writer?: BufWriter;
  conn?: Deno.Conn;

  constructor(connection: Connection) {
    this.connection = connection
  }

  private async connect({ hostname, port }: { hostname: string, port: number }): Promise<Deno.Conn> {
    if (!this.connection.serve.secure && !(this.connection.serve.addr as Deno.ListenTlsOptions).certFile) {
      return await Deno.connect({ hostname, port });
    } else {
      const certFile = (this.connection.serve.addr as Deno.ListenTlsOptions).certFile
      return await Deno.connectTls({ hostname, port, certFile });
    }
  }

  close(): void {
    try {
      if (this.conn) this.conn.close();
    } catch(e) {
      console.error("Erreur de fermeture du serveur passif: ", e);
    }
  }

  async accept () {
    if (!this.conn && this.hostname && this.port) this.conn = await this.connect({ hostname: this.hostname, port: this.port });
    if (this.conn) this.reader = new BufReader(this.conn);
    if (this.conn) this.writer = new BufWriter(this.conn);
    return this;
  }

  async create(hostname: string, port: number) {
    try {
      this.hostname = hostname;
      this.port = port;
      if (this.conn) this.conn.close();
      this.conn = await this.connect({ hostname, port });
    } catch(e) {
      throw e;
    }
  }
}