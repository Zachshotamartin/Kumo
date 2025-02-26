import { Shape } from "./shape";

interface BoardData {
  shapes: Shape[];
  id: string | null;
  type: string | null;
  title: string | null;
  uid: string | null;
  sharedWith: string[];
  backGroundColor: string;
  lastChangedBy: string | null;
  currentUsers: {
    uid: string;
    cursorX: number;
    cursorY: number;
  }[];
}

export class Board implements BoardData {
  shapes: Shape[];
  id: string | null;
  type: string | null;
  title: string | null;
  uid: string | null;
  sharedWith: string[];
  backGroundColor: string;
  lastChangedBy: string | null;
  currentUsers: {
    uid: string;
    cursorX: number;
    cursorY: number;
  }[];

  constructor() {
    this.shapes = [];
    this.id = null;
    this.type = null;
    this.title = null;
    this.uid = null;
    this.sharedWith = [];
    this.backGroundColor = "#313131";
    this.lastChangedBy = null;
    this.currentUsers = [];
  }

  convertToObj() {
    return {
      ...this,
      shapes: this.shapes.map((shape) => {
        return shape;
      }),
    };
  }
}
