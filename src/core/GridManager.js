import { Belt } from "../entities/Belt.js";
import { Bridge } from "../entities/Bridge.js";
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

  generateNodes(seed, count = 40, exclusionCenterX = null, exclusionCenterY = null, exclusionRadius = 6) {
    const rand = mulberry32(seed >>> 0);
    const cx = exclusionCenterX ?? Math.floor(this.width / 2);
    const cy = exclusionCenterY ?? Math.floor(this.height / 2);
    const NODE_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30];
    const minSpacing = 4;
    const placed = [];
    let attempts = 0;

    while (placed.length < count && attempts < count * 40) {
      attempts++;
      const x = 2 + Math.floor(rand() * (this.width - 4));
      const y = 2 + Math.floor(rand() * (this.height - 4));
      const distToCore = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (distToCore < exclusionRadius) continue;
      const tooClose = placed.some(([px, py]) => Math.abs(px - x) < minSpacing && Math.abs(py - y) < minSpacing);
      if (tooClose) continue;
      const tile = this.tileAt(x, y);
      if (tile && !tile.occupied) {
        tile.nodeValue = NODE_VALUES[Math.floor(rand() * NODE_VALUES.length)];
        placed.push([x, y]);
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
    if (!tile) return false;
    if (tile.kind === TileKind.Belt) {
      const existing = tile.entity.direction;
      // Perpendicular belt → auto-upgrade to bridge (two independent crossing layers)
      if (existing !== direction && existing !== OPPOSITE[direction]) {
        tile.setEntity(TileKind.Bridge, new Bridge(x, y, existing, direction));
        return true;
      }
      return false;
    }
    if (tile.occupied) return false;
    tile.setEntity(TileKind.Belt, new Belt(x, y, direction));
    return true;
  }

  placeBridge(x, y, primaryDir, crossDir) {
    const tile = this.tileAt(x, y);
    if (!tile || tile.occupied) return false;
    tile.setEntity(TileKind.Bridge, new Bridge(x, y, primaryDir, crossDir));
    return true;
  }

  placeMachine(machine) {
    if (!(machine instanceof Machine)) return false;
    if (machine.type === "extractor") {
      const tile = this.tileAt(machine.x, machine.y);
      if (!tile?.isNode || tile.occupied) return false;
      machine.sourceValue = tile.nodeValue;
      tile.setEntity(TileKind.Machine, machine);
      this.machines.set(machine.id, machine);
      return true;
    }
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
    if (tile.kind === TileKind.Bridge) {
      for (const layer of entity.layers) {
        if (layer.item) this.items.delete(layer.item.id);
      }
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

  removeRect(x, y, width, height) {
    const seenMachines = new Set();
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) {
        const tile = this.tileAt(xx, yy);
        if (!tile?.occupied) continue;
        if (tile.kind === TileKind.Machine) {
          if (seenMachines.has(tile.entity.id)) continue;
          seenMachines.add(tile.entity.id);
        }
        this.removeAt(xx, yy);
      }
    }
  }

  clearItemsInRect(x, y, width, height) {
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) {
        const belt = this.getBelt(xx, yy);
        if (belt?.item) {
          this.items.delete(belt.item.id);
          belt.removeItem();
        }
        const bridge = this.getBridge(xx, yy);
        if (bridge) {
          for (const layer of bridge.layers) {
            if (layer.item) { this.items.delete(layer.item.id); layer.removeItem(); }
          }
        }
      }
    }
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

  getBridge(x, y) {
    const tile = this.tileAt(x, y);
    return tile?.kind === TileKind.Bridge ? tile.entity : null;
  }

  getMachine(x, y) {
    const tile = this.tileAt(x, y);
    return tile?.kind === TileKind.Machine ? tile.entity : null;
  }

  belts() {
    const result = [];
    for (const tile of this.tiles.values()) {
      if (tile.kind === TileKind.Belt) result.push(tile.entity);
      if (tile.kind === TileKind.Bridge) result.push(...tile.entity.layers);
    }
    return result;
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

  tryEmitSecondaryFromMachine(machine, item) {
    if (!machine.secondaryOutput) return false;
    const origin = machineSecondaryOutputOrigin(machine);
    const target = neighborOf(origin, machine.secondaryOutput);
    return this.tryTransferItem(item, origin, target, machine.secondaryOutput);
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

    if (tile.kind === TileKind.Bridge) {
      const layer = tile.entity.layerFor(travelDirection);
      if (!layer || !layer.canAcceptItem()) return false;
      layer.insertItem(item, { x: fromPosition.x, y: fromPosition.y }, targetPosition);
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
  if (["add", "subtract", "multiply", "divide", "exponentiate"].includes(machine.type)) {
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

// Returns the tile from which the secondary (remainder) output exits.
// For a 1x2 vertical machine: the tile that machineOutputOrigin doesn't use.
// For a 2x1 horizontal machine: same logic on the other axis.
function machineSecondaryOutputOrigin(machine) {
  if (machine.orientation === "horizontal") {
    const primary = machineOutputOrigin(machine);
    return primary.x === machine.x
      ? { x: machine.x + (machine.width ?? 1) - 1, y: machine.y }
      : { x: machine.x, y: machine.y };
  }
  const primary = machineOutputOrigin(machine);
  return primary.y === machine.y
    ? { x: machine.x, y: machine.y + (machine.height ?? 1) - 1 }
    : { x: machine.x, y: machine.y };
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
