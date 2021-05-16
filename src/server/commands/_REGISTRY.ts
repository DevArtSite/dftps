import Connection from "../connection.ts";
import User from "./USER.ts";
import Pass from "./PASS.ts";
import Syst from "./SYST.ts";
import Feat from "./FEAT.ts";
import Pwd  from "./PWD.ts";
import Type from "./TYPE.ts";
import Pasv from "./PASV.ts";
import List from "./LIST.ts";
import Opts from "./OPTS.ts";
import Auth from "./AUTH.ts";
import Cwd  from "./CWD.ts";
import Retr from "./RETR.ts";
import Rest from "./REST.ts";
import Stor from "./STOR.ts";
import Mkd  from "./MKD.ts";
import Dele from "./DELE.ts";
import Cdup from "./CDUP.ts";
import Rmd  from "./RMD.ts";
import Abor from "./ABOR.ts";
import Site from "./SITE.ts";
import Allo from "./ALLO.ts";
import Appe from "./APPE.ts";
import Eprt from "./EPRT.ts";
import Epsv from "./EPSV.ts";
import Mdtm from "./MDTM.ts";
import Mode from "./MODE.ts";
import Nlst from "./NLST.ts";
import Noop from "./NOOP.ts";
import Pbsz from "./PBSZ.ts";
import Port from "./PORT.ts";
import Prot from "./PROT.ts";
import Quit from "./QUIT.ts";
import Rnfr from "./RNFR.ts";
import Rnto from "./RNTO.ts";
import Stat from "./STAT.ts";
import Stru from "./STRU.ts";

export type CommandFlags = {
  obsolete?: boolean;
  noAuth?: boolean;
  feat?: string;
}

export type CommandData = {
  directive: string | string[];
  args: string|null;
  flags: string[];
  raw: string;
}

export type Commands = 
  User |
  Pass |
  Syst |
  Feat |
  Pwd  |
  Type |
  Pasv |
  List |
  Opts |
  Auth |
  Cwd  |
  Retr |
  Rest |
  Stor |
  Mkd  |
  Dele |
  Cdup |
  Rmd  |
  Abor |
  Site |
  Allo |
  Appe |
  Eprt |
  Epsv |
  Mdtm |
  Mode |
  Nlst |
  Noop |
  Pbsz |
  Port |
  Prot |
  Quit |
  Rnfr |
  Rnto |
  Stat |
  Stru
;

export type CommandConstructor = {
  directive: string | string[];
  syntax: string;
  description: string;
  flags: CommandFlags;
  new (conn: Connection, data: CommandData): Commands;
}

export const REGISTRY: Array<CommandConstructor> = [
  User,
  Pass,
  Syst,
  Feat,
  Pwd,
  Type,
  Pasv,
  List,
  Opts,
  Auth,
  Cwd,
  Retr,
  Rest,
  Stor,
  Mkd,
  Dele,
  Cdup,
  Rmd,
  Abor,
  Site,
  Allo,
  Appe,
  Eprt,
  Epsv,
  Mdtm,
  Mode,
  Nlst,
  Noop,
  Pbsz,
  Port,
  Prot,
  Quit,
  Rnfr,
  Rnto,
  Stat,
  Stru
];

export function findCommand(_directive: string | string[]) {
  return REGISTRY.find(({ directive }: CommandConstructor) => {
    return (
      (typeof directive === "string" && directive === _directive) ||
      (directive instanceof Array && directive.find((__directive: string) => {
        return (_directive === __directive);
      }))
    )
  });
}

export function parseCommand (message: string): CommandData & { directive: string } {
  const strippedMessage = message.replace(/"/g, '').replace("\n", '').replace("\r", '');
  const [directive, ...args] = strippedMessage.split(' ');
  const parseCommandFlags = !['RETR', 'SIZE', 'STOR'].includes(directive);
  const params = args.reduce((accu :{ args: string[]; flags: string[]; }, param) => {
    const { args, flags } = accu;
    if (parseCommandFlags && new RegExp(/^-(\w{1})$/).test(param)) flags.push(param);
    else args.push(param);
    return { args, flags };
  }, {args: [], flags: []});

  return {
    directive: directive.toUpperCase(),
    args: params.args.length ? params.args.join(' ') : null,
    flags: params.flags,
    raw: message
  };
}