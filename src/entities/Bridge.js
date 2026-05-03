export class BridgeLayer {
  constructor(bridge, direction) {
    this.bridge = bridge;
    this.x = bridge.x;
    this.y = bridge.y;
    this.direction = direction;
    this.speed = 1;
    this.item = null;
    this.animationPhase = 0;
    this.priority = null;
    // Unique key identifying this specific layer (used for per-layer conflict resolution)
    this.layerKey = `${bridge.x},${bridge.y}:${direction}`;
  }

  canAcceptItem() {
    return this.item === null;
  }

  insertItem(item, from, to) {
    if (this.item) return false;
    this.item = item;
    item.from = from;
    item.to = to ?? { x: this.x, y: this.y };
    item.offset = 0;
    return true;
  }

  removeItem() {
    const item = this.item;
    this.item = null;
    return item;
  }
}

export class Bridge {
  constructor(x, y, primaryDir, crossDir) {
    this.x = x;
    this.y = y;
    this.primaryDir = primaryDir;
    this.crossDir = crossDir;
    this.layers = [
      new BridgeLayer(this, primaryDir),
      new BridgeLayer(this, crossDir)
    ];
  }

  // Returns the layer that accepts items traveling in `direction` (e.g. Right → right-flowing layer).
  layerFor(direction) {
    if (direction === this.primaryDir) return this.layers[0];
    if (direction === this.crossDir) return this.layers[1];
    return null;
  }
}
