export class Belt {
  constructor(x, y, direction) {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.item = null;
    this.animationPhase = 0;
  }

  canAcceptItem() {
    return this.item === null;
  }

  insertItem(item, from, to) {
    if (this.item) return false;
    this.item = item;
    item.from = from;
    item.to = to ?? { x: this.x, y: this.y };
    item.progress = 0;
    return true;
  }

  removeItem() {
    const item = this.item;
    this.item = null;
    return item;
  }
}
