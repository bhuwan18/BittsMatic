import assert from "node:assert/strict";
import test from "node:test";

import { Direction } from "../src/core/constants.js";
import { GameLoop } from "../src/core/GameLoop.js";
import { GridManager } from "../src/core/GridManager.js";
import { BlueprintManager } from "../src/systems/BlueprintManager.js";
import { Item } from "../src/entities/Item.js";
import { Machine } from "../src/entities/Machine.js";
import { AuthSession } from "../src/systems/AuthSession.js";
import { Progression } from "../src/systems/Progression.js";

const silentLogger = { debug() {} };
// Pin beltSpeedMultiplier to 1 so tests remain timing-stable regardless of production default
const loopFor = (grid) => new GameLoop(grid, { logger: silentLogger, beltSpeedMultiplier: 1 });

test("items carry numeric values and display labels", () => {
  const item = new Item(12.5);

  assert.equal(item.value, 12.5);
  assert.equal(item.label, "12.5");
});

test("belt movement is time based and does not transfer before offset reaches one", () => {
  const grid = new GridManager(5, 3);
  grid.placeBelt(1, 1, Direction.Right);
  grid.placeBelt(2, 1, Direction.Right);
  const item = new Item(10);
  grid.tryInsertItemAt(1, 1, item, Direction.Right);

  const loop = loopFor(grid);
  loop.update(0.5);

  assert.equal(grid.getBelt(1, 1).item, item);
  assert.equal(grid.getBelt(2, 1).item, null);
  assert.equal(item.offset, 0.5);

  loop.update(0.5);

  assert.equal(grid.getBelt(1, 1).item, null);
  assert.equal(grid.getBelt(2, 1).item, item);
  assert.equal(item.offset, 0);
  assert.equal(grid.items.size, 1);
});

test("blocked or invalid belt movement never deletes the item", () => {
  const grid = new GridManager(4, 3);
  grid.placeBelt(1, 1, Direction.Right);
  const item = new Item(7);
  grid.tryInsertItemAt(1, 1, item, Direction.Right);

  const loop = loopFor(grid);
  loop.update(2);

  assert.equal(grid.getBelt(1, 1).item, item);
  assert.equal(item.offset, 1);
  assert.equal(grid.items.has(item.id), true);
});

test("belt loops preserve all numeric items without duplication", () => {
  const grid = new GridManager(4, 4);
  grid.placeBelt(1, 1, Direction.Right);
  grid.placeBelt(2, 1, Direction.Down);
  grid.placeBelt(2, 2, Direction.Left);
  grid.placeBelt(1, 2, Direction.Up);
  const a = new Item(10);
  const b = new Item(2);
  grid.tryInsertItemAt(1, 1, a, Direction.Right);
  grid.tryInsertItemAt(2, 2, b, Direction.Left);

  const loop = loopFor(grid);
  for (let i = 0; i < 12; i += 1) loop.update(1);

  const items = grid.belts().filter((belt) => belt.item).map((belt) => belt.item.id).sort();
  assert.deepEqual(items, [a.id, b.id].sort());
  assert.equal(grid.items.size, 2);
});

test("add machine waits for both inputs and outputs the sum", () => {
  const grid = new GridManager(7, 5);
  grid.placeBelt(1, 2, Direction.Right);
  grid.placeBelt(1, 3, Direction.Right);
  const add = Machine.math({
    type: "add",
    x: 2,
    y: 2,
    output: Direction.Right,
    ticks: 1
  });
  grid.placeMachine(add);
  grid.placeBelt(3, 2, Direction.Right);
  grid.tryInsertItemAt(1, 2, new Item(10), Direction.Right);
  grid.tryInsertItemAt(1, 3, new Item(2), Direction.Right);

  const loop = loopFor(grid);
  loop.update(1);
  loop.update(1);

  assert.equal(grid.getBelt(3, 2).item.value, 12);
  assert.equal(grid.items.size, 1);
});

