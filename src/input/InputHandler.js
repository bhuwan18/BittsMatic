import { Direction, rotateDirection } from "../core/constants.js";
import { TOOLS, createMachineForTool } from "../config/recipes.js";
import { BlueprintManager } from "../systems/BlueprintManager.js";

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
    this.panning = false;
    this.lastPan = null;
    this.lastPlacedKey = "";
    this.blueprints = new BlueprintManager(grid);
    this.selection = null;
    this.selectionStart = null;
    this.selecting = false;
    this.pasteBlueprint = null;
    this.#bind();
  }

  selectTool(tool) {
    this.selectedTool = tool;
    if (tool !== "select") this.#cancelSelectionDrag();
    if (tool !== "select") this.renderer.selection = this.selection;
    this.updateUi();
  }

  #bind() {
    this.canvas.addEventListener("mousemove", (event) => this.#onMove(event));
    this.canvas.addEventListener("mousedown", (event) => this.#onDown(event));
    this.canvas.addEventListener("wheel", (event) => this.#onWheel(event), { passive: false });
    window.addEventListener("mouseup", () => {
      this.selecting = false;
      this.selectionStart = null;
      this.dragging = false;
      this.panning = false;
      this.lastPan = null;
      this.lastPlacedKey = "";
    });
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.#rotateAtPointer(event);
    });
    window.addEventListener("keydown", (event) => this.#onKey(event));
  }

  #onMove(event) {
    if (this.panning && this.lastPan) {
      this.renderer.panBy(this.lastPan.x - event.clientX, this.lastPan.y - event.clientY);
      this.lastPan = { x: event.clientX, y: event.clientY };
      return;
    }
    const point = this.renderer.screenToGrid(event.clientX, event.clientY);
    if (!point) {
      this.renderer.preview = null;
      this.renderer.blueprintPreview = null;
      return;
    }

    if (this.selecting && this.selectionStart) {
      this.#updateSelection(point);
      return;
    }

    if (this.pasteBlueprint) {
      this.#updatePastePreview(point);
      return;
    }

    this.renderer.preview = {
      ...point,
      ...this.#footprintForSelection(point.x, point.y),
      valid: this.#canPlace(point.x, point.y)
    };
    if (this.dragging && this.selectedTool === "belt") this.#apply(point);
  }

  #onDown(event) {
    if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
      event.preventDefault();
      this.panning = true;
      this.lastPan = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button !== 0) return;
    const point = this.renderer.screenToGrid(event.clientX, event.clientY);
    if (!point) return;

    if (this.pasteBlueprint) {
      if (this.blueprints.paste(this.pasteBlueprint, point.x, point.y)) this.updateUi();
      this.#updatePastePreview(point);
      return;
    }

    if (this.selectedTool === "select" || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.selecting = true;
      this.selectionStart = point;
      this.#updateSelection(point);
      return;
    }

    this.dragging = this.selectedTool === "belt";
    this.#apply(point);
  }

  #onWheel(event) {
    event.preventDefault();
    this.renderer.zoomAt(event.clientX, event.clientY, event.deltaY);
  }

  #onKey(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      this.copySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      this.enterPasteMode();
      return;
    }
    if (event.key === "Escape") {
      this.cancelBlueprintMode();
      return;
    }
    if (this.pasteBlueprint && event.key.toLowerCase() === "r") {
      this.pasteBlueprint = this.blueprints.rotate(this.pasteBlueprint);
      this.#refreshPastePreview();
      this.updateUi();
      return;
    }

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
    const tool = TOOLS.find((entry) => entry.id === this.selectedTool);
    if (!tool || !this.progression.isUnlocked(tool.unlock)) return false;
    if (this.selectedTool === "remove" || this.selectedTool === "select") return true;

    const footprint = this.#footprintForSelection(x, y);
    for (let yy = y; yy < y + footprint.height; yy += 1) {
      for (let xx = x; xx < x + footprint.width; xx += 1) {
        const tile = this.grid.tileAt(xx, yy);
        if (!tile || tile.occupied) return false;
      }
    }
    return true;
  }

  #footprintForSelection(x, y) {
    if (["add", "subtract", "multiply", "divide"].includes(this.selectedTool)) {
      return { x, y, width: 1, height: 2 };
    }
    return { x, y, width: 1, height: 1 };
  }

  copySelection() {
    if (!this.selection) return false;
    const blueprint = this.blueprints.copy(this.selection);
    this.renderer.selection = {
      x: blueprint.origin.x,
      y: blueprint.origin.y,
      width: blueprint.width,
      height: blueprint.height
    };
    this.selection = this.renderer.selection;
    this.updateUi();
    return blueprint.belts.length + blueprint.machines.length > 0;
  }

  enterPasteMode() {
    if (!this.blueprints.current) return false;
    this.pasteBlueprint = this.blueprints.current;
    this.renderer.preview = null;
    this.#refreshPastePreview();
    this.updateUi();
    return true;
  }

  cancelBlueprintMode() {
    this.pasteBlueprint = null;
    this.selecting = false;
    this.selectionStart = null;
    this.renderer.blueprintPreview = null;
    this.updateUi();
  }

  rotatePasteBlueprint() {
    if (!this.pasteBlueprint) return false;
    this.pasteBlueprint = this.blueprints.rotate(this.pasteBlueprint);
    this.#refreshPastePreview();
    this.updateUi();
    return true;
  }

  blueprintSummary() {
    const blueprint = this.blueprints.current;
    return {
      copied: Boolean(blueprint),
      pasting: Boolean(this.pasteBlueprint),
      selection: this.selection,
      entities: blueprint ? blueprint.belts.length + blueprint.machines.length : 0,
      size: blueprint ? { width: blueprint.width, height: blueprint.height } : null
    };
  }

  #updateSelection(point) {
    const x = Math.min(this.selectionStart.x, point.x);
    const y = Math.min(this.selectionStart.y, point.y);
    const width = Math.abs(this.selectionStart.x - point.x) + 1;
    const height = Math.abs(this.selectionStart.y - point.y) + 1;
    this.selection = { x, y, width, height };
    this.renderer.selection = this.selection;
    this.renderer.preview = null;
    this.renderer.blueprintPreview = null;
  }

  #updatePastePreview(point) {
    const validation = this.blueprints.canPaste(this.pasteBlueprint, point.x, point.y);
    this.renderer.blueprintPreview = {
      x: point.x,
      y: point.y,
      blueprint: this.pasteBlueprint,
      valid: validation.valid,
      invalidTiles: validation.invalidTiles
    };
    this.renderer.preview = null;
  }

  #refreshPastePreview() {
    if (!this.renderer.blueprintPreview || !this.pasteBlueprint) return;
    this.#updatePastePreview(this.renderer.blueprintPreview);
  }

  #cancelSelectionDrag() {
    this.selecting = false;
    this.selectionStart = null;
  }
}
