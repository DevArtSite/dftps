import { MuxAsyncIterator, BufWriter, assert } from "./deps.ts";
import { BufReader } from "https://deno.land/std@0.97.0/io/bufio.ts";
import type { ReadLineResult } from "https://deno.land/std@0.97.0/io/bufio.ts";
const listener = Deno.listen({ port: 2121 });

class Reader implements AsyncIterable<Uint8Array> {
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
console.log(`Listen on ${(listener.addr as Deno.ListenOptions).hostname}:${(listener.addr as Deno.ListenOptions).port}`)
for await (const conn of listener) {
  console.log(`New connection with rid: ${conn.rid}`);
  const writer = BufWriter.create(conn);
  const encode = new TextEncoder().encode;
  const content = encode('220 Welcome\r\n');
  const n = await writer.write(content);
  assert(n === content.byteLength);
  await writer.flush();
  console.log("start read")
  const reader = new Reader(conn);
  for await (const uint of reader) {
    console.log(new TextDecoder().decode(uint));
  }
  console.log("Reader ended")
}