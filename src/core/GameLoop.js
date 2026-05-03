import { keyOf, neighborOf, OPPOSITE, TileKind } from "./constants.js";

export class GameLoop {
  constructor(grid, { progression = null, tickRate = 4 } = {}) {
    this.grid = grid;
    this.progression = progression;
    this.tickRate = tickRate;
    this.tickCount = 0;
    this.accumulator = 0;
    this.running = false;
  }

  update(deltaSeconds) {
    const stepLength = 1 / this.tickRate;
    this.accumulator += deltaSeconds;
    while (this.accumulator >= stepLength) {
      this.step();
      this.accumulator -= stepLength;
    }
  }

  step() {
    const context = {
      emitFromMachine: (machine, item) => {
        const emitted = this.grid.tryEmitFromMachine(machine, item);
        if (emitted) item.blockedUntilTick = this.tickCount + 1;
        return emitted;
      },
      deliver: (item) => this.#deliver(item)
    };

    for (const machine of this.grid.machinesList()) machine.tick(context);
    this.#moveBelts();
    this.tickCount += 1;
  }

  #deliver(item) {
    this.grid.items.delete(item.id);
    this.progression?.deliver(item.type, 1);
  }

  #moveBelts() {
    const belts = this.grid.belts().filter((belt) => {
      return belt.item && (belt.item.blockedUntilTick ?? 0) <= this.tickCount;
    });
    const intents = belts.map((belt) => {
      const target = neighborOf(belt, belt.direction);
      return {
        belt,
        item: belt.item,
        fromKey: keyOf(belt.x, belt.y),
        target,
        targetKey: keyOf(target.x, target.y),
        direction: belt.direction
      };
    });

    const candidates = new Map();
    for (const intent of intents) {
      if (!this.#canIntentMove(intent, intents)) continue;
      const candidateKey = this.#candidateKey(intent);
      if (!candidates.has(candidateKey)) candidates.set(candidateKey, []);
      candidates.get(candidateKey).push(intent);
    }

    const accepted = [];
    for (const group of candidates.values()) {
      group.sort((a, b) => a.belt.y - b.belt.y || a.belt.x - b.belt.x || a.item.id.localeCompare(b.item.id));
      accepted.push(group[0]);
    }

    const acceptedFrom = new Set(accepted.map((intent) => intent.fromKey));
    const acceptedTo = new Set(accepted.map((intent) => intent.targetKey));

    for (const intent of accepted) {
      const tile = this.grid.tileAt(intent.target.x, intent.target.y);
      if (tile.kind === TileKind.Belt && tile.entity.item && !acceptedFrom.has(intent.targetKey)) {
        acceptedTo.delete(intent.targetKey);
      }
    }

    for (const intent of accepted.filter((move) => acceptedTo.has(move.targetKey))) {
      intent.belt.removeItem();
    }

    for (const intent of accepted.filter((move) => acceptedTo.has(move.targetKey))) {
      const tile = this.grid.tileAt(intent.target.x, intent.target.y);
      if (tile.kind === TileKind.Belt) {
        tile.entity.insertItem(intent.item, { x: intent.belt.x, y: intent.belt.y }, intent.target);
      } else if (tile.kind === TileKind.Machine) {
        tile.entity.acceptItem(intent.direction, intent.item);
        this.grid.items.delete(intent.item.id);
      }
    }

    for (const belt of this.grid.belts()) {
      belt.animationPhase = (belt.animationPhase + 1) % 8;
    }
  }

  #canIntentMove(intent, allIntents) {
    if (!this.grid.inBounds(intent.target.x, intent.target.y)) return false;
    const tile = this.grid.tileAt(intent.target.x, intent.target.y);
    if (!tile.occupied) return false;

    if (tile.kind === TileKind.Belt) {
      const targetBelt = tile.entity;
      if (targetBelt.direction === OPPOSITE[intent.direction]) return false;
      if (!targetBelt.item) return true;
      return allIntents.some((other) => other.fromKey === intent.targetKey);
    }

    if (tile.kind === TileKind.Machine) {
      return tile.entity.canAcceptItem(intent.direction, intent.item);
    }

    return false;
  }

  #candidateKey(intent) {
    const tile = this.grid.tileAt(intent.target.x, intent.target.y);
    if (tile?.kind === TileKind.Machine) {
      return `${intent.targetKey}:${OPPOSITE[intent.direction]}`;
    }
    return intent.targetKey;
  }
}
