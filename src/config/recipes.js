import { Direction } from "../core/constants.js";
import { Machine } from "../entities/Machine.js";

export const ITEM_COLORS = Object.freeze({
  ore: "#56b6c2",
  plate: "#f2c14e",
  gear: "#ef6f6c"
});

export const TOOLS = Object.freeze([
  { id: "belt", label: "Belt", glyph: "→", hotkey: "1", unlock: "belt" },
  { id: "generator", label: "Generator", glyph: "G", hotkey: "2", unlock: "generator" },
  { id: "processor", label: "Processor", glyph: "P", hotkey: "3", unlock: "processor" },
  { id: "combiner", label: "Combiner", glyph: "C", hotkey: "4", unlock: "combiner" },
  { id: "remove", label: "Remove", glyph: "×", hotkey: "5", unlock: "belt" }
]);

export function createMachineForTool(tool, x, y, direction, progression) {
  if (tool === "generator") {
    return Machine.generator({
      x,
      y,
      output: direction,
      itemType: "ore",
      interval: progression.isUnlocked("fastGenerator") ? 1 : 2
    });
  }

  if (tool === "processor") {
    return Machine.processor({
      x,
      y,
      input: opposite(direction),
      output: direction,
      recipe: { inputs: ["ore"], output: "plate", ticks: 3 }
    });
  }

  if (tool === "combiner") {
    return Machine.combiner({
      x,
      y,
      inputs: combinerInputs(direction),
      output: direction,
      recipe: { inputs: ["ore", "plate"], output: "gear", ticks: 4 }
    });
  }

  return null;
}

function opposite(direction) {
  return {
    [Direction.Up]: Direction.Down,
    [Direction.Down]: Direction.Up,
    [Direction.Left]: Direction.Right,
    [Direction.Right]: Direction.Left
  }[direction];
}

function combinerInputs(direction) {
  if (direction === Direction.Right) return [Direction.Left, Direction.Up];
  if (direction === Direction.Left) return [Direction.Right, Direction.Down];
  if (direction === Direction.Up) return [Direction.Down, Direction.Left];
  return [Direction.Up, Direction.Right];
}
