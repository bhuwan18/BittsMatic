import { Direction, OPPOSITE } from "../core/constants.js";
import { Item } from "./Item.js";

let nextMachineId = 1;

export class Machine {
  constructor(config) {
    this.id = `machine-${nextMachineId++}`;
    this.type = config.type;
    this.x = config.x;
    this.y = config.y;
    this.output = config.output ?? Direction.Right;
    this.inputPorts = [...(config.inputPorts ?? [])];
    this.recipe = config.recipe ?? null;
    this.interval = config.interval ?? 1;
    this.itemType = config.itemType ?? null;
    this.state = "idle";
    this.progress = 0;
    this.inputBuffers = new Map(this.inputPorts.map((direction) => [direction, null]));
    this.activeInputs = [];
    this.pendingOutput = null;
  }

  static generator({ x, y, output = Direction.Right, itemType = "ore", interval = 2 }) {
    return new Machine({ type: "generator", x, y, output, itemType, interval });
  }

  static processor({ x, y, input = Direction.Left, output = Direction.Right, recipe }) {
    return new Machine({ type: "processor", x, y, output, inputPorts: [input], recipe });
  }

  static combiner({ x, y, inputs = [Direction.Up, Direction.Left], output = Direction.Right, recipe }) {
    return new Machine({ type: "combiner", x, y, output, inputPorts: inputs, recipe });
  }

  static core({ x, y, inputs = [Direction.Up, Direction.Down, Direction.Left, Direction.Right] }) {
    return new Machine({ type: "core", x, y, inputPorts: inputs });
  }

  canAcceptItem(fromDirection, item) {
    const port = OPPOSITE[fromDirection];
    if (!this.inputBuffers.has(port) || this.inputBuffers.get(port)) return false;
    if (!this.recipe && this.type !== "core") return false;
    if (this.type === "processor") return this.recipe.inputs.includes(item.type);
    if (this.type === "combiner") return this.recipe.inputs.includes(item.type);
    return this.type === "core";
  }

  acceptItem(fromDirection, item) {
    const port = OPPOSITE[fromDirection];
    if (!this.canAcceptItem(fromDirection, item)) return false;
    this.inputBuffers.set(port, item);
    return true;
  }

  tick(context) {
    if (this.type === "generator") {
      this.#tickGenerator(context);
      return;
    }
    if (this.type === "core") {
      this.#tickCore(context);
      return;
    }
    this.#tickRecipeMachine(context);
  }

  #tickGenerator(context) {
    this.progress += 1;
    if (this.progress < this.interval) {
      this.state = "active";
      return;
    }

    const item = new Item(this.itemType);
    if (context.emitFromMachine(this, item)) {
      this.progress = 0;
      this.state = "active";
    } else {
      this.progress = this.interval;
      this.state = "blocked";
    }
  }

  #tickRecipeMachine(context) {
    if (this.pendingOutput) {
      if (context.emitFromMachine(this, this.pendingOutput)) {
        this.pendingOutput = null;
        this.state = "idle";
      } else {
        this.state = "blocked";
      }
      return;
    }

    if (this.activeInputs.length > 0) {
      this.progress -= 1;
      this.state = "active";
      if (this.progress <= 0) {
        this.pendingOutput = new Item(this.recipe.output, {
          sources: this.activeInputs.map((item) => item.id)
        });
        this.activeInputs = [];
        this.tick(context);
      }
      return;
    }

    const inputs = this.#collectMatchingInputs();
    if (!inputs) {
      this.state = this.#hasAnyInput() ? "waiting" : "idle";
      return;
    }

    this.activeInputs = inputs;
    this.progress = this.recipe.ticks;
    this.tick(context);
  }

  #tickCore(context) {
    for (const [port, item] of this.inputBuffers.entries()) {
      if (!item) continue;
      context.deliver(item);
      this.inputBuffers.set(port, null);
    }
    this.state = "active";
  }

  #collectMatchingInputs() {
    const available = [...this.inputBuffers.values()].filter(Boolean);
    const required = [...this.recipe.inputs];
    if (available.length < required.length) return null;

    const selected = [];
    for (const type of required) {
      const foundIndex = available.findIndex((item) => item.type === type && !selected.includes(item));
      if (foundIndex === -1) return null;
      const [item] = available.splice(foundIndex, 1);
      selected.push(item);
    }

    for (const [port, item] of this.inputBuffers.entries()) {
      if (selected.includes(item)) this.inputBuffers.set(port, null);
    }
    return selected;
  }

  #hasAnyInput() {
    return [...this.inputBuffers.values()].some(Boolean);
  }
}
