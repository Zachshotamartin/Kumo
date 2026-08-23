import type { Json, LiveMap, LiveObject, LsonObject } from "@liveblocks/client";

declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
      selectionIds: string[];
      viewport: { x: number; y: number; zoom: number };
      spotlight: boolean;
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
    ThreadMetadata: {
      x: number;
      y: number;
      shapeId: string;
    };
    CommentMetadata: {
      source: "canvas";
    };
    RoomEvent:
      | { type: "SPOTLIGHT_START"; presenterId: string }
      | { type: "SPOTLIGHT_STOP"; presenterId: string }
      | { type: "DOCUMENT_RESTORED"; actorId: string };
  }
}

export {};