test("divide machine handles divide by zero safely", () => {
  const grid = new GridManager(7, 5);
  grid.placeBelt(1, 2, Direction.Right);
  grid.placeBelt(1, 3, Direction.Right);
  const divide = Machine.math({
    type: "divide",
    x: 2,
    y: 2,
    output: Direction.Right,
    ticks: 1
  });
  grid.placeMachine(divide);
  grid.placeBelt(3, 2, Direction.Right);
  grid.tryInsertItemAt(1, 2, new Item(10), Direction.Right);
  grid.tryInsertItemAt(1, 3, new Item(0), Direction.Right);

  const loop = loopFor(grid);
  loop.update(2);

  assert.equal(grid.getBelt(3, 2).item.value, 0);
  assert.equal(divide.state, "idle");
});

test("divide machine emits integer quotient and remainder on two separate output ports", () => {
  const grid = new GridManager(8, 7);
  grid.placeBelt(1, 2, Direction.Right);
  grid.placeBelt(1, 3, Direction.Right);
  const divide = Machine.math({
    type: "divide",
    x: 2,
    y: 2,
    output: Direction.Right,
    secondaryOutput: Direction.Down,
    ticks: 1
  });
  grid.placeMachine(divide);
  grid.placeBelt(3, 2, Direction.Right);  // quotient output
  grid.placeBelt(2, 4, Direction.Right);  // remainder output (below bottom tile)
  grid.tryInsertItemAt(1, 2, new Item(17), Direction.Right);
  grid.tryInsertItemAt(1, 3, new Item(5), Direction.Right);

  const loop = loopFor(grid);
  loop.update(2);

  assert.equal(grid.getBelt(3, 2).item.value, 3);  // floor(17/5) = 3
  assert.equal(grid.getBelt(2, 4).item.value, 2);  // 17 % 5 = 2
  assert.equal(divide.state, "idle");
  assert.equal(grid.items.size, 2);
});

test("divide machine blocks when remainder port has no output route", () => {
  const grid = new GridManager(7, 5);
  grid.placeBelt(1, 2, Direction.Right);
  grid.placeBelt(1, 3, Direction.Right);
  const divide = Machine.math({
    type: "divide",
    x: 2,
    y: 2,
    output: Direction.Right,
    secondaryOutput: Direction.Down,
    ticks: 1
  });
  grid.placeMachine(divide);
  grid.placeBelt(3, 2, Direction.Right);  // only quotient belt, no remainder belt
  grid.tryInsertItemAt(1, 2, new Item(10), Direction.Right);
  grid.tryInsertItemAt(1, 3, new Item(3), Direction.Right);

  const loop = loopFor(grid);
  loop.update(2);

  // Quotient was emitted, remainder is pending (blocked)
  assert.equal(grid.getBelt(3, 2).item.value, 3);  // floor(10/3) = 3
  assert.equal(divide.state, "blocked");
  assert.notEqual(divide.pendingSecondaryOutput, null);
});

test("exponentiate machine computes A to the power of B", () => {
  const grid = new GridManager(7, 5);
  grid.placeBelt(1, 2, Direction.Right);
  grid.placeBelt(1, 3, Direction.Right);
  const power = Machine.math({
    type: "exponentiate",
    x: 2,
    y: 2,
    output: Direction.Right,
    ticks: 1
  });
  grid.placeMachine(power);
  grid.placeBelt(3, 2, Direction.Right);
  grid.tryInsertItemAt(1, 2, new Item(2), Direction.Right);
  grid.tryInsertItemAt(1, 3, new Item(8), Direction.Right);

  const loop = loopFor(grid);
  loop.update(2);

  assert.equal(grid.getBelt(3, 2).item.value, 256);  // 2^8 = 256
  assert.equal(grid.items.size, 1);
});

test("math machines occupy a linked 1x2 vertical footprint", () => {
  const grid = new GridManager(6, 6);
  const multiply = Machine.math({ type: "multiply", x: 2, y: 2 });

  assert.equal(multiply.width, 1);
  assert.equal(multiply.height, 2);
  assert.equal(grid.placeMachine(multiply), true);
  assert.equal(grid.getMachine(2, 2), multiply);
  assert.equal(grid.getMachine(2, 3), multiply);
  assert.equal(grid.tileAt(2, 2).parentMachineId, multiply.id);
  assert.equal(grid.tileAt(2, 3).parentMachineId, multiply.id);
  assert.equal(grid.placeBelt(2, 3, Direction.Right), false);

  assert.equal(grid.removeAt(2, 3), true);
  assert.equal(grid.getMachine(2, 2), null);
  assert.equal(grid.getMachine(2, 3), null);
});

