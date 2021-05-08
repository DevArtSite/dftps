import {
  Database,
  MySQLConnector,
  MongoDBConnector,
  PostgresConnector,
  SQLite3Connector
} from '../../deps.ts';
import type { MongoDBOptions, MySQLOptions, PostgresOptions, SQLite3Options } from '../../deps.ts';

import Users from "./Users.ts";

type Options = MySQLOptions | MongoDBOptions | PostgresOptions | SQLite3Options

export type Configs = Options & { connector?: "MariaDB" | "MongoDB" | "MySQL" | "PostgreSQL" | "SQLite" }
export default async function createDb(config: Configs): Promise<{ db: Database, Users: typeof Users }> {
  if (!config.connector) throw new Error("You need set database config in your config file!");
  const conf = config.connector;
  delete config.connector;
  let connector: MySQLConnector | MongoDBConnector | PostgresConnector | SQLite3Connector

  switch(conf) {
    case "MariaDB":
    case "MySQL":
      connector = new MySQLConnector((config as MySQLOptions));
      break;
    case "MongoDB":
      connector = new MongoDBConnector((config as MongoDBOptions));
      break;
    case "PostgreSQL":
      connector = new PostgresConnector((config as PostgresOptions));
      break;
    case "SQLite":
      connector = new SQLite3Connector((config as SQLite3Options));
      break;
    default:
      throw new Error("You need set database config in your config file!");
  }

  const db = new Database(connector);

  db.link([Users]);
  await db.sync();
  return { db, Users }
}