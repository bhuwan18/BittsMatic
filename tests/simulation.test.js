import assert from "node:assert/strict";
import test from "node:test";

import { Direction } from "../src/core/constants.js";
import { GameLoop } from "../src/core/GameLoop.js";
import { GridManager } from "../src/core/GridManager.js";
import { Item } from "../src/entities/Item.js";
import { Machine } from "../src/entities/Machine.js";
import { Progression } from "../src/systems/Progression.js";

test("belts move one item forward without duplication", () => {
  const grid = new GridManager(5, 3);
  grid.placeBelt(1, 1, Direction.Right);
  grid.placeBelt(2, 1, Direction.Right);
  const item = new Item("ore");
  assert.equal(grid.tryInsertItemAt(1, 1, item, Direction.Right), true);

  new GameLoop(grid).step();

  assert.equal(grid.getBelt(1, 1).item, null);
  assert.equal(grid.getBelt(2, 1).item, item);
  assert.equal(grid.items.size, 1);
});

test("blocked belts keep items in place", () => {
  const grid = new GridManager(4, 3);
  grid.placeBelt(1, 1, Direction.Right);
  grid.placeBelt(2, 1, Direction.Right);
  const first = new Item("ore");
  const second = new Item("ore");
  grid.tryInsertItemAt(1, 1, first, Direction.Right);
  grid.tryInsertItemAt(2, 1, second, Direction.Right);

  new GameLoop(grid).step();

  assert.equal(grid.getBelt(1, 1).item, first);
  assert.equal(grid.getBelt(2, 1).item, second);
});

test("belt loops preserve all items deterministically", () => {
  const grid = new GridManager(4, 4);
  grid.placeBelt(1, 1, Direction.Right);
  grid.placeBelt(2, 1, Direction.Down);
  grid.placeBelt(2, 2, Direction.Left);
  grid.placeBelt(1, 2, Direction.Up);
  const a = new Item("ore");
  const b = new Item("plate");
  grid.tryInsertItemAt(1, 1, a, Direction.Right);
  grid.tryInsertItemAt(2, 2, b, Direction.Left);

  const loop = new GameLoop(grid);
  for (let i = 0; i < 12; i += 1) loop.step();

  const items = grid.belts().filter((belt) => belt.item).map((belt) => belt.item.id).sort();
  assert.deepEqual(items, [a.id, b.id].sort());
  assert.equal(grid.items.size, 2);
});

test("generator pauses when output is blocked", () => {
  const grid = new GridManager(5, 3);
  const generator = Machine.generator({ x: 1, y: 1, output: Direction.Right, itemType: "ore", interval: 1 });
  grid.placeMachine(generator);
  grid.placeBelt(2, 1, Direction.Right);
  grid.placeBelt(3, 1, Direction.Right);
  grid.tryInsertItemAt(2, 1, new Item("ore"), Direction.Right);
  grid.tryInsertItemAt(3, 1, new Item("ore"), Direction.Right);

  const loop = new GameLoop(grid);
  loop.step();

  assert.equal(grid.getBelt(2, 1).item.type, "ore");
  assert.equal(generator.state, "blocked");
});

test("processor consumes input and emits recipe output when available", () => {
  const grid = new GridManager(6, 3);
  grid.placeBelt(1, 1, Direction.Right);
  const processor = Machine.processor({
    x: 2,
    y: 1,
    input: Direction.Left,
    output: Direction.Right,
    recipe: { inputs: ["ore"], output: "plate", ticks: 2 }
  });
  grid.placeMachine(processor);
  grid.placeBelt(3, 1, Direction.Right);
  grid.tryInsertItemAt(1, 1, new Item("ore"), Direction.Right);

  const loop = new GameLoop(grid);
  loop.step();
  loop.step();
  loop.step();

  assert.equal(grid.getBelt(3, 1).item.type, "plate");
  assert.equal(processor.state, "idle");
});

test("combiner waits for all required inputs before processing", () => {
  const grid = new GridManager(7, 5);
  grid.placeBelt(2, 1, Direction.Down);
  grid.placeBelt(1, 2, Direction.Right);
  const combiner = Machine.combiner({
    x: 2,
    y: 2,
    inputs: [Direction.Up, Direction.Left],
    output: Direction.Right,
    recipe: { inputs: ["ore", "plate"], output: "gear", ticks: 1 }
  });
  grid.placeMachine(combiner);
  grid.placeBelt(3, 2, Direction.Right);
  grid.tryInsertItemAt(2, 1, new Item("ore"), Direction.Down);
  grid.tryInsertItemAt(1, 2, new Item("plate"), Direction.Right);

  const loop = new GameLoop(grid);
  loop.step();
  loop.step();

  assert.equal(grid.getBelt(3, 2).item.type, "gear");
});

test("progression unlocks processor and combiner from delivered resources", () => {
  const progression = new Progression();
  assert.equal(progression.isUnlocked("processor"), false);

  progression.deliver("ore", 5);
  assert.equal(progression.isUnlocked("processor"), true);
  assert.equal(progression.isUnlocked("combiner"), false);

  progression.deliver("plate", 4);
  assert.equal(progression.isUnlocked("combiner"), true);
});
