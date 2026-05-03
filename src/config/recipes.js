import { Machine } from "../entities/Machine.js";
import { rotateDirection } from "../core/constants.js";

export const TOOLS = Object.freeze([
  { id: "belt", label: "Belt", glyph: ">", hotkey: "1", unlock: "belt" },
  { id: "extractor", label: "Extractor", glyph: "⛏", hotkey: "2", unlock: "extractor" },
  { id: "add", label: "Add", glyph: "+", hotkey: "3", unlock: "add" },
  { id: "subtract", label: "Subtract", glyph: "-", hotkey: "4", unlock: "subtract" },
  { id: "multiply", label: "Multiply", glyph: "*", hotkey: "5", unlock: "multiply" },
  { id: "divide", label: "Divide", glyph: "/", hotkey: "6", unlock: "divide" },
  { id: "storage", label: "Storage", glyph: "[]", hotkey: "0", unlock: "storage" },
  { id: "exponentiate", label: "Power", glyph: "A^B", hotkey: "9", unlock: "exponentiate" },
  { id: "remove", label: "Remove", glyph: "X", hotkey: "7", unlock: "belt" },
  { id: "select", label: "Select", glyph: "[]", hotkey: "8", unlock: "belt" }
]);

export function createMachineForTool(tool, x, y, direction) {
  if (tool === "source") {
    return Machine.source({ x, y, output: direction, value: 10, interval: 2 });
  }

  if (tool === "extractor") {
    return Machine.extractor({ x, y, output: direction, nodeValue: 1, interval: 2 });
  }

  if (tool === "divide") {
    return Machine.math({
      type: "divide",
      x,
      y,
      output: direction,
      secondaryOutput: rotateDirection(direction),
      ticks: 2
    });
  }

  if (["add", "subtract", "multiply", "exponentiate"].includes(tool)) {
    return Machine.math({
      type: tool,
      x,
      y,
      output: direction,
      ticks: 2
    });
  }

  if (tool === "storage") {
    return Machine.storage({ x, y, output: direction });
  }

  return null;
}
