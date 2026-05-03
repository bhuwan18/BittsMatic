import { Direction, TileKind, OPPOSITE, neighborOf } from "../core/constants.js";

export class Renderer {
  constructor(canvas, grid, loop, progression, markers = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.grid = grid;
    this.loop = loop;
    this.progression = progression;
    this.markers = markers;
    this.tileSize = 32;
    this.baseTileSize = 32;
    this.zoom = 1;
    this.cameraX = 0;
    this.cameraY = 0;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.preview = null;
    this.selection = null;
    this.blueprintPreview = null;
    this.hoveredMachine = null;
    this.stats = null;
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
    this.viewportWidth = size.width;
    this.viewportHeight = size.height;
    this.baseTileSize = 32;
    this.#clampCamera();
  }

  screenToGrid(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const worldX = clientX - rect.left + this.cameraX;
    const worldY = clientY - rect.top + this.cameraY;
    const x = Math.floor(worldX / this.tileSize);
    const y = Math.floor(worldY / this.tileSize);
    if (!this.grid.inBounds(x, y)) return null;
    return { x, y };
  }

  panBy(dx, dy) {
    this.cameraX += dx;
    this.cameraY += dy;
    this.#clampCamera();
  }

  zoomAt(clientX, clientY, wheelDelta) {
    const rect = this.canvas.getBoundingClientRect();
    const beforeX = clientX - rect.left + this.cameraX;
    const beforeY = clientY - rect.top + this.cameraY;
    const gridX = beforeX / this.tileSize;
    const gridY = beforeY / this.tileSize;
    const factor = wheelDelta < 0 ? 1.12 : 0.89;
    this.zoom = Math.max(0.45, Math.min(2.4, this.zoom * factor));
    this.tileSize = this.baseTileSize * this.zoom;
    this.cameraX = gridX * this.tileSize - (clientX - rect.left);
    this.cameraY = gridY * this.tileSize - (clientY - rect.top);
    this.#clampCamera();
  }

  centerOn(x, y) {
    this.cameraX = (x + 0.5) * this.tileSize - this.viewportWidth / 2;
    this.cameraY = (y + 0.5) * this.tileSize - this.viewportHeight / 2;
    this.#clampCamera();
  }

