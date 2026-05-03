import { Direction } from "./core/constants.js";
import { GameLoop } from "./core/GameLoop.js";
import { GridManager } from "./core/GridManager.js";
import { Machine } from "./entities/Machine.js";
import { InputHandler } from "./input/InputHandler.js";
import { Renderer } from "./rendering/Renderer.js";
import { TOOLS } from "./config/recipes.js";
import { AuthSession, profileFromGoogleCredential } from "./systems/AuthSession.js";
import { Progression } from "./systems/Progression.js";
import { MarkerManager } from "./systems/MarkerManager.js";
import { StatsCollector } from "./systems/StatsCollector.js";

const canvas = document.querySelector("#game");
const toolbar = document.querySelector("#toolbar");
const resources = document.querySelector("#resources");
const milestones = document.querySelector("#milestones");
const copyBlueprintButton = document.querySelector("#copyBlueprint");
const pasteBlueprintButton = document.querySelector("#pasteBlueprint");
const rotateBlueprintButton = document.querySelector("#rotateBlueprint");
const blueprintStatus = document.querySelector("#blueprintStatus");
const loginScreen = document.querySelector("#loginScreen");
const googleButton = document.querySelector("#googleButton");
const loginError = document.querySelector("#loginError");
const logoutButton = document.querySelector("#logoutButton");
const playerName = document.querySelector("#playerName");
const objectiveText = document.querySelector("#objectiveText");
const objectiveStatus = document.querySelector("#objectiveStatus");
const objectiveBanner = document.querySelector("#objectiveBanner");
const successToast = document.querySelector("#successToast");
const upgradePointsLabel = document.querySelector("#upgradePointsLabel");
const upgradeShop = document.querySelector("#upgradeShop");

const auth = new AuthSession();
const markers = new MarkerManager();
const stats = new StatsCollector();
let grid = null;
let progression = null;
let loop = null;
let renderer = null;
let input = null;
let animationFrame = 0;
let lastTime = 0;
let lastCompletedObjective = null;

if (auth.isLoggedIn()) {
  showGame();
} else {
  showLogin();
}

logoutButton.addEventListener("click", () => {
  auth.signOut();
  if (animationFrame) cancelAnimationFrame(animationFrame);
  window.location.reload();
});

function showLogin() {
  loginScreen.hidden = false;
  document.body.dataset.auth = "login";
  renderGoogleButton();
}

function showGame() {
  loginScreen.hidden = true;
  document.body.dataset.auth = "game";
  startGame();
}

function renderGoogleButton() {
  const clientId = document.querySelector('meta[name="google-signin-client_id"]')?.content?.trim();
  if (!clientId) {
    loginError.textContent = "Add your Google OAuth client ID to the google-signin-client_id meta tag.";
    return;
  }

  const waitForGoogle = () => {
    if (!globalThis.google?.accounts?.id) {
      window.setTimeout(waitForGoogle, 100);
      return;
    }

    globalThis.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        try {
          const profile = profileFromGoogleCredential(response.credential);
          auth.signInWithProfile(profile);
          showGame();
        } catch (error) {
          loginError.textContent = error.message || "Google sign-in failed. Please try again.";
        }
      }
    });
    globalThis.google.accounts.id.renderButton(googleButton, {
      theme: "filled_black",
      size: "large",
      type: "standard",
      text: "signin_with",
      shape: "rectangular"
    });
  };

  waitForGoogle();
}

