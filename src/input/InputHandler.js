import { Direction, rotateDirection } from "../core/constants.js";
import { TOOLS, createMachineForTool } from "../config/recipes.js";

export class InputHandler {
  constructor(canvas, grid, renderer, progression, updateUi) {
    this.canvas = canvas;
    this.grid = grid;
    this.renderer = renderer;
    this.progression = progression;
    this.updateUi = updateUi;
    this.selectedTool = "belt";
    this.direction = Direction.Right;
    this.dragging = false;
    this.lastPlacedKey = "";
    this.#bind();
  }

  selectTool(tool) {
    this.selectedTool = tool;
    this.updateUi();
  }

  #bind() {
    this.canvas.addEventListener("mousemove", (event) => this.#onMove(event));
    this.canvas.addEventListener("mousedown", (event) => this.#onDown(event));
    window.addEventListener("mouseup", () => {
      this.dragging = false;
      this.lastPlacedKey = "";
    });
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.#rotateAtPointer(event);
    });
    window.addEventListener("keydown", (event) => this.#onKey(event));
  }

  #onMove(event) {
    const point = this.renderer.screenToGrid(event.clientX, event.clientY);
    if (!point) {
      this.renderer.preview = null;
      return;
    }
    this.renderer.preview = {
      ...point,
      valid: this.#canPlace(point.x, point.y)
    };
    if (this.dragging && this.selectedTool === "belt") this.#apply(point);
  }

  #onDown(event) {
    if (event.button !== 0) return;
    const point = this.renderer.screenToGrid(event.clientX, event.clientY);
    if (!point) return;
    this.dragging = this.selectedTool === "belt";
    this.#apply(point);
  }

  #onKey(event) {
    const tool = TOOLS.find((entry) => entry.hotkey === event.key);
    if (tool) this.selectTool(tool.id);
    if (event.key.toLowerCase() === "r") {
      this.direction = rotateDirection(this.direction);
      this.updateUi();
    }
  }

  #rotateAtPointer(event) {
    const point = this.renderer.screenToGrid(event.clientX, event.clientY);
    if (point && this.grid.rotateAt(point.x, point.y)) return;
    this.direction = rotateDirection(this.direction);
    this.updateUi();
  }

  #apply(point) {
    const key = `${point.x},${point.y}`;
    if (this.dragging && key === this.lastPlacedKey) return;
    this.lastPlacedKey = key;

    if (this.selectedTool === "remove") {
      this.grid.removeAt(point.x, point.y);
      this.updateUi();
      return;
    }

    if (!this.#canPlace(point.x, point.y)) return;

    if (this.selectedTool === "belt") {
      this.grid.placeBelt(point.x, point.y, this.direction);
    } else {
      const machine = createMachineForTool(this.selectedTool, point.x, point.y, this.direction, this.progression);
      if (machine) this.grid.placeMachine(machine);
    }
    this.updateUi();
  }

  #canPlace(x, y) {
    const tile = this.grid.tileAt(x, y);
    if (!tile || tile.occupied) return false;
    const tool = TOOLS.find((entry) => entry.id === this.selectedTool);
    return Boolean(tool && this.progression.isUnlocked(tool.unlock));
  }
}
