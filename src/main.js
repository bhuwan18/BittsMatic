import { Direction } from "./core/constants.js";
import { GameLoop } from "./core/GameLoop.js";
import { GridManager } from "./core/GridManager.js";
import { Machine } from "./entities/Machine.js";
import { InputHandler } from "./input/InputHandler.js";
import { Renderer } from "./rendering/Renderer.js";
import { TOOLS } from "./config/recipes.js";
import { AuthSession, profileFromGoogleCredential } from "./systems/AuthSession.js";
import { CrazyGamesSDK } from "./systems/CrazyGamesSDK.js";
import { Progression } from "./systems/Progression.js";
import { MarkerManager } from "./systems/MarkerManager.js";
import { StatsCollector } from "./systems/StatsCollector.js";
import { ADMIN_GOOGLE_ID } from "./config/admin.js";
import { FIREBASE_CONFIG } from "./config/firebase.js";
import { FirestoreSync } from "./systems/FirestoreSync.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithCredential, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const controlsToggle = document.querySelector("#controlsToggle");
const controlsContent = document.querySelector("#controlsContent");
const adminLink = document.querySelector("#adminLink");

const auth = new AuthSession();
const markers = new MarkerManager();
const stats = new StatsCollector();
const cgSdk = new CrazyGamesSDK();
let grid = null;
let progression = null;
let loop = null;
let renderer = null;
let input = null;
let animationFrame = 0;
let lastTime = 0;
let lastCompletedObjective = null;

let fbAuth = null;
let firestoreSync = null;
let fbUserId = null;

if (FIREBASE_CONFIG.projectId) {
  try {
    const fbApp = initializeApp(FIREBASE_CONFIG);
    fbAuth = getAuth(fbApp);
    firestoreSync = new FirestoreSync(getFirestore(fbApp));
    onAuthStateChanged(fbAuth, (fbUser) => {
      if (!fbUser) return;
      fbUserId = fbUser.uid;
      if (adminLink && ADMIN_GOOGLE_ID && fbUserId === ADMIN_GOOGLE_ID) {
        adminLink.style.display = "";
      }
      if (firestoreSync && auth.isLoggedIn()) {
        firestoreSync.syncUser(auth.user, fbUserId).catch(console.error);
      }
    });
  } catch (e) {
    console.warn("Firebase init failed:", e.message);
  }
}

(async () => {
  const cgReady = await cgSdk.init();

  if (cgReady) {
    cgSdk.loadingStart();

    // Apply locale from SDK so the page lang attribute is accurate.
    const sysInfo = await cgSdk.getSystemInfo();
    if (sysInfo?.locale) {
      document.documentElement.lang = sysInfo.locale;
    }

    const cgUser = await cgSdk.getUser();
    const cgUserId = cgUser ? await cgSdk.getUserId() : null;
    if (cgUser && cgUserId) {
      try {
        auth.signInWithProfile({ id: cgUserId, name: cgUser.username, email: "" });
      } catch { /* guest — no id from token */ }
    }

    // Detect mid-session logins (guest plays then logs into CrazyGames).
    cgSdk.addAuthListener(async (cgUser) => {
      if (!cgUser) return;
      const uid = await cgSdk.getUserId();
      if (!uid) return;
      try {
        auth.signInWithProfile({ id: uid, name: cgUser.username, email: "" });
      } catch {}
      if (playerName) playerName.textContent = `Signed in as ${cgUser.username}`;
      if (progression) auth.saveProgress(progression.toSaveData());
    });

    showGame();
  } else if (auth.isLoggedIn()) {
    showGame();
  } else {
    showLogin();
  }
})();

logoutButton.addEventListener("click", () => {
  cgSdk.gameplayStop();
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
      callback: async (response) => {
        try {
          const profile = profileFromGoogleCredential(response.credential);
          auth.signInWithProfile(profile);
          if (fbAuth && firestoreSync) {
            const credential = GoogleAuthProvider.credential(response.credential);
            const { user: fbUser } = await signInWithCredential(fbAuth, credential);
            fbUserId = fbUser.uid;
            firestoreSync.syncUser(auth.user, fbUserId).catch(console.error);
          }
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
      const saveData = state.toSaveData();
      auth.saveProgress(saveData);
      if (firestoreSync && fbUserId) firestoreSync.syncProgress(fbUserId, saveData).catch(console.error);
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
  controlsToggle.addEventListener("click", () => {
    const nowCollapsed = controlsContent.classList.toggle("collapsed");
    controlsToggle.setAttribute("aria-expanded", String(!nowCollapsed));
  });

  window.addEventListener("resize", () => renderer.resize());
  window.addEventListener("pagehide", () => cgSdk.gameplayStop());
  renderer.resize();
  renderer.centerOn(coreX + 1, coreY + 1);
  playerName.textContent = auth.user?.name ? `Signed in as ${auth.user.name}` : "Signed in";
  updateUi();

  // Seed a tiny hint of direction without solving the factory for the player.
  grid.placeBelt(coreX - 1, coreY + 1, Direction.Right);

  cgSdk.loadingStop();
  cgSdk.gameplayStart();

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
    cgSdk.gameplayStop();
    cgSdk.requestMidgameAd().then(() => cgSdk.gameplayStart());
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

function swatchColor(value) {
  const hue = (Number(value) * 137.508) % 360;
  return `hsl(${hue.toFixed(0)}, 60%, 55%)`;
}

function renderResources() {
  const known = [...progression.resources.keys()].sort((a, b) => Number(a) - Number(b));
  resources.replaceChildren(...(known.length ? known : [null]).map((value) => {
    const row = document.createElement("div");
    row.className = "resource-row";
    if (value === null) {
      row.innerHTML = `<span class="swatch" style="background:#2e7da4;opacity:0.4"></span><span style="color:#6a8a96;font-style:italic">No deliveries yet</span><strong style="color:#6a8a96">—</strong>`;
    } else {
      row.innerHTML = `<span class="swatch" style="background:${swatchColor(value)}"></span><span>${value}</span><strong>${progression.count(value)}</strong>`;
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
      ? "✓ Unlocked"
      : `Unlocks at level ${milestone.requiredLevel}`;
    item.innerHTML = `<strong>${milestone.label}</strong><span>${status}</span>`;
    return item;
  }));
}

function renderUpgrades() {
  const pts = progression.upgradePoints;
  upgradePointsLabel.innerHTML = `<span class="pts-badge">${pts}</span> point${pts !== 1 ? "s" : ""} to spend`;

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
