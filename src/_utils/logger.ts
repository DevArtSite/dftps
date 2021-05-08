import { v4 } from "https://deno.land/std@0.76.0/uuid/mod.ts";
export enum Colors {
  Reset = "\x1b[0m",
  Bright = "\x1b[1m",
  Dim = "\x1b[2m",
  Italic = "\x1b[3m",
  Underscore = "\x1b[4m",
  Blink = "\x1b[5m",
  Reverse = "\x1b[7m",
  Hidden = "\x1b[8m",
    
  FgBlack = "\x1b[30m",
  FgRed = "\x1b[31m",
  FgGreen = "\x1b[32m",
  FgYellow = "\x1b[33m",
  FgBlue = "\x1b[34m",
  FgMagenta = "\x1b[35m",
  FgCyan = "\x1b[36m",
  FgWhite = "\x1b[37m",
    
  BgBlack = "\x1b[40m",
  BgRed = "\x1b[41m",
  BgGreen = "\x1b[42m",
  BgYellow = "\x1b[43m",
  BgBlue = "\x1b[44m",
  BgMagenta = "\x1b[45m",
  BgCyan = "\x1b[46m",
  BgWhite = "\x1b[47m",

  FgLiteBlack = "\x1b[90m",
  FgLiteRed = "\x1b[91m",
  FgLiteGreen = "\x1b[92m",
  FgLiteYellow = "\x1b[93m",
  FgLiteBlue = "\x1b[94m",
  FgLiteMagenta = "\x1b[95m",
  FgLiteCyan = "\x1b[96m",
  FgLiteWhite = "\x1b[97m",

  BgLiteBlack = "\x1b[100m",
  BgLiteRed = "\x1b[101m",
  BgLiteGreen = "\x1b[102m",
  BgLiteYellow = "\x1b[103m",
  BgLiteBlue = "\x1b[104m",
  BgLiteMagenta = "\x1b[105m",
  BgLiteCyan = "\x1b[106m",
  BgLiteWhite = "\x1b[107m",
}

interface LoggerOptions {
  prefix?: string | null;
  colorize?: boolean;
  preLine?: string;
  color?: string;
}

const defaultOptions = {
  prefix: null,
  colorize: true,
  preLine: '  '
}

export default class Logger {
  options: LoggerOptions;
  constructor (options: LoggerOptions = {}) {
    if (!options) options = defaultOptions;
    this.options = Object.assign(defaultOptions, options)
  }

  create(options: LoggerOptions): Logger {
    return new Logger(options)
  }

  // deno-lint-ignore no-explicit-any
  log(...args: any): void {
    const options = getOptions.apply(this, [Colors.FgWhite])
    handle(options, ...args);
  }

  // deno-lint-ignore no-explicit-any
  success(...args: any): void {
    const options = getOptions.apply(this, [Colors.FgLiteGreen])
    handle(options, ...args);
  }

  // deno-lint-ignore no-explicit-any
  info(...args: any): void {
    const options = getOptions.apply(this, [Colors.FgLiteBlue])
    handle(options, ...args);
  }

  // deno-lint-ignore no-explicit-any
  warn(...args: any): void {
    const options = getOptions.apply(this, [Colors.FgLiteYellow])
    handle(options, ...args);
  }

  // deno-lint-ignore no-explicit-any
  error(...args: any): void {
    const options = getOptions.apply(this, [Colors.FgLiteRed])
    args = format(options, ...args);
    handle(options, Colors.Reset, ...args);
  }

  // deno-lint-ignore no-explicit-any
  debug(...args: any): void {
    const options = getOptions.apply(this, [Colors.FgLiteMagenta])
    args = format(options, ...args);
    handle(options, Colors.Reset, ...args);
  }
}

function getOptions (this: Logger, color: string): LoggerOptions {
    let options;
    if (!(this instanceof Logger)) options = Object.assign(defaultOptions, { color });
    else options = Object.assign(this.options, { color });
    return options
}

function applyColor(color: string, message: string): string {
  return color + message + Colors.Reset;
}

// deno-lint-ignore no-explicit-any
function handle(options: LoggerOptions, ...args: any): void {
  console.log(
    options.color,
    options.prefix,
    ...args,
    Colors.Reset
  )
}

// deno-lint-ignore no-explicit-any
function format(options: LoggerOptions, ...args: any): any[]{
  // deno-lint-ignore no-explicit-any
  const data: Array<any> = []
  data.push('{\n');
  // deno-lint-ignore no-explicit-any
  args.forEach((arg: any): void => {
    data.push(applyColor(options.color || Colors.FgLiteWhite, options.preLine || defaultOptions.preLine));
    if (typeof arg === 'string') data.push(options.color + arg + Colors.Reset)
    else if (arg instanceof Error) {
      if (arg.message) arg.message = applyColor(options.color || Colors.FgLiteWhite, arg.message);
      data.push(arg);
    } else data.push(arg);
    data.push('\n');
  })
  data.push('}\n');
  return data;
}