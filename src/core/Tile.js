import { TileKind } from "./constants.js";

export class Tile {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.kind = TileKind.Empty;
    this.entity = null;
  }

  get occupied() {
    return this.entity !== null;
  }

  setEntity(kind, entity) {
    this.kind = kind;
    this.entity = entity;
  }

  clear() {
    this.kind = TileKind.Empty;
    this.entity = null;
  }
}
