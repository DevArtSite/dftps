
import { DPath, v4, format, exists } from "../../deps.ts";
import { padStart } from "../_utils/lodash.ts";
import Connection from "./connection.ts";

export type FileSystemOptions = {
  root: string;
  cwd?: string;
  uid: number;
  gid: number
}

export type statFunction = (fileStat: FileInfo) => string
export type FileInfo = Deno.FileInfo & { name: string }

export type StreamFile = { 
  stream: Deno.File;
  clientPath: string;
}

type ResolvedPath = {
  clientPath: string,
  fsPath: string
}

export default class FileSystem {
  connection: Connection;
  cwd: string;
  private _root: string;
  uid: number;
  gid: number;

  renameFrom = "";

  constructor(connection: Connection, { cwd, root, uid, gid }: FileSystemOptions) {
    this.connection = connection;
    this.cwd = DPath.normalize(cwd ? DPath.join(DPath.sep, cwd) : DPath.sep);
    this._root = DPath.resolve(root || Deno.cwd());
    this.uid = uid;
    this.gid = gid;
  }

  get root() {
    return this._root;
  }

  async access(path: string): Promise<boolean> {
    const stat = await Deno.stat(path);
    return (this.uid === 0 || this.gid === 0 || this.uid === stat.uid || this.gid === stat.gid)
  }

  async own(): Promise<{ uid: number | null, gid: number | null }> {
    const stat = await Deno.stat(this._root);
    const uid = (this.uid) ? this.uid : stat.uid;
    const gid = (this.gid) ? this.gid : stat.uid;
    return { uid, gid };
  }

  _resolvePath(path = '.'): ResolvedPath {
    const normalPath = DPath.normalize(path);
    const clientPath = (DPath.isAbsolute(normalPath)) ? path : DPath.join(this.cwd, normalPath);
    const fsPath = DPath.resolve(DPath.normalize(DPath.join(this.root, clientPath)));
    return { clientPath, fsPath };
  }

  currentDirectory() {
    return this.cwd;
  }

  async get(fileName: string): Promise<FileInfo> {
    try {
      const { fsPath } = this._resolvePath(fileName);
      const stat = await Deno.stat(fsPath);
      return Object.assign(stat, { name: fileName });
    } catch (e) { throw e }
  }

  private FORMATS: Record<string, statFunction> = { ls, ep }
  stat(fileStat: FileInfo, format: string | statFunction = 'ls') {
    if (typeof format === 'function') {
      try {
        const result = format(fileStat);
        if (result) return result 
      } catch (e) {
        throw e
      }
    } else if (typeof format === 'string') {
      if (typeof this.FORMATS[format] === 'undefined') {
        throw new Error('Bad file stat formatter');
      }
      return this.FORMATS[format](fileStat);
    } else return ''
  }

  async list(path = '.') {
    const { fsPath } = this._resolvePath(path);
    const files = []
    for await (const dirEntry of Deno.readDir(fsPath)) {
        const fileName = dirEntry.name
        const filePath = DPath.join(fsPath, fileName);
        const access = this.access(filePath);
        const stat = await Deno.stat(filePath);
        if (access/*(this.uid === 0 || this.gid === 0 || this.uid === stat.uid || this.gid === stat.gid)*/) {
          files.push(Object.assign(stat, { name: fileName }));
        }
    }
    return files;
  }

  async chdir(path = '.'): Promise<string> {
    const { fsPath, clientPath } = this._resolvePath(path);
    try {
      const FileInfo = await Deno.stat(fsPath);
      if (!FileInfo.isDirectory) throw new Error('Not a valid directory');
      this.cwd = clientPath;
      return this.cwd;
    } catch(e) {
      const poped = path.split("/")
      poped.pop()
      return this.chdir(poped.join("/"));
    }
  }

  async write(fileName: string, data: Uint8Array, { append = false } = {}): Promise<void> {
    const { fsPath } = this._resolvePath(fileName);
    if (await exists(fsPath)) {
      const access = this.access(fsPath);
      if (!access) throw new Error("You don't have permissions!");
    }
    let chown = false;
    if (!await exists(fsPath)) chown = true;
    await Deno.writeFile(fsPath, data, { append });
    if (chown) await this.chown(fsPath);
  }