test("math input routing uses top tile as A and bottom tile as B", () => {
  const grid = new GridManager(7, 6);
  grid.placeBelt(1, 2, Direction.Right);
  grid.placeBelt(1, 3, Direction.Right);
  const subtract = Machine.math({ type: "subtract", x: 2, y: 2, output: Direction.Right, ticks: 1 });
  grid.placeMachine(subtract);
  grid.placeBelt(3, 2, Direction.Right);
  grid.tryInsertItemAt(1, 2, new Item(10), Direction.Right);
  grid.tryInsertItemAt(1, 3, new Item(3), Direction.Right);

  const loop = loopFor(grid);
  loop.update(2);

  assert.equal(grid.getBelt(3, 2).item.value, 7);
});

test("math machine holds inputs when output is blocked", () => {
  const grid = new GridManager(7, 6);
  grid.placeBelt(1, 2, Direction.Right);
  grid.placeBelt(1, 3, Direction.Right);
  const add = Machine.math({ type: "add", x: 2, y: 2, output: Direction.Right, ticks: 1 });
  grid.placeMachine(add);
  grid.tryInsertItemAt(1, 2, new Item(10), Direction.Right);
  grid.tryInsertItemAt(1, 3, new Item(5), Direction.Right);

  const loop = loopFor(grid);
  loop.update(2);

  assert.equal(add.state, "blocked");
  assert.equal(add.inputBuffers.get("A").value, 10);
  assert.equal(add.inputBuffers.get("B").value, 5);
  assert.equal(grid.items.size, 2);
});

test("core occupies a non-removable 3x3 footprint and consumes delivered items", () => {
  const grid = new GridManager(11, 11);
  const core = Machine.core({ x: 4, y: 4 });
  assert.equal(grid.placeMachine(core), true);

  assert.equal(grid.getMachine(4, 4), core);
  assert.equal(grid.getMachine(6, 6), core);
  assert.equal(grid.removeAt(5, 5), false);

  grid.placeBelt(3, 5, Direction.Right);
  const item = new Item(3);
  grid.tryInsertItemAt(3, 5, item, Direction.Right);
  const loop = loopFor(grid);
  loop.update(1);
  loop.update(1);

  assert.equal(grid.items.has(item.id), false);
  assert.equal(core.storedValues.length, 1);
  assert.equal(core.storedValues[0], 3);
});

test("core delivery completes only the current matching objective", () => {
  const grid = new GridManager(11, 11);
  const progression = new Progression();
  const core = Machine.core({ x: 4, y: 4 });
  grid.placeMachine(core);
  grid.placeBelt(3, 5, Direction.Right);

  const loop = new GameLoop(grid, { progression, logger: silentLogger });
  const wrong = new Item(10);
  grid.tryInsertItemAt(3, 5, wrong, Direction.Right);
  loop.update(2);

  assert.equal(progression.currentObjective().target, 1);
  assert.equal(progression.currentObjective().complete, false);
  assert.equal(progression.wrongDeliveries, 1);
  assert.deepEqual(core.rejectedValues, [10]);

  const match = new Item(1);
  grid.tryInsertItemAt(3, 5, match, Direction.Right);
  loop.update(2);

  assert.equal(progression.currentObjective().target, 2);
  assert.deepEqual(progression.completedObjectives, ["level-1"]);
});

test("progression serializes account progress and restores current objective", () => {
  const progression = new Progression();

  assert.equal(progression.deliver(1).matched, true);
  assert.equal(progression.deliver(99).matched, false);

  const restored = new Progression({
    saveData: progression.toSaveData()
  });

  assert.equal(restored.currentLevel, 1);
  assert.equal(restored.currentObjective().target, 2);
  assert.deepEqual(restored.completedObjectives, ["level-1"]);
  assert.equal(restored.wrongDeliveries, 1);
});

