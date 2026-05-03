import { Direction, OPPOSITE } from "../core/constants.js";
import { Item } from "./Item.js";

let nextMachineId = 1;

const MATH_TYPES = new Set(["add", "subtract", "multiply", "divide"]);

export class Machine {
  constructor(config) {
    this.id = `machine-${nextMachineId++}`;
    this.type = config.type;
    this.x = config.x;
    this.y = config.y;
    this.width = config.width ?? 1;
    this.height = config.height ?? 1;
    this.orientation = config.orientation ?? "vertical";
    this.fixed = Boolean(config.fixed);
    this.output = config.output ?? Direction.Right;
    this.inputPorts = [...(config.inputPorts ?? [])];
    this.operation = config.operation ?? config.type;
    this.processTicks = config.ticks ?? 2;
    this.sourceValue = config.sourceValue ?? 10;
    this.sourceInterval = config.sourceInterval ?? 2;
    this.state = "idle";
    this.progress = 0;
    this.inputBuffers = new Map(this.inputPorts.map((direction) => [direction, null]));
    this.storedValues = [];
    this.rejectedValues = [];
  }

  static source({ x, y, output = Direction.Right, value = 10, interval = 2 }) {
    return new Machine({ type: "source", x, y, output, sourceValue: value, sourceInterval: interval });
  }

  static math({ type, x, y, output = Direction.Right, ticks = 2, orientation = "vertical" }) {
    if (!MATH_TYPES.has(type)) throw new Error(`Unknown math machine: ${type}`);
    return new Machine({
      type,
      x,
      y,
      width: orientation === "horizontal" ? 2 : 1,
      height: orientation === "horizontal" ? 1 : 2,
      orientation,
      inputPorts: ["A", "B"],
      output,
      operation: type,
      ticks
    });
  }

  static core({ x, y }) {
    return new Machine({
      type: "core",
      x,
      y,
      width: 3,
      height: 3,
      fixed: true,
      inputPorts: [Direction.Up, Direction.Down, Direction.Left, Direction.Right]
    });
  }

  canAcceptItem(fromDirection, item, targetPosition = null) {
    if (this.type === "core") {
      const port = OPPOSITE[fromDirection];
      return this.inputBuffers.has(port) && !this.inputBuffers.get(port);
    }
    if (!MATH_TYPES.has(this.type)) return false;
    const slot = this.#slotForTarget(targetPosition);
    return Boolean(slot && !this.inputBuffers.get(slot));
  }

  acceptItem(fromDirection, item, targetPosition = null) {
    if (!this.canAcceptItem(fromDirection, item, targetPosition)) return false;
    const port = this.type === "core" ? OPPOSITE[fromDirection] : this.#slotForTarget(targetPosition);
    this.inputBuffers.set(port, item);
    item.offset = 1;
    return true;
  }

  tick(context) {
    if (this.type === "source") {
      this.#tickSource(context);
      return;
    }
    if (this.type === "core") {
      this.#tickCore(context);
      return;
    }
    if (MATH_TYPES.has(this.type)) {
      this.#tickMath(context);
    }
  }

  #tickSource(context) {
    this.progress += 1;
    if (this.progress < this.sourceInterval) {
      this.state = "processing";
      return;
    }

    const item = new Item(this.sourceValue);
    if (context.emitFromMachine(this, item)) {
      this.progress = 0;
      this.state = "processing";
    } else {
      this.progress = this.sourceInterval;
      this.state = "blocked";
      context.logMachineBlocked?.(this, item);
    }
  }

  #tickMath(context) {
    const readyInputs = this.#readyInputs();
    if (!readyInputs) {
      this.progress = 0;
      this.state = this.#hasAnyInput() ? "waiting" : "idle";
      return;
    }

    if (this.progress + 1 < this.processTicks) {
      this.progress += 1;
      this.state = "processing";
      return;
    }
    this.progress = this.processTicks;

    const output = new Item(this.#calculate(readyInputs), {
      operation: this.operation,
      sources: readyInputs.map((item) => item.id)
    });

    if (!context.emitFromMachine(this, output)) {
      this.state = "blocked";
      context.logMachineBlocked?.(this, output);
      return;
    }

    for (const item of readyInputs) context.consumeItem?.(item);
    this.inputBuffers.set("A", null);
    this.inputBuffers.set("B", null);
    this.progress = 0;
    this.state = "idle";
  }

  #tickCore(context) {
    let consumed = false;
    for (const [port, item] of this.inputBuffers.entries()) {
      if (!item) continue;
      const result = context.deliver?.(item);
      if (result?.matched === false) {
        this.rejectedValues.push(item.value);
      } else {
        this.storedValues.push(item.value);
      }
      context.consumeItem?.(item);
      this.inputBuffers.set(port, null);
      consumed = true;
    }
    this.state = consumed ? "processing" : "idle";
  }

  #readyInputs() {
    const a = this.inputBuffers.get("A");
    const b = this.inputBuffers.get("B");
    return a && b ? [a, b] : null;
  }

  #hasAnyInput() {
    return [...this.inputBuffers.values()].some(Boolean);
  }

  #calculate(inputs) {
    const [a, b] = inputs.map((item) => item.value);
    if (this.operation === "add") return a + b;
    if (this.operation === "subtract") return a - b;
    if (this.operation === "multiply") return a * b;
    if (this.operation === "divide") return b === 0 ? 0 : a / b;
    return a;
  }

  #slotForTarget(targetPosition) {
    if (!targetPosition) return null;
    if (this.orientation === "horizontal") {
      if (targetPosition.y !== this.y) return null;
      if (targetPosition.x === this.x + 1) return "A";
      if (targetPosition.x === this.x) return "B";
      return null;
    }
    if (targetPosition.x !== this.x) return null;
    if (targetPosition.y === this.y) return "A";
    if (targetPosition.y === this.y + 1) return "B";
    return null;
  }
}
