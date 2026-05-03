export class MarkerManager {
  constructor() {
    this.markers = new Map();
  }

  add(x, y, text, color = "#ffe066") {
    this.markers.set(`${x},${y}`, { x, y, text, color });
  }

  remove(x, y) {
    this.markers.delete(`${x},${y}`);
  }

  getInRect(x, y, width, height) {
    const result = [];
    for (const marker of this.markers.values()) {
      if (marker.x >= x && marker.x < x + width && marker.y >= y && marker.y < y + height) {
        result.push(marker);
      }
    }
    return result;
  }

  all() {
    return [...this.markers.values()];
  }

  toSaveData() {
    return this.all();
  }

  restore(data) {
    this.markers.clear();
    if (!Array.isArray(data)) return;
    for (const { x, y, text, color } of data) {
      this.add(x, y, text, color);
    }
  }
}
