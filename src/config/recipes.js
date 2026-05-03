import { Machine } from "../entities/Machine.js";

export const TOOLS = Object.freeze([
  { id: "belt", label: "Belt", glyph: ">", hotkey: "1", unlock: "belt" },
  { id: "source", label: "Source 10", glyph: "10", hotkey: "2", unlock: "source" },
  { id: "add", label: "Add", glyph: "+", hotkey: "3", unlock: "add" },
  { id: "subtract", label: "Subtract", glyph: "-", hotkey: "4", unlock: "subtract" },
  { id: "multiply", label: "Multiply", glyph: "*", hotkey: "5", unlock: "multiply" },
  { id: "divide", label: "Divide", glyph: "/", hotkey: "6", unlock: "divide" },
  { id: "remove", label: "Remove", glyph: "X", hotkey: "7", unlock: "belt" },
  { id: "select", label: "Select", glyph: "[]", hotkey: "8", unlock: "belt" }
]);

export function createMachineForTool(tool, x, y, direction) {
  if (tool === "source") {
    return Machine.source({ x, y, output: direction, value: 10, interval: 2 });
  }

  if (["add", "subtract", "multiply", "divide"].includes(tool)) {
    return Machine.math({
      type: tool,
      x,
      y,
      output: direction,
      ticks: 2
    });
  }

  return null;
}
