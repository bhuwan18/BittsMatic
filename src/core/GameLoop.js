import { keyOf, neighborOf, OPPOSITE, TileKind } from "./constants.js";

export class GameLoop {
  constructor(grid, { progression = null, tickRate = 1, logger = console } = {}) {
    this.grid = grid;
    this.progression = progression;
    this.tickRate = tickRate;
    this.tickCount = 0;
    this.accumulator = 0;
    this.running = false;
    this.logger = logger;
  }

  update(deltaSeconds) {
    let remaining = Math.max(0, deltaSeconds);
    while (remaining > 0) {
      const delta = Math.min(remaining, 0.25);
      this.#tickMachines(delta);
      this.#moveBelts(delta);
      remaining -= delta;
    }
  }

  step() {
    this.update(1);
  }

  #tickMachines(deltaSeconds) {
    const stepLength = 1 / this.tickRate;
    this.accumulator += deltaSeconds;
    while (this.accumulator >= stepLength) {
      const context = {
        emitFromMachine: (machine, item) => this.grid.tryEmitFromMachine(machine, item),
        consumeItem: (item) => this.grid.items.delete(item.id),
        deliver: (item) => this.progression?.deliver(item.value, 1),
        logMachineBlocked: (machine, item) => this.#logMachineBlocked(machine, item)
      };
      for (const machine of this.grid.machinesList()) machine.tick(context);
      this.tickCount += 1;
      this.accumulator -= stepLength;
    }
  }

  #moveBelts(deltaSeconds) {
    const movingBelts = this.grid.belts().filter((belt) => belt.item);
    for (const belt of movingBelts) {
      belt.item.offset = Math.min(1, belt.item.offset + belt.speed * deltaSeconds);
    }

    const readyBelts = movingBelts.filter((belt) => belt.item?.offset >= 1);
    const intents = readyBelts.map((belt) => {
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
      if (!this.#canIntentMove(intent, intents)) {
        this.#logMovementFailure(intent, "blocked-or-invalid-target");
        continue;
      }
      const candidateKey = this.#candidateKey(intent);
      if (!candidates.has(candidateKey)) candidates.set(candidateKey, []);
      candidates.get(candidateKey).push(intent);
    }

    const accepted = [];
    for (const group of candidates.values()) {
      group.sort((a, b) => a.belt.y - b.belt.y || a.belt.x - b.belt.x || a.item.id.localeCompare(b.item.id));
      accepted.push(group[0]);
      for (const rejected of group.slice(1)) this.#logMovementFailure(rejected, "transfer-priority-lost");
    }

    const acceptedFrom = new Set(accepted.map((intent) => intent.fromKey));
    const acceptedTo = new Set(accepted.map((intent) => intent.targetKey));

    for (const intent of accepted) {
      const tile = this.grid.tileAt(intent.target.x, intent.target.y);
      if (tile.kind === TileKind.Belt && tile.entity.item && !acceptedFrom.has(intent.targetKey)) {
        acceptedTo.delete(intent.targetKey);
        this.#logMovementFailure(intent, "target-item-did-not-move");
      }
    }

    const finalMoves = accepted.filter((move) => acceptedTo.has(move.targetKey));
    for (const intent of finalMoves) intent.belt.removeItem();

    for (const intent of finalMoves) {
      const tile = this.grid.tileAt(intent.target.x, intent.target.y);
      if (tile.kind === TileKind.Belt) {
        if (!tile.entity.insertItem(intent.item, { x: intent.belt.x, y: intent.belt.y }, intent.target)) {
          intent.belt.insertItem(intent.item, intent.item.from, intent.item.to);
          intent.item.offset = 1;
          this.#logMovementFailure(intent, "late-belt-reject-restored");
        }
      } else if (tile.kind === TileKind.Machine) {
        if (!tile.entity.acceptItem(intent.direction, intent.item, intent.target)) {
          intent.belt.insertItem(intent.item, intent.item.from, intent.item.to);
          intent.item.offset = 1;
          this.#logMovementFailure(intent, "late-machine-reject-restored");
        }
      }
    }

    for (const belt of this.grid.belts()) {
      belt.animationPhase = (belt.animationPhase + deltaSeconds * belt.speed) % 1;
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
      return tile.entity.canAcceptItem(intent.direction, intent.item, intent.target);
    }

    return false;
  }

  #candidateKey(intent) {
    const tile = this.grid.tileAt(intent.target.x, intent.target.y);
    if (tile?.kind === TileKind.Machine) {
      return intent.targetKey;
    }
    return intent.targetKey;
  }

  #logMovementFailure(intent, reason) {
    this.logger?.debug?.("[movement-failed]", {
      reason,
      itemId: intent.item.id,
      value: intent.item.value,
      from: { x: intent.belt.x, y: intent.belt.y },
      to: intent.target
    });
  }

  #logMachineBlocked(machine, item) {
    this.logger?.debug?.("[machine-blocked]", {
      machineId: machine.id,
      type: machine.type,
      value: item.value,
      output: machine.output
    });
  }
}
