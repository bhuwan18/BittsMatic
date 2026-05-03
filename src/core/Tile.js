import { TileKind } from "./constants.js";

export class Tile {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.kind = TileKind.Empty;
    this.entity = null;
    this.parentMachineId = null;
    this.nodeValue = null;
  }

  get occupied() {
    return this.entity !== null;
  }

  get isNode() {
    return this.nodeValue !== null;
  }

  setEntity(kind, entity) {
    this.kind = kind;
    this.entity = entity;
    this.parentMachineId = kind === TileKind.Machine ? entity.id : null;
  }

  clear() {
    this.kind = TileKind.Empty;
    this.entity = null;
    this.parentMachineId = null;
  }
}
