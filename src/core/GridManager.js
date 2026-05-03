import { Belt } from "../entities/Belt.js";
import { Machine } from "../entities/Machine.js";
import { keyOf, neighborOf, OPPOSITE, rotateDirection, TileKind } from "./constants.js";
import { Tile } from "./Tile.js";

export class GridManager {
  constructor(width = 50, height = 50) {
    this.width = width;
    this.height = height;
    this.tiles = new Map();
    this.items = new Map();
    this.machines = new Map();

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        this.tiles.set(keyOf(x, y), new Tile(x, y));
      }
    }
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(x, y) {
    return this.tiles.get(keyOf(x, y)) ?? null;
  }

  entityAt(x, y) {
    return this.tileAt(x, y)?.entity ?? null;
  }

  placeBelt(x, y, direction) {
    const tile = this.tileAt(x, y);
    if (!tile || tile.occupied) return false;
    tile.setEntity(TileKind.Belt, new Belt(x, y, direction));
    return true;
  }

  placeMachine(machine) {
    if (!(machine instanceof Machine)) return false;
    for (const tile of this.tilesForFootprint(machine)) {
      if (!tile || tile.occupied) return false;
    }
    for (const tile of this.tilesForFootprint(machine)) {
      tile.setEntity(TileKind.Machine, machine);
    }
    this.machines.set(machine.id, machine);
    return true;
  }

  removeAt(x, y) {
    const tile = this.tileAt(x, y);
    if (!tile || !tile.occupied) return false;
    const entity = tile.entity;
    if (tile.kind === TileKind.Machine && entity.fixed) return false;
    if (tile.kind === TileKind.Belt && entity.item) {
      this.items.delete(entity.item.id);
    }
    if (tile.kind === TileKind.Machine) {
      this.machines.delete(entity.id);
      for (const item of entity.inputBuffers?.values?.() ?? []) {
        if (item) this.items.delete(item.id);
      }
      if (entity.pendingOutput) this.items.delete(entity.pendingOutput.id);
    }
    if (tile.kind === TileKind.Machine) {
      for (const footprintTile of this.tilesForFootprint(entity)) footprintTile?.clear();
    } else {
      tile.clear();
    }
    return true;
  }

  rotateAt(x, y) {
    const belt = this.getBelt(x, y);
    if (!belt) return false;
    belt.direction = rotateDirection(belt.direction);
    return true;
  }

  getBelt(x, y) {
    const tile = this.tileAt(x, y);
    return tile?.kind === TileKind.Belt ? tile.entity : null;
  }

  getMachine(x, y) {
    const tile = this.tileAt(x, y);
    return tile?.kind === TileKind.Machine ? tile.entity : null;
  }

  belts() {
    return [...this.tiles.values()]
      .filter((tile) => tile.kind === TileKind.Belt)
      .map((tile) => tile.entity);
  }

  machinesList() {
    return [...this.machines.values()];
  }

  tilesForFootprint(entity) {
    const tiles = [];
    for (let y = entity.y; y < entity.y + (entity.height ?? 1); y += 1) {
      for (let x = entity.x; x < entity.x + (entity.width ?? 1); x += 1) {
        tiles.push(this.tileAt(x, y));
      }
    }
    return tiles;
  }

  tryInsertItemAt(x, y, item, fromDirection) {
    const belt = this.getBelt(x, y);
    if (!belt || !belt.canAcceptItem(fromDirection)) return false;
    belt.insertItem(item, neighborOf({ x, y }, OPPOSITE[fromDirection]), { x, y });
    this.items.set(item.id, item);
    return true;
  }

  tryEmitFromMachine(machine, item) {
    const origin = machineOutputOrigin(machine);
    const target = neighborOf(origin, machine.output);
    return this.tryTransferItem(item, origin, target, machine.output);
  }

  tryTransferItem(item, fromPosition, targetPosition, travelDirection) {
    if (!this.inBounds(targetPosition.x, targetPosition.y)) return false;
    const tile = this.tileAt(targetPosition.x, targetPosition.y);
    if (!tile.occupied) return false;

    if (tile.kind === TileKind.Belt) {
      const belt = tile.entity;
      if (!belt.canAcceptItem(OPPOSITE[travelDirection])) return false;
      belt.insertItem(item, { x: fromPosition.x, y: fromPosition.y }, targetPosition);
      item.offset = 0;
      this.items.set(item.id, item);
      return true;
    }

    if (tile.kind === TileKind.Machine) {
      const machine = tile.entity;
      if (!machine.acceptItem(travelDirection, item, targetPosition)) return false;
      this.items.set(item.id, item);
      return true;
    }

    return false;
  }
}

function machineOutputOrigin(machine) {
  if (["add", "subtract", "multiply", "divide"].includes(machine.type)) {
    if (machine.orientation === "horizontal") {
      const aTile = { x: machine.x + (machine.width ?? 1) - 1, y: machine.y };
      if (machine.output === "left") return { x: machine.x, y: machine.y };
      return aTile;
    }
    if (machine.output === "left") return { x: machine.x, y: machine.y };
    if (machine.output === "right") return { x: machine.x + (machine.width ?? 1) - 1, y: machine.y };
    if (machine.output === "up") return { x: machine.x, y: machine.y };
    return { x: machine.x, y: machine.y + (machine.height ?? 1) - 1 };
  }
  if (machine.output === "left") return { x: machine.x, y: machine.y + Math.floor((machine.height ?? 1) / 2) };
  if (machine.output === "right") return { x: machine.x + (machine.width ?? 1) - 1, y: machine.y + Math.floor((machine.height ?? 1) / 2) };
  if (machine.output === "up") return { x: machine.x + Math.floor((machine.width ?? 1) / 2), y: machine.y };
  return { x: machine.x + Math.floor((machine.width ?? 1) / 2), y: machine.y + (machine.height ?? 1) - 1 };
}
