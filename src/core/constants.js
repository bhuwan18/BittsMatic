export const Direction = Object.freeze({
  Up: "up",
  Down: "down",
  Left: "left",
  Right: "right"
});

export const TileKind = Object.freeze({
  Empty: "empty",
  Belt: "belt",
  Machine: "machine",
  Bridge: "bridge"
});

export const DIR_VECTORS = Object.freeze({
  [Direction.Up]: { x: 0, y: -1 },
  [Direction.Down]: { x: 0, y: 1 },
  [Direction.Left]: { x: -1, y: 0 },
  [Direction.Right]: { x: 1, y: 0 }
});

export const OPPOSITE = Object.freeze({
  [Direction.Up]: Direction.Down,
  [Direction.Down]: Direction.Up,
  [Direction.Left]: Direction.Right,
  [Direction.Right]: Direction.Left
});

export const DIRECTIONS = Object.freeze([
  Direction.Up,
  Direction.Right,
  Direction.Down,
  Direction.Left
]);

export function rotateDirection(direction) {
  const index = DIRECTIONS.indexOf(direction);
  return DIRECTIONS[(index + 1) % DIRECTIONS.length];
}

export function neighborOf(position, direction) {
  const vector = DIR_VECTORS[direction];
  return { x: position.x + vector.x, y: position.y + vector.y };
}

export function keyOf(x, y) {
  return `${x},${y}`;
}