function startGame() {
  grid = new GridManager(150, 150);
  progression = new Progression({
    saveData: auth.loadProgress(),
    onChange: (state) => {
      auth.saveProgress(state.toSaveData());
      updateUi(false);
    }
  });
  loop = new GameLoop(grid, { progression, tickRate: 1, stats });

  const coreX = Math.floor(grid.width / 2) - 1;
  const coreY = Math.floor(grid.height / 2) - 1;
  const core = Machine.core({ x: coreX, y: coreY });
  grid.placeMachine(core);

  if (!progression.mapSeed) {
    progression.mapSeed = (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
  }
  grid.generateNodes(progression.mapSeed, 80, coreX + 1, coreY + 1, 8);

  renderer = new Renderer(canvas, grid, loop, progression, markers);
  renderer.stats = stats;
  input = new InputHandler(canvas, grid, renderer, progression, updateUi, markers);
  copyBlueprintButton.addEventListener("click", () => input.copySelection());
  pasteBlueprintButton.addEventListener("click", () => input.enterPasteMode());
  rotateBlueprintButton.addEventListener("click", () => input.rotatePasteBlueprint());

  window.addEventListener("resize", () => renderer.resize());
  renderer.resize();
  renderer.centerOn(coreX + 1, coreY + 1);
  playerName.textContent = auth.user?.name ? `Signed in as ${auth.user.name}` : "Signed in";
  updateUi();

  // Seed a tiny hint of direction without solving the factory for the player.
  grid.placeBelt(coreX - 1, coreY + 1, Direction.Right);

  lastTime = performance.now();
  animationFrame = requestAnimationFrame(frame);
}

function updateUi(rebuildToolbar = true) {
  if (rebuildToolbar) renderToolbar();
  renderObjective();
  renderBlueprint();
  renderResources();
  renderMilestones();
  renderUpgrades();
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

function renderObjective() {
  const objective = progression.currentObjective();
  objectiveText.textContent = objective ? `Goal: Produce ${objective.target}` : "All objectives complete";
  const completed = progression.completedObjectives.length;
  const wrong = progression.wrongDeliveries;
  objectiveStatus.textContent = `${completed}/${progression.objectives.length} complete${wrong ? ` - ${wrong} rejected` : ""}`;

  const completedObjective = progression.lastDelivery?.completedObjective;
  if (completedObjective && completedObjective !== lastCompletedObjective) {
    lastCompletedObjective = completedObjective;
    objectiveBanner.classList.remove("complete-pulse");
    successToast.classList.remove("show");
    requestAnimationFrame(() => {
      objectiveBanner.classList.add("complete-pulse");
      successToast.textContent = `Objective complete. Next goal: ${objective?.target ?? "done"}`;
      successToast.classList.add("show");
      window.setTimeout(() => successToast.classList.remove("show"), 1800);
    });
  }
}

function renderBlueprint() {
  const summary = input.blueprintSummary();
  copyBlueprintButton.disabled = !summary.selection;
  pasteBlueprintButton.disabled = !summary.copied;
  rotateBlueprintButton.disabled = !summary.pasting;

  if (summary.pasting) {
    blueprintStatus.textContent = `Pasting ${summary.entities} entities. Click to place, R to rotate, Esc to cancel.`;
  } else if (summary.copied) {
    blueprintStatus.textContent = `Copied ${summary.entities} entities over ${summary.size.width}x${summary.size.height} tiles.`;
  } else if (summary.selection) {
    blueprintStatus.textContent = `Selected ${summary.selection.width}x${summary.selection.height} tiles.`;
  } else {
    blueprintStatus.textContent = "Select tiles with tool 8 or Ctrl drag, then copy.";
  }
}

function renderResources() {
  const known = [...progression.resources.keys()].sort((a, b) => Number(a) - Number(b));
  const values = known.length ? known : ["none"];
  resources.replaceChildren(...values.map((value) => {
    const row = document.createElement("div");
    row.className = "resource-row";
    if (value === "none") {
      row.innerHTML = `<span class="swatch"></span><span>core values</span><strong>0</strong>`;
    } else {
      row.innerHTML = `<span class="swatch"></span><span>${value}</span><strong>${progression.count(value)}</strong>`;
    }
    return row;
  }));
}

function renderMilestones() {
  milestones.replaceChildren(...progression.nextMilestones().map((milestone) => {
    const item = document.createElement("div");
    item.className = "milestone";
    item.dataset.unlocked = String(milestone.unlocked);
    const status = milestone.unlocked
      ? "Unlocked"
      : `Unlocks at level ${milestone.requiredLevel}`;
    item.innerHTML = `<strong>${milestone.label}</strong><span>${status}</span>`;
    return item;
  }));
}

function renderUpgrades() {
  const pts = progression.upgradePoints;
  upgradePointsLabel.textContent = `${pts} upgrade point${pts !== 1 ? "s" : ""} (earned per correct delivery)`;

  upgradeShop.replaceChildren(...progression.availableUpgrades().map((upgrade) => {
    const item = document.createElement("div");
    item.className = "upgrade-item";
    item.dataset.maxed = String(upgrade.maxed);
    item.dataset.locked = String(!upgrade.unlocked);

    const tierText = upgrade.maxed ? "MAX" : `Tier ${upgrade.tier}/${upgrade.maxTier}`;
    const effectText = upgrade.id === "belt-speed"
      ? `Belt speed: ${progression.beltSpeedMultiplier}×`
      : `Extractor speed: ${progression.extractorSpeedMultiplier}×`;

    const header = document.createElement("div");
    header.className = "upgrade-item-header";
    header.innerHTML = `<strong>${upgrade.label}</strong><span class="upgrade-tier">${tierText}</span>`;

    const effect = document.createElement("div");
    effect.className = "upgrade-effect";
    effect.textContent = effectText;

    item.append(header, effect);

    if (!upgrade.maxed) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "upgrade-buy";
      btn.textContent = upgrade.unlocked
        ? `Upgrade — ${upgrade.cost} pts`
        : `Unlocks at level ${upgrade.requiredLevel}`;
      btn.disabled = !upgrade.canAfford || !upgrade.unlocked;
      btn.addEventListener("click", () => {
        progression.buyUpgrade(upgrade.id);
        renderUpgrades();
      });
      item.append(btn);
    }

    return item;
  }));
}

function frame(now) {
  const delta = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  loop.update(delta);
  renderer.render(input.direction);
  updateUi(false);
  animationFrame = requestAnimationFrame(frame);
}
