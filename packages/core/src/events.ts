/**
 * CloudEvents aus dem Event-Feed des PCN Event Manager (GET /api/v3/events).
 * Form am 31.10.2026 auf RC gemessen, Typen wie in der Akte "14 PCN Testing".
 */

export type CloudEvent = {
  specversion: string;
  id: string;
  time: string;
  type: string;
  source: string;
  subject: string;
  datacontenttype?: string;
  dataschema?: string;
  data?: Record<string, unknown>;
};

export type FeedSeite = {
  id?: string;
  updated?: string;
  records: CloudEvent[];
  cursor?: string;
};

export const TYP = {
  aasCreated: "io.admin-shell.aas.created.v1",
  submodelCreated: "io.admin-shell.submodel.created.v1",
  submodelUpdated: "io.admin-shell.submodel.updated.v1",
  pcn: "io.admin-shell.pcn.v1",
} as const;

/** Was ein Event fuer den Abnehmer bedeutet. */
export type Art = "registriert" | "submodel-neu" | "submodel-geaendert" | "pcn" | "unbekannt";

export function artVon(type: string): Art {
  switch (type) {
    case TYP.aasCreated:
      return "registriert";
    case TYP.submodelCreated:
      return "submodel-neu";
    case TYP.submodelUpdated:
      return "submodel-geaendert";
    case TYP.pcn:
      return "pcn";
    default:
      return "unbekannt";
  }
}

/**
 * Item-ID aus einer AAS-, Submodel- oder Asset-ID. Neoception-IDs tragen sie als
 * Abfrageparameter `itemId`, die globalAssetId als letztes Pfadsegment.
 */
export function itemIdVon(id: string): string {
  try {
    const url = new URL(id);
    const param = url.searchParams.get("itemId");
    if (param) return param;
    const segmente = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(segmente.at(-1) ?? id);
  } catch {
    return id;
  }
}

/** Name des Submodells aus der Neoception-ID `…/sm/<Name>?itemId=…`, sonst null. */
export function submodelNameVon(id: string): string | null {
  const treffer = /\/sm\/([^/?#]+)/.exec(id);
  return treffer?.[1] ? decodeURIComponent(treffer[1]) : null;
}

/** Abrufadresse eines Events: `source + "/" + base64url(subject)` (US-029). */
export function abrufUrl(source: string, encodedSubject: string): string {
  return `${source.replace(/\/+$/, "")}/${encodedSubject}`;
}

/** Erste semanticId aus `data.semanticId.keys[0].value`. */
export function semanticIdVon(event: CloudEvent): string | null {
  const sem = event.data?.["semanticId"] as { keys?: { value?: unknown }[] } | undefined;
  const wert = sem?.keys?.[0]?.value;
  return typeof wert === "string" ? wert : null;
}
