let nextItemId = 1;

export class Item {
  constructor(value, metadata = {}) {
    this.id = `item-${nextItemId++}`;
    this.type = "number";
    this.value = Number.isFinite(value) ? value : 0;
    this.label = formatNumber(this.value);
    this.metadata = { ...metadata };
    this.offset = 0;
    this.from = null;
    this.to = null;
  }

  cloneAs(value, metadata = {}) {
    return new Item(value, { ...this.metadata, ...metadata });
  }
}

function formatNumber(value) {
  if (Number.isInteger(value)) return value.toString();
  return Number(value.toFixed(3)).toString();
}
