import { Liveblocks, PlainLsonObject } from "@liveblocks/node";

let client: Liveblocks | undefined;

export const liveblocksAdmin = (): Liveblocks => {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new Error("Liveblocks server environment variables are incomplete.");
  client ??= new Liveblocks({ secret });
  return client;
};

export const emptyBoardDocument = (backgroundColor = "#252629"): PlainLsonObject => ({
  liveblocksType: "LiveObject",
  data: {
    schemaVersion: 3,
    backgroundColor,
    nodes: {
      liveblocksType: "LiveMap",
      data: {},
    },
  },
});

export const boardDocumentFromJson = (value: unknown): PlainLsonObject => {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nodes = source.nodes && typeof source.nodes === "object"
    ? source.nodes as Record<string, unknown>
    : {};
  return {
    liveblocksType: "LiveObject",
    data: {
      schemaVersion: 3,
      backgroundColor: typeof source.backgroundColor === "string" ? source.backgroundColor : "#252629",
      nodes: {
        liveblocksType: "LiveMap",
        data: Object.fromEntries(
          Object.entries(nodes).map(([id, shape]) => [
            id,
            {
              liveblocksType: "LiveObject",
              data: JSON.parse(JSON.stringify(shape ?? {})),
            },
          ])
        ),
      },
    },
  };
};

