import { Direction } from "./core/constants.js";
import { GameLoop } from "./core/GameLoop.js";
import { GridManager } from "./core/GridManager.js";
import { Machine } from "./entities/Machine.js";
import { InputHandler } from "./input/InputHandler.js";
import { Renderer } from "./rendering/Renderer.js";
import { ITEM_COLORS, TOOLS } from "./config/recipes.js";
import { Progression } from "./systems/Progression.js";

const canvas = document.querySelector("#game");
const toolbar = document.querySelector("#toolbar");
const resources = document.querySelector("#resources");
const milestones = document.querySelector("#milestones");

const grid = new GridManager(24, 20);
const progression = new Progression();
const loop = new GameLoop(grid, { progression, tickRate: 5 });

grid.placeMachine(Machine.core({ x: 12, y: 10 }));

const renderer = new Renderer(canvas, grid, loop, progression);
const input = new InputHandler(canvas, grid, renderer, progression, updateUi);

window.addEventListener("resize", () => renderer.resize());
renderer.resize();
updateUi();

let lastTime = performance.now();
function frame(now) {
  const delta = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  loop.update(delta);
  renderer.render(input.direction);
  updateUi(false);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function updateUi(rebuildToolbar = true) {
  if (rebuildToolbar) renderToolbar();
  renderResources();
  renderMilestones();
}

function renderToolbar() {
  toolbar.replaceChildren(...TOOLS.map((tool) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tool-button";
    button.dataset.active = String(input.selectedTool === tool.id);
    button.disabled = !progression.isUnlocked(tool.unlock);
    button.title = `${tool.label} (${tool.hotkey})`;
    button.innerHTML = `<span class="glyph">${tool.glyph}</span><span>${tool.label}</span><small>${tool.hotkey}</small>`;
    button.addEventListener("click", () => input.selectTool(tool.id));
    return button;
  }));
}

function renderResources() {
  const known = ["ore", "plate", "gear"];
  resources.replaceChildren(...known.map((type) => {
    const row = document.createElement("div");
    row.className = "resource-row";
    row.innerHTML = `<span class="swatch" style="background:${ITEM_COLORS[type]}"></span><span>${type}</span><strong>${progression.count(type)}</strong>`;
    return row;
  }));
}

function renderMilestones() {
  milestones.replaceChildren(...progression.nextMilestones().map((milestone) => {
    const item = document.createElement("div");
    item.className = "milestone";
    item.dataset.unlocked = String(milestone.unlocked);
    const requirements = Object.entries(milestone.requirements)
      .map(([type, count]) => `${progression.count(type)}/${count} ${type}`)
      .join(", ");
    item.innerHTML = `<strong>${milestone.label}</strong><span>${milestone.unlocked ? "Unlocked" : requirements}</span>`;
    return item;
  }));
}

// Seed a tiny hint of direction without solving the factory for the player.
grid.placeBelt(11, 10, Direction.Right);
