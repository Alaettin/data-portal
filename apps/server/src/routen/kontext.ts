import type { DB } from "../db.ts";
import type { Strom } from "../strom.ts";
import type { Takt } from "../takt.ts";

export type Kontext = { db: DB; strom: Strom; takt: Takt; holen: typeof fetch };
