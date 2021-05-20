import { MuxAsyncIterator, DenoStdInternalError } from "../../deps.ts"
import Logger from "../_utils/logger.ts";
import Connection from "./connection.ts";

/** Options for creating an FTP listener server. */
export type FTPOptions = Omit<Deno.ListenOptions, "transport">;

/** General options of ftp server */
export type FTPServerOptions = {
  /** Debug mode */
  debug?: boolean;
  /** Url for passive connection. */
  pasvUrl?: string;
  /** Minimum port for passive connection. */
  pasvMin?: number;
  /** Maximum port for passive connection. */
  pasvMax?: number;
  /** Handle anonymous connexion. */
  anonymous?: boolean;
  /** Sets the format to use for file stat queries such as "LIST". */
  fileFormat?: string;
  /** Array of commands that are not allowed */
  blacklist?: string[];
  /** Url of webhook like Discord webhook */
  webhook?: string;
}

export type webookOptions = string | number | Error;

class Server implements AsyncIterable<Connection> {
  #closed = false;
  #connections: Connection[] = [];

  /** TCP listener options */
  addr: Deno.ListenOptions | Deno.ListenTlsOptions;
  options: FTPServerOptions & { pasvUrl: string };
  /** TCP listener */
  listener: Deno.Listener;
  secure = false;

  logger: Logger;
  constructor(addr: Deno.ListenOptions | Deno.ListenTlsOptions, _options?: FTPServerOptions) {
    this.logger = Logger.create({ prefix: "[Server] =>" });

    /** Listener options initializer assigned to default listener options */
    this.addr = Object.assign({
      hostname: "127.0.0.1",
      port: 21
    }, addr);

    /** General options initializer assigned to default general options */
    this.options = Object.assign({
      pasvUrl: (this.addr as Deno.NetAddr).hostname
    }, _options);

    /** Debug listener options */
    this.debug("Listener options: ", (this.addr as Deno.ListenTlsOptions));

    if (!(this.addr as Deno.ListenTlsOptions).certFile) {
      /** Start listener without tls */
      this.listener = Deno.listen((this.addr as Deno.ListenOptions));
    } else {
      this.logger.warn("Listener over TLS has not been completely tested and is likely to have malfunctions, some certificate can unfortunately still be supported by deno and can therefore cause errors.")
      /** Start listener with tls */
      this.listener = Deno.listenTls((this.addr as Deno.ListenTlsOptions));
      this.secure = true;
    }
    //this.serve.debug("Connection: ", (this.addr as Deno.ListenTlsOptions));
    /** Info of  */
    this.logger.info(`Listen on ${this.addr.hostname}:${this.addr.port} ${(this.secure) ? "with" : "without"} TLS`);
  }

  // deno-lint-ignore no-explicit-any
  debug(...args: any[]): void {
    if (this.options?.debug) this.logger.debug(...args);
  }

  async webhookError(...args: webookOptions[]) {
    if (!this.options.webhook) return;
    this.debug("Send Error on webhook: ", this.options.webhook);
    const content = args.map((arg: webookOptions) => {
      return (typeof arg === "string" || typeof args === "number") ? arg
      : (arg instanceof Error) ? `${arg.stack}`
        : (arg.toString) ? arg.toString
          : `${arg}`;
    }).join("\\n");

    const options = {
      method: 'POST',
      body: JSON.stringify({
        content,
        avatar_url: "https://github.com/DevArtSite/dftps/raw/main/assets/dftps_logo_tiny.png",
        username: "DFtpS"
      }),
      headers: { 'Content-Type': 'application/json' }
    }
    try {
      await fetch(this.options.webhook, options);
    } catch(e) {
      this.logger.error("WebhookError - ", e);
    }
  }

  /** Close all connections and listener */
  async close(): Promise<void> {
    this.#closed = true;
    this.listener.close();
    for (const conn of this.#connections) {
      try {
        await conn.close();
      } catch (e) {
        // Connection might have been already closed
        if (!(e instanceof Deno.errors.BadResource)) await this.webhookError(e);
      }
    }
    this.debug("Listener closed");
  }

  private trackConnection(conn: Connection): void {
    this.debug("Track connection: ", conn.rid);
    this.#connections.push(conn);
  }

  private untrackConnection(conn: Connection): void {
    this.debug("Untrack connection: ", conn.rid);
    const index = this.#connections.indexOf(conn);
    if (index !== -1) this.#connections.splice(index, 1);
  }

  // Yields all FTP conenction.
  private async *iterateConnections(
    conn: Deno.Conn,
  ): AsyncIterableIterator<Connection> {
    const connection = new Connection(this, conn, this.options);
    const local = connection.localAddr;
    const remote = connection.remoteAddr;
    this.logger.success(`New connection on ${connection.localAddr.transport}://${local.hostname}:${local.port} from ${remote.transport}://${remote.hostname}:${remote.port}`);
	
    if (connection) connection.done.then((message?: string) => {
      this.logger.warn(`Connection closed on ${local.transport}://${local.hostname}:${local.port} from ${remote.transport}://${remote.hostname}:${remote.port}`);
      this.debug("Connection close with: ", message);
      return this.untrackConnection(connection);
    })
    this.trackConnection(connection);
    yield connection;

    try {
      await connection.commands();
      this.debug("Connection: ", (this.addr as Deno.ListenTlsOptions));
    } catch (e) {
      if (
        e instanceof Deno.errors.BadResource ||
        e instanceof Deno.errors.InvalidData ||
        e instanceof Deno.errors.UnexpectedEof ||
        e instanceof Deno.errors.ConnectionAborted ||
        e instanceof DenoStdInternalError
      ) {
        await connection.close(500, e.message);
        //await this.webhookError(e);
      } else {
        throw e;
      }
    }
  }

  // Accepts a new TCP connection and yields all FTP requests that arrive on
  // it. When a connection is accepted, it also creates a new iterator of the
  // same kind and adds it to the request multiplexer so that another TCP
  // connection can be accepted.
  private async *acceptAndIterateFtpConnections(
    mux: MuxAsyncIterator<Connection>
  ): AsyncIterableIterator<Connection> {
    if (this.#closed) return;
    // Wait for a new connection.
    let conn: Deno.Conn;
    try {
      conn = await this.listener.accept();
      this.debug("Listener connection accepted: ", conn.rid);
    } catch (e) {
      if (
        e instanceof Deno.errors.BadResource ||
        e instanceof Deno.errors.InvalidData ||
        e instanceof Deno.errors.UnexpectedEof
      ) {
        return mux.add(this.acceptAndIterateFtpConnections(mux));
      } else {
        //this.logger.error(e)
        await this.webhookError("The ftp server will close due to:", e);
        throw e;
      }
    }
    // Try to accept another connection and add it to the multiplexer.
    mux.add(this.acceptAndIterateFtpConnections(mux));
    // Yield the requests that arrive on the just-accepted connection.
    yield* this.iterateConnections(conn);
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Connection> {
    const mux: MuxAsyncIterator<Connection> = new MuxAsyncIterator();
    mux.add(this.acceptAndIterateFtpConnections(mux));
    return mux.iterate();
  }
}

export default Server;
