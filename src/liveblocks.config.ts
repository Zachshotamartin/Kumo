import type { Json, LiveMap, LiveObject, LsonObject } from "@liveblocks/client";

declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
      selectionIds: string[];
    };
    Storage: {
      schemaVersion: number;
      backgroundColor: string;
      nodes: LiveMap<string, LiveObject<LsonObject>>;
    };
    UserMeta: {
      id: string;
      info: {
        [key: string]: Json | undefined;
        name: string;
        email: string;
        avatar: string;
      };
    };
  }
}

export {};