test("auth session stores profile and progress per account without tokens", () => {
  const storage = new Map();
  const session = new AuthSession({
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    }
  });

  session.signInWithProfile({
    id: "user-1",
    name: "Ada",
    email: "ada@example.test",
    credential: "plain-token"
  });
  session.saveProgress({ currentLevel: 2, completedObjectives: ["make-1", "make-2"] });

  const restored = new AuthSession({
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    }
  });

  assert.equal(restored.isLoggedIn(), true);
  assert.equal(restored.user.id, "user-1");
  assert.equal(restored.user.credential, undefined);
  assert.deepEqual(restored.loadProgress(), {
    currentLevel: 2,
    completedObjectives: ["make-1", "make-2"]
  });

  restored.signOut();
  assert.equal(restored.isLoggedIn(), false);
  assert.equal(storage.has("bitts-matic.current-user"), false);
});

test("blueprints copy belts and machines as relative layout without moving items", () => {
  const grid = new GridManager(10, 10);
  grid.placeBelt(2, 2, Direction.Right);
  grid.tryInsertItemAt(2, 2, new Item(4), Direction.Right);
  const add = Machine.math({ type: "add", x: 3, y: 2, output: Direction.Right, ticks: 3 });
  grid.placeMachine(add);

  const blueprint = new BlueprintManager(grid).copy({ x: 2, y: 2, width: 2, height: 2 });

  assert.equal(blueprint.belts.length, 1);
  assert.deepEqual(blueprint.belts[0], { x: 0, y: 0, direction: Direction.Right, speed: 1 });
  assert.equal(blueprint.machines.length, 1);
  assert.equal(blueprint.machines[0].type, "add");
  assert.equal(blueprint.machines[0].x, 1);
  assert.equal(blueprint.machines[0].y, 0);
  assert.equal(blueprint.items?.length ?? 0, 0);
});

test("blueprint copy auto-includes complete multi-tile machines from partial selections", () => {
  const grid = new GridManager(10, 10);
  const multiply = Machine.math({ type: "multiply", x: 4, y: 4, output: Direction.Right });
  grid.placeMachine(multiply);

  const blueprint = new BlueprintManager(grid).copy({ x: 4, y: 5, width: 1, height: 1 });

  assert.equal(blueprint.width, 1);
  assert.equal(blueprint.height, 2);
  assert.equal(blueprint.machines.length, 1);
  assert.deepEqual(
    { x: blueprint.machines[0].x, y: blueprint.machines[0].y, type: blueprint.machines[0].type },
    { x: 0, y: 0, type: "multiply" }
  );
});

test("blueprint paste validates entire footprint and prevents overlapping placement", () => {
  const grid = new GridManager(12, 12);
  grid.placeBelt(1, 1, Direction.Right);
  grid.placeMachine(Machine.math({ type: "subtract", x: 2, y: 1, output: Direction.Right }));
  const blueprints = new BlueprintManager(grid);
  const blueprint = blueprints.copy({ x: 1, y: 1, width: 2, height: 2 });

  grid.placeBelt(8, 8, Direction.Left);

  assert.equal(blueprints.canPaste(blueprint, 7, 8).valid, false);
  assert.equal(blueprints.paste(blueprint, 7, 8), false);

  assert.equal(blueprints.canPaste(blueprint, 5, 5).valid, true);
  assert.equal(blueprints.paste(blueprint, 5, 5), true);
  assert.equal(grid.getBelt(5, 5).direction, Direction.Right);
  const pastedMachine = grid.getMachine(6, 5);
  assert.equal(pastedMachine.type, "subtract");
  assert.equal(grid.getMachine(6, 6), pastedMachine);
});