  async read(fileName: string): Promise<StreamFile> {
    const {fsPath, clientPath} = this._resolvePath(fileName);
    const access = this.access(fsPath);
    if (!access) throw new Error("You don't have permissions!");
    const stream = await Deno.open(fsPath, { read: true });
    return {
      stream,
      clientPath
    };
  }

  async delete(path: string): Promise<void> {
    const { fsPath } = this._resolvePath(path);
    const access = this.access(fsPath);
    if (!access) throw new Error("You don't have permissions!");
    return await Deno.remove(fsPath, { recursive: true });
  }

  async mkdir(path: string): Promise<string> {
    const { fsPath } = this._resolvePath(path);
    await Deno.mkdir(fsPath, { recursive: true });
    await this.chown(fsPath);
    return fsPath;
  }

  async rename(from: string, to: string) {
    const { fsPath: fromPath} = this._resolvePath(from);
    const { fsPath: toPath} = this._resolvePath(to);
    const access = this.access(fromPath);
    if (!access) throw new Error("You don't have permissions!");
    return await Deno.rename(fromPath, toPath);
  }

  async chmod(path: string, mode: number) {
    const { fsPath } = this._resolvePath(path);
    const access = this.access(fsPath);
    if (!access) throw new Error("You don't have permissions!");
    return await Deno.chmod(fsPath, mode);
  }

  async chown(path: string, _uid?: number, _gid?: number): Promise<void> {
    const { uid, gid } = await this.own();
    const access = this.access(path);
    if (!access) throw new Error("You don't have permissions!");
    await Deno.chown(path, _uid || uid, _gid || gid);
  }

  getUniqueName(): string {
    return v4.generate().replace(/\W/g, '');
  }
}

export function ls(fileStat: FileInfo): string {
  const now = new Date();
  const mtime = (!fileStat.mtime)? now : new Date(fileStat.mtime);
  const timeDiff = now.getMonth() - mtime.getMonth() + (12 * (now.getFullYear() - mtime.getFullYear()))
  const dateFormat = timeDiff < 6 ? 'MM dd hh:mm' : 'MM dd yyyy';

  return [
    fileStat.mode ?
      [
        fileStat.isDirectory ? 'd' : '-',
        fileStat.mode & 256 ? 'r' : '-',
        fileStat.mode & 128 ? 'w' : '-',
        fileStat.mode & 64 ? 'x' : '-',
        fileStat.mode & 32 ? 'r' : '-',
        fileStat.mode & 16 ? 'w' : '-',
        fileStat.mode & 8 ? 'x' : '-',
        fileStat.mode & 4 ? 'r' : '-',
        fileStat.mode & 2 ? 'w' : '-',
        fileStat.mode & 1 ? 'x' : '-'
      ].join('')
    :
      fileStat.isDirectory ? 'drwxr-xr-x' : '-rwxr-xr-x',
    '1',
    fileStat.uid || 1,
    fileStat.gid || 1,
    padStart(fileStat.size.toString(), 12),
    padStart(format(mtime, dateFormat), 12),
    ' ',
    fileStat.name
  ].join(' ');
}

function ep(fileStat: FileInfo): string {
  const facts = compact([
    fileStat.dev && fileStat.ino ? `i${fileStat.dev.toString(16)}.${fileStat.ino.toString(16)}` : null,
    fileStat.size ? `s${fileStat.size}` : null,
    fileStat.mtime ? `m${new Date(fileStat.mtime).getTime()}` : null,
    fileStat.mode ? `up${(fileStat.mode & 4095).toString(8)}` : null,
    fileStat.isDirectory ? '/' : 'r'
  ]).join(',');
  return `+${facts}\t${fileStat.name}`;
}

function compact(array: Array<string | null>): Array<string | null> {
  let resIndex = 0
  const result:Array<string | null> = []
  if (array == null) return result
  for (const value of array) {
    if (value) result[resIndex++] = value
  }
  return result
}