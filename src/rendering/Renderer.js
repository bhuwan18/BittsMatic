import { Direction, TileKind } from "../core/constants.js";
import { ITEM_COLORS } from "../config/recipes.js";

export class Renderer {
  constructor(canvas, grid, loop, progression) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.grid = grid;
    this.loop = loop;
    this.progression = progression;
    this.tileSize = 36;
    this.offsetX = 20;
    this.offsetY = 20;
    this.preview = null;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const size = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(size.width * dpr);
    this.canvas.height = Math.floor(size.height * dpr);
    this.canvas.style.width = `${size.width}px`;
    this.canvas.style.height = `${size.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.tileSize = Math.max(24, Math.min(42, Math.floor((size.width - 40) / this.grid.width)));
    this.offsetX = Math.max(14, Math.floor((size.width - this.grid.width * this.tileSize) / 2));
    this.offsetY = Math.max(14, Math.floor((size.height - this.grid.height * this.tileSize) / 2));
  }

  screenToGrid(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left - this.offsetX) / this.tileSize);
    const y = Math.floor((clientY - rect.top - this.offsetY) / this.tileSize);
    if (!this.grid.inBounds(x, y)) return null;
    return { x, y };
  }

  render(selectedDirection) {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    this.#drawBackground(ctx, rect);
    this.#drawGrid(ctx);
    this.#drawEntities(ctx);
    this.#drawPreview(ctx, selectedDirection);
  }

  #drawBackground(ctx, rect) {
    ctx.fillStyle = "#101417";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  #drawGrid(ctx) {
    ctx.strokeStyle = "#263238";
    ctx.lineWidth = 1;
    for (let y = 0; y <= this.grid.height; y += 1) {
      const lineY = this.offsetY + y * this.tileSize;
      ctx.beginPath();
      ctx.moveTo(this.offsetX, lineY);
      ctx.lineTo(this.offsetX + this.grid.width * this.tileSize, lineY);
      ctx.stroke();
    }
    for (let x = 0; x <= this.grid.width; x += 1) {
      const lineX = this.offsetX + x * this.tileSize;
      ctx.beginPath();
      ctx.moveTo(lineX, this.offsetY);
      ctx.lineTo(lineX, this.offsetY + this.grid.height * this.tileSize);
      ctx.stroke();
    }
  }

  #drawEntities(ctx) {
    for (const tile of this.grid.tiles.values()) {
      if (tile.kind === TileKind.Belt) this.#drawBelt(ctx, tile.entity);
      if (tile.kind === TileKind.Machine) this.#drawMachine(ctx, tile.entity);
    }
    for (const belt of this.grid.belts()) {
      if (belt.item) this.#drawItem(ctx, belt.item, belt);
    }
  }

  #drawBelt(ctx, belt) {
    const { cx, cy, size } = this.#cell(belt.x, belt.y);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.#angle(belt.direction));
    ctx.fillStyle = "#22313a";
    ctx.fillRect(-size * 0.42, -size * 0.24, size * 0.84, size * 0.48);
    ctx.strokeStyle = "#7d9aa8";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i += 1) {
      const x = i * size * 0.24 + (belt.animationPhase - 4) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.07, -size * 0.16);
      ctx.lineTo(x + size * 0.07, 0);
      ctx.lineTo(x - size * 0.07, size * 0.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawMachine(ctx, machine) {
    const { x, y, cx, cy, size } = this.#cell(machine.x, machine.y);
    const active = machine.state === "active";
    const blocked = machine.state === "blocked";
    ctx.fillStyle = machine.type === "core" ? "#2f6f73" : blocked ? "#6b2f36" : active ? "#5d6d30" : "#35424c";
    ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
    ctx.strokeStyle = active ? "#d7e56f" : blocked ? "#ff8a7a" : "#9fb1bd";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, size - 10, size - 10);
    ctx.fillStyle = "#edf4f7";
    ctx.font = `${Math.max(11, size * 0.36)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(machine.type === "generator" ? "G" : machine.type === "processor" ? "P" : machine.type === "combiner" ? "C" : "Core", cx, cy);
    if (machine.type !== "core") this.#drawPortArrow(ctx, cx, cy, size, machine.output);
  }

  #drawItem(ctx, item, belt) {
    const alpha = Math.min(1, this.loop.accumulator / (1 / this.loop.tickRate));
    const from = item.from ?? { x: belt.x, y: belt.y };
    const to = item.to ?? { x: belt.x, y: belt.y };
    const drawX = from.x + (to.x - from.x) * alpha;
    const drawY = from.y + (to.y - from.y) * alpha;
    const { cx, cy, size } = this.#cell(drawX, drawY);
    ctx.fillStyle = ITEM_COLORS[item.type] ?? "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#101417";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  #drawPreview(ctx, direction) {
    if (!this.preview) return;
    const { x, y, valid } = this.preview;
    const cell = this.#cell(x, y);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = valid ? "#9fdc9f" : "#ef6f6c";
    ctx.fillRect(cell.x + 2, cell.y + 2, cell.size - 4, cell.size - 4);
    ctx.globalAlpha = 1;
    this.#drawPortArrow(ctx, cell.cx, cell.cy, cell.size, direction);
  }

  #drawPortArrow(ctx, cx, cy, size, direction) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.#angle(direction));
    ctx.fillStyle = "#edf4f7";
    ctx.beginPath();
    ctx.moveTo(size * 0.28, 0);
    ctx.lineTo(size * 0.08, -size * 0.12);
    ctx.lineTo(size * 0.08, size * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  #cell(x, y) {
    const size = this.tileSize;
    const px = this.offsetX + x * size;
    const py = this.offsetY + y * size;
    return { x: px, y: py, cx: px + size / 2, cy: py + size / 2, size };
  }

  #angle(direction) {
    return {
      [Direction.Right]: 0,
      [Direction.Down]: Math.PI / 2,
      [Direction.Left]: Math.PI,
      [Direction.Up]: -Math.PI / 2
    }[direction];
  }
}