test("blueprint rotation rotates belts and math machine output positions", () => {
  const grid = new GridManager(12, 12);
  grid.placeBelt(1, 1, Direction.Right);
  grid.placeMachine(Machine.math({ type: "divide", x: 2, y: 1, output: Direction.Right }));
  const blueprints = new BlueprintManager(grid);
  const blueprint = blueprints.copy({ x: 1, y: 1, width: 2, height: 2 });
  const rotated = blueprints.rotate(blueprint);

  assert.equal(rotated.width, 2);
  assert.equal(rotated.height, 2);
  assert.deepEqual(rotated.belts[0], { x: 1, y: 0, direction: Direction.Down, speed: 1 });
  assert.equal(rotated.machines[0].type, "divide");
  assert.equal(rotated.machines[0].x, 0);
  assert.equal(rotated.machines[0].y, 1);
  assert.equal(rotated.machines[0].width, 2);
  assert.equal(rotated.machines[0].height, 1);
  assert.equal(rotated.machines[0].orientation, "horizontal");
  assert.equal(rotated.machines[0].output, Direction.Down);
});

test("bridge auto-creates when placing belt over a perpendicular belt", () => {
  const grid = new GridManager(10, 10);
  assert.equal(grid.placeBelt(5, 5, Direction.Right), true);
  assert.equal(grid.placeBelt(5, 5, Direction.Down), true);  // perpendicular → bridge
  const bridge = grid.getBridge(5, 5);
  assert.ok(bridge, "bridge should exist after crossing");
  assert.equal(bridge.primaryDir, Direction.Right);
  assert.equal(bridge.crossDir, Direction.Down);
  assert.equal(bridge.layers.length, 2);
});

test("bridge two layers carry items independently without mixing", () => {
  const grid = new GridManager(12, 12);
  // Belt layout: (4,5)→bridge(5,5)→(6,5) for horizontal; (5,4)→bridge(5,5)→(5,6) for vertical
  grid.placeBelt(4, 5, Direction.Right);  // feeds horizontal layer
  grid.placeBelt(5, 4, Direction.Down);   // feeds vertical layer
  grid.placeBelt(5, 5, Direction.Right);  // primary
  grid.placeBelt(5, 5, Direction.Down);   // auto-upgrades to bridge
  grid.placeBelt(6, 5, Direction.Right);  // horizontal exit
  grid.placeBelt(5, 6, Direction.Down);   // vertical exit

  const itemH = new Item(10);
  const itemV = new Item(20);
  grid.tryInsertItemAt(4, 5, itemH, Direction.Right);
  grid.tryInsertItemAt(5, 4, itemV, Direction.Down);

  const loop = loopFor(grid);
  for (let i = 0; i < 4; i += 1) loop.update(1);

  assert.equal(grid.getBelt(6, 5)?.item?.value, 10, "horizontal item must exit right");
  assert.equal(grid.getBelt(5, 6)?.item?.value, 20, "vertical item must exit down");
  assert.equal(grid.items.size, 2, "no items lost or duplicated");
});

test("bridge removeAt deletes both layer items and clears tile", () => {
  const grid = new GridManager(10, 10);
  grid.placeBelt(5, 5, Direction.Right);
  grid.placeBelt(5, 5, Direction.Down);
  const bridge = grid.getBridge(5, 5);
  const itemA = new Item(1);
  const itemB = new Item(2);
  bridge.layers[0].insertItem(itemA, { x: 4, y: 5 }, { x: 5, y: 5 });
  bridge.layers[1].insertItem(itemB, { x: 5, y: 4 }, { x: 5, y: 5 });
  grid.items.set(itemA.id, itemA);
  grid.items.set(itemB.id, itemB);

  grid.removeAt(5, 5);

  assert.equal(grid.getBridge(5, 5), null);
  assert.equal(grid.items.has(itemA.id), false);
  assert.equal(grid.items.has(itemB.id), false);
});

test("storage machine buffers items from all sides and emits one per tick", () => {
  const grid = new GridManager(10, 10);
  const store = Machine.storage({ x: 5, y: 5, output: Direction.Right });
  grid.placeMachine(store);
  grid.placeBelt(4, 5, Direction.Right);  // left input
  grid.placeBelt(6, 5, Direction.Right);  // right output

  const itemA = new Item(7);
  const itemB = new Item(3);
  grid.tryInsertItemAt(4, 5, itemA, Direction.Right);

  const loop = loopFor(grid);
  // Tick 1: item arrives at storage input port
  loop.update(1);
  // Tick 2: storage drains input to buffer, emits first item
  loop.update(1);
  loop.update(1);

  assert.equal(grid.getBelt(6, 5).item?.value, 7, "first item must exit right");
});

