import { MuxAsyncIterator, DenoStdInternalError } from "../../deps.ts"
import Logger from "../_utils/logger.ts";
import Connection from "./connection.ts";

/** Options for creating an FTP listener server. */
export type FTPOptions = Omit<Deno.ListenOptions, "transport">;

/** General options of ftp server */
export type FTPServerOptions = {
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
}

export class Server implements AsyncIterable<Connection> {
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
    // Listener options initializer assigned to default listener options
    this.addr = Object.assign({
      hostname: "127.0.0.1",
      port: 21
    }, addr);
    // General options initializer assigned to default general options
    this.options = Object.assign({
      pasvUrl: (this.addr as Deno.NetAddr).hostname
    }, _options);
    // Listener initializer
    if (!(this.addr as Deno.ListenTlsOptions).certFile) this.listener = Deno.listen((this.addr as Deno.ListenOptions));
    else {
      this.listener = Deno.listenTls((this.addr as Deno.ListenTlsOptions));
      this.secure = true;
    }
    
    this.logger = new Logger({ prefix: "[Server] =>" });
    this.logger.info(`Listen on ${this.addr.hostname}:${this.addr.port}`);
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
        if (!(e instanceof Deno.errors.BadResource)) throw e;
      }
    }
  }

  private trackConnection(conn: Connection): void {
    this.#connections.push(conn);
  }

  private untrackConnection(conn: Connection): void {
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
	
    if (connection) connection.done.then((message?: Error) => {
      this.logger.warn(`Connection closed on ${local.transport}://${local.hostname}:${local.port} from ${remote.transport}://${remote.hostname}:${remote.port}`);
      return this.untrackConnection(connection);
    })
    this.trackConnection(connection);
    yield connection;
    try {
      await connection.commands();
    } catch (error) {
      if (
        error instanceof Deno.errors.BadResource ||
        error instanceof Deno.errors.InvalidData ||
        error instanceof Deno.errors.UnexpectedEof ||
        error instanceof Deno.errors.ConnectionAborted ||
        error instanceof DenoStdInternalError
      )
        await connection.close().catch(this.logger.error)
      else
        throw error;
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
    } catch (error) {
      if (
        error instanceof Deno.errors.BadResource ||
        error instanceof Deno.errors.InvalidData ||
        error instanceof Deno.errors.UnexpectedEof
      )
        return mux.add(this.acceptAndIterateFtpConnections(mux));
      else
        throw error;
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