  render(selectedDirection) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
    this.#drawBackground(ctx);
    ctx.save();
    ctx.translate(-this.cameraX, -this.cameraY);
    this.#drawGrid(ctx);
    this.#drawEntities(ctx);
    this.#drawMarkers(ctx);
    this.#drawSelection(ctx);
    this.#drawBlueprintPreview(ctx);
    this.#drawPreview(ctx, selectedDirection);
    ctx.restore();
    if (this.hoveredMachine && this.stats) {
      this.#drawMachineTooltip(ctx, this.hoveredMachine);
    }
  }

  #drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, this.viewportWidth, this.viewportHeight);
    gradient.addColorStop(0, "#15557a");
    gradient.addColorStop(0.55, "#1d78a7");
    gradient.addColorStop(1, "#155b83");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
  }

  #drawGrid(ctx) {
    const size = this.tileSize;
    const startX = Math.max(0, Math.floor(this.cameraX / size) - 1);
    const endX = Math.min(this.grid.width, Math.ceil((this.cameraX + this.viewportWidth) / size) + 1);
    const startY = Math.max(0, Math.floor(this.cameraY / size) - 1);
    const endY = Math.min(this.grid.height, Math.ceil((this.cameraY + this.viewportHeight) / size) + 1);
    ctx.strokeStyle = "rgba(92, 178, 224, 0.42)";
    ctx.lineWidth = Math.max(1, 2 * this.zoom);

    for (let y = startY; y <= endY; y += 1) {
      ctx.beginPath();
      ctx.moveTo(startX * size, y * size);
      ctx.lineTo(endX * size, y * size);
      ctx.stroke();
    }
    for (let x = startX; x <= endX; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * size, startY * size);
      ctx.lineTo(x * size, endY * size);
      ctx.stroke();
    }
  }

  #drawEntities(ctx) {
    const drawnMachines = new Set();
    for (const tile of this.grid.tiles.values()) {
      if (!this.#isVisible(tile.x, tile.y)) continue;
      if (tile.isNode && tile.kind === TileKind.Empty) this.#drawNode(ctx, tile);
      if (tile.kind === TileKind.Belt) this.#drawBelt(ctx, tile.entity);
      if (tile.kind === TileKind.Bridge) this.#drawBridge(ctx, tile.entity);
      if (tile.kind === TileKind.Machine && !drawnMachines.has(tile.entity.id)) {
        this.#drawMachine(ctx, tile.entity);
        drawnMachines.add(tile.entity.id);
      }
    }
    for (const belt of this.grid.belts()) {
      // Bridge layer items are drawn inside #drawBridge to maintain layer Z-order
      if (belt.bridge) continue;
      if (belt.item && this.#isVisible(belt.x, belt.y)) this.#drawItem(ctx, belt.item, belt);
    }
  }

  #drawNode(ctx, tile) {
    const { cx, cy, size } = this.#cell(tile.x, tile.y);
    const r = size * 0.34;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#c87d00";
    ctx.strokeStyle = "#7a4a00";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.max(10, size * 0.28)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tile.nodeValue, cx, cy);
    ctx.restore();
  }

  #drawBelt(ctx, belt) {
    const { x, y, cx, cy, size } = this.#cell(belt.x, belt.y);
    const inDir = this.#incomingBeltDirection(belt);
    const isCorner = inDir && inDir !== belt.direction && inDir !== OPPOSITE[belt.direction];

    ctx.fillStyle = "#050709";
    ctx.strokeStyle = "#15242b";
    ctx.lineWidth = 2;

    if (isCorner) {
      this.#drawCornerTrack(ctx, belt, inDir, x, y, cx, cy, size);
    } else {
      const horizontal = belt.direction === Direction.Left || belt.direction === Direction.Right;
      if (horizontal) {
        ctx.fillRect(x, y + size * 0.2, size, size * 0.6);
        ctx.strokeRect(x, y + size * 0.2, size, size * 0.6);
      } else {
        ctx.fillRect(x + size * 0.2, y, size * 0.6, size);
        ctx.strokeRect(x + size * 0.2, y, size * 0.6, size);
      }
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.#angle(belt.direction));
    ctx.fillStyle = "#b29400";
    for (let i = -1; i <= 1; i += 1) {
      const arrowX = i * size * 0.25 + (belt.animationPhase - 0.5) * size * 0.25;
      this.#triangle(ctx, arrowX, 0, size * 0.13);
    }
    ctx.restore();

    if (belt.priority) {
      const d = size * 0.14;
      ctx.save();
      ctx.fillStyle = "#00d050";
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  #incomingBeltDirection(belt) {
    for (const dir of [Direction.Up, Direction.Right, Direction.Down, Direction.Left]) {
      const neighbor = neighborOf(belt, OPPOSITE[dir]);
      const neighborBelt = this.grid.getBelt(neighbor.x, neighbor.y);
      if (neighborBelt && neighborBelt.direction === dir) return dir;
    }
    return null;
  }

  #drawCornerTrack(ctx, belt, inDir, x, y, cx, cy, size) {
    const t = size * 0.2;
    // Determine the corner quadrant from incoming + outgoing directions
    const isFromLeft = inDir === Direction.Right;
    const isFromRight = inDir === Direction.Left;
    const isFromUp = inDir === Direction.Down;
    const isFromDown = inDir === Direction.Up;
    const goRight = belt.direction === Direction.Right;
    const goLeft = belt.direction === Direction.Left;
    const goDown = belt.direction === Direction.Down;
    const goUp = belt.direction === Direction.Up;

    // Track background covering both arms of the corner
    ctx.beginPath();
    if ((isFromLeft && goDown) || (isFromDown && goLeft)) {
      ctx.rect(x, y + t, size - t, size - 2 * t);
      ctx.rect(x + t, y, size - 2 * t, size - t);
    } else if ((isFromLeft && goUp) || (isFromUp && goLeft)) {
      ctx.rect(x, y + t, size - t, size - 2 * t);
      ctx.rect(x + t, t, size - 2 * t, size - t);
    } else if ((isFromRight && goDown) || (isFromDown && goRight)) {
      ctx.rect(x + t, y + t, size - t, size - 2 * t);
      ctx.rect(x + t, y, size - 2 * t, size - t);
    } else {
      ctx.rect(x + t, y + t, size - t, size - 2 * t);
      ctx.rect(x + t, t, size - 2 * t, size - t);
    }
    ctx.fill();
  }

  #drawBridge(ctx, bridge) {
    const { x, y, cx, cy, size } = this.#cell(bridge.x, bridge.y);
    // Lower layer — slightly narrower, darker, drawn first
    for (let i = 0; i < 2; i += 1) {
      const layer = bridge.layers[i];
      const isUpper = i === 1;
      const horizontal = layer.direction === Direction.Left || layer.direction === Direction.Right;
      const thickness = isUpper ? 0.52 : 0.38;
      const offset = (1 - thickness) / 2;
      ctx.fillStyle = isUpper ? "#0a0d10" : "#050709";
      ctx.strokeStyle = isUpper ? "#2a3a44" : "#15242b";
      ctx.lineWidth = 2;
      if (horizontal) {
        ctx.fillRect(x, y + size * offset, size, size * thickness);
        ctx.strokeRect(x, y + size * offset, size, size * thickness);
      } else {
        ctx.fillRect(x + size * offset, y, size * thickness, size);
        ctx.strokeRect(x + size * offset, y, size * thickness, size);
      }
      // Animated directional arrows on each layer
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.#angle(layer.direction));
      ctx.fillStyle = isUpper ? "#7ab8d4" : "#5a8898";
      for (let j = -1; j <= 1; j += 1) {
        const arrowX = j * size * 0.25 + (layer.animationPhase - 0.5) * size * 0.25;
        this.#triangle(ctx, arrowX, 0, size * 0.1);
      }
      ctx.restore();
    }
    // Draw items on each layer
    for (const layer of bridge.layers) {
      if (layer.item && this.#isVisible(bridge.x, bridge.y)) {
        this.#drawItem(ctx, layer.item, layer);
      }
    }
  }

  #drawMachine(ctx, machine) {
    const { x, y, cx, cy, size } = this.#machineRect(machine);
    const palette = this.#machinePalette(machine);

    ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
    ctx.fillRect(x + 5, y + 5, size.width - 2, size.height - 2);
    ctx.fillStyle = palette.fill;
    this.#roundRect(ctx, x + 2, y + 2, size.width - 4, size.height - 4, 5);
    ctx.fill();
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = palette.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontScale = Math.min(size.width, size.height);
    if (machine.type === "extractor") {
      this.#drawExtractorPulse(ctx, cx, cy, fontScale, machine);
      ctx.fillStyle = palette.text;
      ctx.font = `800 ${Math.max(16, fontScale * 0.42)}px system-ui`;
      ctx.fillText(machine.sourceValue.toString(), cx, cy - fontScale * 0.05);
      ctx.font = `700 ${Math.max(9, fontScale * 0.18)}px system-ui`;
      ctx.fillText("extract", cx, cy + fontScale * 0.28);
    } else if (machine.type === "storage") {
      this.#drawStorageContents(ctx, machine, x, y, cx, cy, size, fontScale, palette);
    } else if (machine.type === "source" || machine.type === "core") {
      ctx.font = `800 ${Math.max(18, fontScale * 0.46)}px system-ui`;
      ctx.fillText(machine.type === "core" ? "CORE" : machine.sourceValue.toString(), cx, cy - fontScale * 0.05);
      ctx.font = `700 ${Math.max(10, fontScale * 0.18)}px system-ui`;
      const sub = machine.type === "core" ? `${machine.storedValues.length} stored` : "source";
      ctx.fillText(sub, cx, cy + fontScale * 0.28);
    } else {
      this.#drawMathPorts(ctx, machine, palette);
      ctx.font = `800 ${Math.max(16, fontScale * 0.4)}px system-ui`;
      ctx.fillText(this.#machineLabel(machine.type), cx, cy - fontScale * 0.12);
      ctx.font = `700 ${Math.max(9, fontScale * 0.18)}px system-ui`;
      ctx.fillText(machine.state, cx, cy + fontScale * 0.25);
    }
    if (this.#isMathMachine(machine)) {
      const outputCell = machine.orientation === "horizontal"
        ? this.#cell(machine.x + (machine.width ?? 1) - 1, machine.y)
        : this.#cell(machine.x, machine.y);
      this.#drawPortArrow(ctx, outputCell.cx, outputCell.cy, Math.min(size.width, this.tileSize), machine.output);
      if (machine.type === "divide" && machine.secondaryOutput) {
        const secCell = machine.orientation === "horizontal"
          ? this.#cell(machine.x, machine.y)
          : this.#cell(machine.x, machine.y + (machine.height ?? 1) - 1);
        ctx.save();
        ctx.translate(secCell.cx, secCell.cy);
        ctx.rotate(this.#angle(machine.secondaryOutput));
        ctx.fillStyle = "#e08c00";
        this.#triangle(ctx, this.tileSize * 0.31, 0, this.tileSize * 0.15);
        ctx.restore();
      }
    } else if (machine.type !== "core") {
      this.#drawPortArrow(ctx, cx, cy, Math.min(size.width, size.height), machine.output);
    }
  }

  #drawItem(ctx, item, belt) {
    const from = item.from ?? { x: belt.x, y: belt.y };
    const to = item.to ?? { x: belt.x, y: belt.y };
    const drawX = from.x + (to.x - from.x) * item.offset;
    const drawY = from.y + (to.y - from.y) * item.offset;
    const { cx, cy, size } = this.#cell(drawX, drawY);
    ctx.fillStyle = "#d1c400";
    ctx.strokeStyle = "#090900";
    ctx.lineWidth = 2;
    this.#roundRect(ctx, cx - size * 0.24, cy - size * 0.24, size * 0.48, size * 0.48, 4);
    ctx.fill();
    ctx.stroke();
    ctx.font = `900 ${Math.max(12, size * 0.34)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#050709";
    ctx.strokeText(item.label, cx, cy);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(item.label, cx, cy);
  }

  #drawPreview(ctx, direction) {
    if (!this.preview) return;
    const { x, y, valid, width = 1, height = 1 } = this.preview;
    const cell = this.#cell(x, y);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = valid ? "#c9d000" : "#e23a3a";
    ctx.fillRect(cell.x + 2, cell.y + 2, cell.size * width - 4, cell.size * height - 4);
    ctx.globalAlpha = 1;
    this.#drawPortArrow(ctx, cell.cx, cell.cy, cell.size, direction);
  }

  #drawSelection(ctx) {
    if (!this.selection) return;
    const { x, y, width, height } = this.selection;
    const cell = this.#cell(x, y);
    const w = width * this.tileSize;
    const h = height * this.tileSize;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(cell.x, cell.y, w, h);
    ctx.strokeStyle = "#f2c14e";
    ctx.lineWidth = Math.max(2, 2 * this.zoom);
    ctx.setLineDash([this.tileSize * 0.28, this.tileSize * 0.12]);
    ctx.strokeRect(cell.x + 2, cell.y + 2, w - 4, h - 4);
    ctx.restore();
  }

  #drawBlueprintPreview(ctx) {
    if (!this.blueprintPreview?.blueprint) return;
    const { x, y, blueprint, valid, invalidTiles = [] } = this.blueprintPreview;
    const invalid = new Set(invalidTiles.map((tile) => `${tile.x},${tile.y}`));
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = valid ? "#7fe28d" : "#e23a3a";
    const origin = this.#cell(x, y);
    ctx.fillRect(
      origin.x + 2,
      origin.y + 2,
      blueprint.width * this.tileSize - 4,
      blueprint.height * this.tileSize - 4
    );
    ctx.globalAlpha = 0.78;
    for (const belt of blueprint.belts) {
      const cell = this.#cell(x + belt.x, y + belt.y);
      ctx.fillStyle = invalid.has(`${x + belt.x},${y + belt.y}`) ? "#ff3b3b" : "#050709";
      ctx.fillRect(cell.x + cell.size * 0.18, cell.y + cell.size * 0.28, cell.size * 0.64, cell.size * 0.44);
      this.#drawPortArrow(ctx, cell.cx, cell.cy, cell.size, belt.direction);
    }
    for (const machine of blueprint.machines) {
      const cell = this.#cell(x + machine.x, y + machine.y);
      ctx.fillStyle = invalid.has(`${x + machine.x},${y + machine.y}`) ? "#ff3b3b" : "#2bbf3a";
      this.#roundRect(
        ctx,
        cell.x + 3,
        cell.y + 3,
        machine.width * this.tileSize - 6,
        machine.height * this.tileSize - 6,
        5
      );
      ctx.fill();
      ctx.fillStyle = "#071208";
      ctx.font = `800 ${Math.max(11, this.tileSize * 0.28)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        this.#machineLabel(machine.type),
        cell.x + (machine.width * this.tileSize) / 2,
        cell.y + (machine.height * this.tileSize) / 2
      );
    }
    ctx.globalAlpha = 1;
    if (!valid) {
      ctx.fillStyle = "rgba(255, 39, 39, 0.8)";
      for (const tile of invalidTiles) {
        const cell = this.#cell(tile.x, tile.y);
        ctx.fillRect(cell.x + 2, cell.y + 2, cell.size - 4, cell.size - 4);
      }
    }
    ctx.restore();
  }

  #drawMachineTooltip(ctx, machine) {
    const throughput = this.stats.throughputFor(machine.id);
    const efficiency = this.stats.efficiencyFor(machine.id);
    const lines = [
      `${machine.type} [${machine.state}]`,
      `Throughput: ${(throughput * 60).toFixed(1)}/min`,
      `Efficiency: ${(efficiency * 100).toFixed(0)}%`
    ];
    const px = this.#cell(machine.x, machine.y).x - this.cameraX;
    const py = this.#cell(machine.y, machine.y).y - this.cameraY;
    const tipX = Math.min(px + 12, this.viewportWidth - 160);
    const tipY = Math.max(8, py - 70);

    ctx.save();
    ctx.font = "12px system-ui";
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    const h = lines.length * 18 + 8;
    ctx.fillStyle = "rgba(10,14,18,0.88)";
    this.#roundRect(ctx, tipX, tipY, maxW, h, 4);
    ctx.fill();
    ctx.strokeStyle = "#445566";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ddeeff";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], tipX + 8, tipY + 6 + i * 18);
    }
    ctx.restore();
  }

  #drawMarkers(ctx) {
    if (!this.markers || this.tileSize < 16) return;
    for (const marker of this.markers.all()) {
      if (!this.#isVisible(marker.x, marker.y)) continue;
      const { x, y, size } = this.#cell(marker.x, marker.y);
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const pad = 4;
      ctx.font = `bold ${Math.max(10, size * 0.22)}px system-ui`;
      const w = ctx.measureText(marker.text).width + pad * 2;
      const h = size * 0.28;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = marker.color ?? "#ffe066";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(marker.text, x + pad, y + h / 2);
      ctx.restore();
    }
  }

  #drawPortArrow(ctx, cx, cy, size, direction) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.#angle(direction));
    ctx.fillStyle = "#111111";
    this.#triangle(ctx, size * 0.31, 0, size * 0.15);
    ctx.restore();
  }

  #cell(x, y) {
    const size = this.tileSize;
    const px = x * size;
    const py = y * size;
    return { x: px, y: py, cx: px + size / 2, cy: py + size / 2, size };
  }

  #machineRect(machine) {
    const cell = this.#cell(machine.x, machine.y);
    const width = (machine.width ?? 1) * this.tileSize;
    const height = (machine.height ?? 1) * this.tileSize;
    return {
      x: cell.x,
      y: cell.y,
      cx: cell.x + width / 2,
      cy: cell.y + height / 2,
      size: { width, height }
    };
  }

  #isVisible(x, y) {
    const px = x * this.tileSize;
    const py = y * this.tileSize;
    return px + this.tileSize >= this.cameraX
      && py + this.tileSize >= this.cameraY
      && px <= this.cameraX + this.viewportWidth
      && py <= this.cameraY + this.viewportHeight;
  }

  #angle(direction) {
    return {
      [Direction.Right]: 0,
      [Direction.Down]: Math.PI / 2,
      [Direction.Left]: Math.PI,
      [Direction.Up]: -Math.PI / 2
    }[direction];
  }

  #triangle(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x + size, y);
    ctx.lineTo(x - size * 0.45, y - size * 0.7);
    ctx.lineTo(x - size * 0.45, y + size * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  #roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  #machineLabel(type) {
    return { add: "A+B", subtract: "A-B", multiply: "A*B", divide: "A/B", exponentiate: "A^B", storage: "STOR" }[type] ?? type;
  }

  #machinePalette(machine) {
    if (machine.type === "core") return { fill: "#bd1823", stroke: "#2b0508", text: "#ffffff" };
    if (machine.type === "source") return { fill: "#12bfc8", stroke: "#02191d", text: "#ffffff" };
    if (machine.type === "extractor") return { fill: "#a06400", stroke: "#3d2700", text: "#ffffff" };
    if (machine.type === "storage") return { fill: "#1a4a8a", stroke: "#0a1a30", text: "#c0d8ff" };
    if (machine.state === "blocked") return { fill: "#a92616", stroke: "#1f0504", text: "#ffffff" };
    if (machine.state === "processing") return { fill: "#42dc1c", stroke: "#061805", text: "#071208" };
    if (machine.state === "waiting") return { fill: "#d36e1b", stroke: "#1f0d04", text: "#120903" };
    return { fill: "#2bbf3a", stroke: "#061805", text: "#071208" };
  }

  #drawStorageContents(ctx, machine, x, y, cx, cy, size, fontScale, palette) {
    const fill = machine.buffer.length / machine.maxBuffer;
    const barH = size.height * 0.12;
    const barY = y + size.height - barH - 4;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x + 4, barY, size.width - 8, barH);
    ctx.fillStyle = fill > 0.9 ? "#e04010" : "#20c060";
    ctx.fillRect(x + 4, barY, (size.width - 8) * fill, barH);

    ctx.fillStyle = palette.text;
    ctx.font = `700 ${Math.max(9, fontScale * 0.2)}px system-ui`;
    ctx.fillText("storage", cx, cy + fontScale * 0.28);
    ctx.font = `800 ${Math.max(11, fontScale * 0.26)}px system-ui`;
    ctx.fillText(`${machine.buffer.length}`, cx, cy - fontScale * 0.08);

    const unique = [...new Set(machine.buffer)].slice(0, 3);
    if (unique.length > 0) {
      ctx.font = `600 ${Math.max(8, fontScale * 0.14)}px system-ui`;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(unique.join(" "), cx, cy + fontScale * 0.12);
    }
  }

  #drawExtractorPulse(ctx, cx, cy, size, machine) {
    const phase = (machine.progress / Math.max(1, machine.sourceInterval));
    const maxR = size * 0.48;
    const r = maxR * phase;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(200, 125, 0, ${0.6 * (1 - phase)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  #drawMathPorts(ctx, machine, palette) {
    const a = machine.orientation === "horizontal"
      ? this.#cell(machine.x + 1, machine.y)
      : this.#cell(machine.x, machine.y);
    const b = machine.orientation === "horizontal"
      ? this.#cell(machine.x, machine.y)
      : this.#cell(machine.x, machine.y + 1);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.max(10, this.tileSize * 0.28)}px system-ui`;
    ctx.fillStyle = palette.text;
    ctx.fillText("A", a.cx - this.tileSize * 0.22, a.cy);
    ctx.fillText("B", b.cx - this.tileSize * 0.22, b.cy);
    ctx.fillStyle = "#111111";
    this.#triangle(ctx, a.x + this.tileSize * 0.13, a.cy, this.tileSize * 0.1);
    this.#triangle(ctx, b.x + this.tileSize * 0.13, b.cy, this.tileSize * 0.1);
    ctx.restore();
  }

  #isMathMachine(machine) {
    return ["add", "subtract", "multiply", "divide", "exponentiate"].includes(machine.type);
  }

  #clampCamera() {
    this.tileSize = this.baseTileSize * this.zoom;
    const maxX = Math.max(0, this.grid.width * this.tileSize - this.viewportWidth);
    const maxY = Math.max(0, this.grid.height * this.tileSize - this.viewportHeight);
    this.cameraX = Math.max(0, Math.min(maxX, this.cameraX));
    this.cameraY = Math.max(0, Math.min(maxY, this.cameraY));
  }
}
