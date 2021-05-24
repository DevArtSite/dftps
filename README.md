# DFtpS - Deno Ftp Server

![logo](./assets/dftps_logo.png)
[![deno doc](https://doc.deno.land/badge.svg)](https://doc.deno.land/https/deno.land/x/dftps/mod.ts)
  
DFtpS is an FTP server based on [ftp-srv](https://github.com/autovance/ftp-srv) with Deno.

Check our guide in [https://devartsite.github.io/dftps-guide/guide/](https://devartsite.github.io/dftps-guide/)

- [Install](#install)
- [Make your own](#make-your-own)
  - [Simple](#simple)
  - [With database](#with-database)
- [Log example](#log-example)
- [Deno Dependencies](#deno-dependencies)
- [List of FTP commands](#list-of-ftp-commands)
- [Contributing](#contributing)
- [References](#references)

## Usage

### Install

```sh
curl -fsSL https://deno.land/x/dftps/install.sh | sh
```

### Install Specific Version

```sh
curl -fsSL https://deno.land/x/dftps/install.sh | sh -s v1.0.0
```

* * *

## Make your own

### Simple

- First, we import the Server class and type for user authentication.

```ts
import { Server } from "https://deno.land/x/dftps/server/mod.ts";
import type { UsernameResolvable, LoginResolvable } from "https://deno.land/x/dftps/server/connection.ts";
```

- Then we just need to create an instance of Server with these options described below.
  - [Listener Options](https://doc.deno.land/https/deno.land%2Fx%2Fdftps%2Fsrc%2Fserver%2Fmod.ts#FTPOptions)
  - [FTPServer Options](https://doc.deno.land/https/deno.land%2Fx%2Fdftps%2Fsrc%2Fserver%2Fmod.ts#FTPServerOptions)

```ts
const serve = new Server({ port: 21, hostname: "127.0.0.1" });
```

- All we have to do is wait for a new connection and check the veracity of it using the authentication tools (awaitUsername, awaitLogin).

```ts
for await (const connection of serve) {
  const { awaitUsername, awaitLogin } = connection;
  /** waiting to receiving username from connection */
  awaitUsername.then(({ username, resolveUsername }: UsernameResolvable) => {
    if (!username !== "my-username") return resolveUsername.reject("Incorrect username!");
    resolveUsername.resolve();
  });
  /** waiting to receiving password from connection and finalize the user authenticate */
  awaitLogin.then(({ password, resolvePassword }: LoginResolvable) => {
    if (password !== "my-password") return resolvePassword.reject("Wrong password!");
    resolvePassword.resolve({ root: "my-folder", uid: 1000, gid: 1000 });
  });
}
```

### With database

- To begin we will initially import the "createDb" function which will allow us to create a database and the "Users" model in addition to the imports mentioned above.

  ```ts
  import { verify, Model } from "https://deno.land/x/dftps/deps.ts";
  import createDb from "https://deno.land/x/dftps/src/db/mod.ts";
  import Users from "https://deno.land/x/dftps/src/db/Users.ts";
  ```

- Only the following database types are supported: "MariaDB" | "MongoDB" | "MySQL" | "PostgreSQL" | "SQLite"
  - Maria, MySQL, PostgreSQL Options
    - database [string] (Required)
    - host [string] (Required)
    - username [string] (Required)
    - password [string] (Required)
    - port [number] (Optional)
  - MongoDB Options
    - uri [string] (Required)
    - database [string] (Required)
  - SQLite Options
    - filepath [string] (Required)

```ts
/** Example with MongoDB */
await createDb({
  connector: "MongoDB",
  uri: 'mongodb://127.0.0.1:27017',
  database: 'test'
});

const serve = new Server(ListenOptions, FTPServerOptions);

for await (const connection of serve) {
  const { awaitUsername, awaitLogin } = connection;
  let user: Model;
  /** Waiting to receiving username from connection */
  awaitUsername.then(({ username, resolveUsername }: UsernameResolvable) => {
    /** Find user in database */
    const found = await Users.where('username', username).get();
    if ((found instanceof Array && found.length === 0) || !found) return resolveUsername.reject("Incorrect username!");
    user = (found instanceof Array) ? found[0] : found;
    resolveUsername.resolve();
  });
  /** Waiting to receiving password from connection and finalize the user authenticate */
  awaitLogin.then(async ({ password, resolvePassword }: LoginResolvable) => {
    if (!user) return resolvePassword.reject("User not found!");
    if (! await verify(password, (user.password as string))) return resolvePassword.reject("Wrong password!");
    const { root, uid, gid } = user;
    resolvePassword.resolve({ root: (root as string), uid: (uid as number), gid: (gid as number) });
  });
}
```

## Log example

![output_example](./assets/example_log.gif)

* * *

## Deno Dependencies

- ### [Deno](https://deno.land)

  - [async](https://deno.land/std@0.95.0/async)
  - [io](https://deno.land/std@0.95.0/io)
  - [path](https://deno.land/std@0.95.0/path)
  - [fs](https://deno.land/std@0.95.0/fs)
  - [datetime](https://deno.land/std@0.96.0/datetime)

- ### [getport](https://deno.land/x/getport)

- ### [cliffy](https://deno.land/x/cliffy)

- ### [scrypt](https://deno.land/x/scrypt)

- ### [denodb](https://deno.land/x/denodb)

## [List of FTP commands](https://en.wikipedia.org/wiki/List_of_FTP_commands)

See [COMMANDS.md](COMMANDS.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## References

- [Ftp](https://cr.yp.to/ftp.html)
- [Ftp commands](https://en.wikipedia.org/wiki/List_of_FTP_commands)
- [Ftp reply codes](https://en.wikipedia.org/wiki/List_of_FTP_server_return_codes)