test("storage machine accepts from multiple directions in same tick", () => {
  const grid = new GridManager(10, 10);
  const store = Machine.storage({ x: 5, y: 5, output: Direction.Right });
  grid.placeMachine(store);
  // Feed from left and top simultaneously
  grid.placeBelt(4, 5, Direction.Right);
  grid.placeBelt(5, 4, Direction.Down);
  grid.placeBelt(6, 5, Direction.Right);

  grid.tryInsertItemAt(4, 5, new Item(10), Direction.Right);
  grid.tryInsertItemAt(5, 4, new Item(20), Direction.Down);

  const loop = loopFor(grid);
  for (let i = 0; i < 4; i += 1) loop.update(1);

  assert.equal(store.buffer.length + (grid.getBelt(6, 5).item ? 1 : 0), 2,
    "both items must be accounted for");
});

test("upgrade belt-speed multiplier starts at 2x and increases each tier purchase", () => {
  const p = new Progression();
  assert.equal(p.beltSpeedMultiplier, 2, "base belt speed is 2x");

  // Not enough points yet
  assert.equal(p.buyUpgrade("belt-speed"), false, "cannot buy without points");

  // Force enough level and points
  p.currentLevel = 9; // level 10 in 1-indexed → index 9
  p.upgradePoints = 15;
  assert.equal(p.buyUpgrade("belt-speed"), true);
  assert.equal(p.beltSpeedMultiplier, 2.5);
  assert.equal(p.upgradePoints, 0);

  // Next tier needs 50 pts
  p.upgradePoints = 50;
  assert.equal(p.buyUpgrade("belt-speed"), true);
  assert.equal(p.beltSpeedMultiplier, 3);
});

test("upgrade extractor-speed reduces effective emission interval", () => {
  const grid = new GridManager(10, 10);
  const ext = Machine.extractor({ x: 5, y: 5, output: Direction.Right, nodeValue: 1, interval: 2 });
  grid.placeMachine(ext);
  grid.placeBelt(6, 5, Direction.Right);

  // Speed multiplier 2 → effectiveInterval = floor(2/2) = 1 → emits every tick
  const loop = new GameLoop(grid, { logger: silentLogger, beltSpeedMultiplier: 1 });
  const context = {
    emitFromMachine: (machine, item) => grid.tryEmitFromMachine(machine, item),
    emitSecondaryFromMachine: () => false,
    consumeItem: () => {},
    deliver: () => {},
    logMachineBlocked: () => {},
    extractorSpeedMultiplier: 2
  };

  // Tick once — with multiplier 2, interval is 1 tick, so it emits on tick 1
  ext.tick(context);
  assert.equal(grid.getBelt(6, 5).item?.value, 1, "first item emitted after 1 tick with 2x speed");
});

test("upgrades persist through save and restore", () => {
  const p = new Progression();
  p.currentLevel = 9;
  p.upgradePoints = 15;
  p.buyUpgrade("belt-speed");

  const restored = new Progression({ saveData: p.toSaveData() });
  assert.equal(restored.beltSpeedMultiplier, 2.5);
  assert.equal(restored.upgradePoints, 0);
  assert.equal(restored.purchasedUpgrades["belt-speed"], 1);
});

test("pasted rotated math machines keep a valid two-tile footprint", () => {
  const grid = new GridManager(12, 12);
  grid.placeBelt(1, 1, Direction.Right);
  grid.placeMachine(Machine.math({ type: "add", x: 2, y: 1, output: Direction.Right, ticks: 1 }));
  const blueprints = new BlueprintManager(grid);
  const rotated = blueprints.rotate(blueprints.copy({ x: 1, y: 1, width: 2, height: 2 }));

  assert.equal(blueprints.canPaste(rotated, 5, 5).valid, true);
  assert.equal(blueprints.paste(rotated, 5, 5), true);

  const pastedMachine = grid.getMachine(5, 6);
  assert.equal(pastedMachine.orientation, "horizontal");
  assert.equal(grid.getMachine(6, 6), pastedMachine);
  assert.equal(grid.getMachine(5, 7), null);
});
