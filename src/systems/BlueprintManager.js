import { Direction, OPPOSITE, rotateDirection, TileKind } from "../core/constants.js";
import { Machine } from "../entities/Machine.js";

const MATH_TYPES = new Set(["add", "subtract", "multiply", "divide", "exponentiate"]);

export class BlueprintManager {
  constructor(grid) {
    this.grid = grid;
    this.current = null;
  }

  copy(selection) {
    const bounds = this.#expandedBounds(selection);
    const belts = [];
    const machines = [];
    const seenMachines = new Set();

    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const tile = this.grid.tileAt(x, y);
        if (!tile?.occupied) continue;

        if (tile.kind === TileKind.Belt) {
          belts.push({
            x: x - bounds.x,
            y: y - bounds.y,
            direction: tile.entity.direction,
            speed: tile.entity.speed
          });
        }

        if (tile.kind === TileKind.Bridge) {
          for (const layer of tile.entity.layers) {
            belts.push({ x: x - bounds.x, y: y - bounds.y, direction: layer.direction, speed: layer.speed });
          }
        }

        if (tile.kind === TileKind.Machine && !tile.entity.fixed && !seenMachines.has(tile.entity.id)) {
          machines.push(this.#serializeMachine(tile.entity, bounds));
          seenMachines.add(tile.entity.id);
        }
      }
    }

    this.current = {
      origin: { x: bounds.x, y: bounds.y },
      width: bounds.width,
      height: bounds.height,
      belts,
      machines
    };
    return this.current;
  }

  canPaste(blueprint = this.current, x, y, bridgeAllowed = true) {
    if (!blueprint) return { valid: false, invalidTiles: [] };
    const invalidTiles = [];
    const required = new Set();

    for (const belt of blueprint.belts) {
      this.#collectTile(required, invalidTiles, x + belt.x, y + belt.y, belt.direction, bridgeAllowed);
    }

    for (const machine of blueprint.machines) {
      for (let yy = 0; yy < machine.height; yy += 1) {
        for (let xx = 0; xx < machine.width; xx += 1) {
          this.#collectTile(required, invalidTiles, x + machine.x + xx, y + machine.y + yy, null, bridgeAllowed);
        }
      }
    }

    return { valid: invalidTiles.length === 0, invalidTiles };
  }

  paste(blueprint = this.current, x, y, bridgeAllowed = true) {
    if (!this.canPaste(blueprint, x, y, bridgeAllowed).valid) return false;

    for (const belt of blueprint.belts) {
      const placed = this.grid.placeBelt(x + belt.x, y + belt.y, belt.direction);
      if (placed) {
        // If placeBelt auto-upgraded to a bridge, getBelt returns null — safe to skip speed
        const entity = this.grid.getBelt(x + belt.x, y + belt.y);
        if (entity) entity.speed = belt.speed;
      }
    }

    for (const machine of blueprint.machines) {
      const entity = this.#createMachine(machine, x + machine.x, y + machine.y);
      if (entity) this.grid.placeMachine(entity);
    }

    return true;
  }

  rotate(blueprint = this.current) {
    if (!blueprint) return null;
    const rotated = {
      origin: { ...blueprint.origin },
      width: blueprint.height,
      height: blueprint.width,
      belts: blueprint.belts.map((belt) => ({
        ...this.#rotatePoint(belt, blueprint.height),
        direction: rotateDirection(belt.direction),
        speed: belt.speed
      })),
      machines: blueprint.machines.map((machine) => {
        const point = this.#rotatePoint(
          { x: machine.x, y: machine.y + machine.height - 1 },
          blueprint.height
        );
        return {
          ...machine,
          x: point.x,
          y: point.y,
          width: machine.height,
          height: machine.width,
          orientation: machine.orientation === "horizontal" ? "vertical" : "horizontal",
          output: rotateDirection(machine.output)
        };
      })
    };
    this.current = rotated;
    return rotated;
  }

  #collectTile(required, invalidTiles, x, y, beltDirection = null, bridgeAllowed = true) {
    const key = `${x},${y}`;
    if (required.has(key)) return;
    required.add(key);
    const tile = this.grid.tileAt(x, y);
    if (!tile) { invalidTiles.push({ x, y }); return; }
    if (tile.occupied) {
      // Allow pasting a belt over a perpendicular belt — placeBelt will auto-bridge
      if (beltDirection !== null && bridgeAllowed && tile.kind === TileKind.Belt) {
        const existing = tile.entity.direction;
        if (existing !== beltDirection && existing !== OPPOSITE[beltDirection]) return;
      }
      invalidTiles.push({ x, y });
    }
  }

  #expandedBounds(selection) {
    let minX = selection.x;
    let minY = selection.y;
    let maxX = selection.x + selection.width - 1;
    let maxY = selection.y + selection.height - 1;
    const seenMachines = new Set();

    for (let y = selection.y; y < selection.y + selection.height; y += 1) {
      for (let x = selection.x; x < selection.x + selection.width; x += 1) {
        const tile = this.grid.tileAt(x, y);
        if (tile?.kind !== TileKind.Machine || seenMachines.has(tile.entity.id)) continue;
        seenMachines.add(tile.entity.id);
        minX = Math.min(minX, tile.entity.x);
        minY = Math.min(minY, tile.entity.y);
        maxX = Math.max(maxX, tile.entity.x + (tile.entity.width ?? 1) - 1);
        maxY = Math.max(maxY, tile.entity.y + (tile.entity.height ?? 1) - 1);
      }
    }

    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  #serializeMachine(machine, bounds) {
    return {
      x: machine.x - bounds.x,
      y: machine.y - bounds.y,
      type: machine.type,
      width: machine.width ?? 1,
      height: machine.height ?? 1,
      output: machine.output,
      secondaryOutput: machine.secondaryOutput ?? null,
      orientation: machine.orientation,
      processTicks: machine.processTicks,
      sourceValue: machine.sourceValue,
      sourceInterval: machine.sourceInterval
    };
  }

  #createMachine(data, x, y) {
    if (data.type === "source") {
      return Machine.source({
        x,
        y,
        output: data.output,
        value: data.sourceValue,
        interval: data.sourceInterval
      });
    }
    if (data.type === "extractor") {
      return Machine.extractor({
        x,
        y,
        output: data.output,
        nodeValue: data.sourceValue,
        interval: data.sourceInterval
      });
    }
    if (MATH_TYPES.has(data.type)) {
      return Machine.math({
        type: data.type,
        x,
        y,
        output: data.output,
        secondaryOutput: data.secondaryOutput ?? null,
        ticks: data.processTicks,
        orientation: data.orientation
      });
    }
    if (data.type === "storage") {
      return Machine.storage({ x, y, output: data.output });
    }
    return null;
  }

  #rotatePoint(point, rotatedWidth) {
    return { x: rotatedWidth - 1 - point.y, y: point.x };
  }
}
