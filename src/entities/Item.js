let nextItemId = 1;

export class Item {
  constructor(type, metadata = {}) {
    this.id = `item-${nextItemId++}`;
    this.type = type;
    this.metadata = { ...metadata };
    this.progress = 0;
    this.from = null;
    this.to = null;
  }

  cloneAs(type, metadata = {}) {
    return new Item(type, { ...this.metadata, ...metadata });
  }
}
