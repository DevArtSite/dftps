import { MuxAsyncIterator, BufReader } from "../../deps.ts";
import type { ReadLineResult } from "../../deps.ts";

class IterablleReader implements AsyncIterable<Uint8Array> {
  #closed = false;
  constructor(public conn: Deno.Conn, public length: number = 1024) {}

  close() {
    this.#closed = true;
  }

  private async *acceptAndIterateFtpConnections(
    mux: MuxAsyncIterator<Uint8Array>
  ): AsyncIterableIterator<Uint8Array> {
    if (this.#closed) return;
    try {
      const reader = new BufReader(this.conn);
      const result: ReadLineResult | null = await reader.readLine();
      if (!result) return;
      const uint = result.line;
      // Try to accept another connection and add it to the multiplexer.
      mux.add(this.acceptAndIterateFtpConnections(mux));
      // Yield the requests that arrive on the just-accepted connection.
      yield uint;
    } catch (e) {
      throw e;
    }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    const mux: MuxAsyncIterator<Uint8Array> = new MuxAsyncIterator();
    mux.add(this.acceptAndIterateFtpConnections(mux));
    return mux.iterate();
  }
}

export default IterablleReader;