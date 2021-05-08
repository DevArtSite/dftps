import Connection from "../connection.ts";
import type { CommandData } from "./_REGISTRY.ts";
import { REGISTRY } from "./_REGISTRY.ts";
import type { CommandConstructor } from "./_REGISTRY.ts";

export default class Feat {
  static directive = 'FEAT';
  static syntax = '{{cmd}}';
  static description = 'Get the feature list implemented by the server';
  static flags = {
    noAuth: true
  }

  description = Feat.description;
  syntax = Feat.syntax;
  directive = Feat.directive;
  flags = Feat.flags;

  constructor(private conn: Connection, public data: CommandData) {}

  async handler(): Promise<void> {
    const features: string[] = ['UTF8'];
    REGISTRY.forEach((Command: CommandConstructor) =>
      (Command.flags && Command.flags.feat) ? features.concat(Command.flags.feat) : void 0)
    
    features.map((feat) => ({
      message: ` ${feat}`,
      raw: true
    }));
    if (features.length) return await this.conn.reply(211, `Extensions supported ${features.toString()} End`);
    else return await this.conn.reply(211, 'No features');
  }
}