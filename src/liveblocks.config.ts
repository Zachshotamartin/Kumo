import type { Json, LiveMap, LiveObject, LsonObject } from "@liveblocks/client";

declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
      selectionIds: string[];
      viewport: { x: number; y: number; zoom: number };
      spotlight: boolean;
      activeShapeIds: string[];
      activity: "moving" | "resizing" | "rotating" | "editing" | null;
      cursorChat: string;
      textSelection: { shapeId: string; start: number; end: number } | null;
    };
    Storage: {
      schemaVersion: number;
      backgroundColor: string;
      nodes: LiveMap<string, LiveObject<LsonObject>>;
      textCharacters: LiveMap<string, LiveObject<LsonObject>>;
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
      assigneeId?: string;
      dueAt?: string;
      priority?: "low" | "normal" | "high";
    };
    CommentMetadata: {
      source: "canvas";
    };
    RoomEvent:
      | { type: "SPOTLIGHT_START"; presenterId: string }
      | { type: "SPOTLIGHT_STOP"; presenterId: string }
      | { type: "DOCUMENT_RESTORED"; actorId: string; revision: number };
  }
}

export {};
