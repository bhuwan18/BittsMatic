const WINDOW = 60;

export class StatsCollector {
  constructor() {
    this.production = new Map();  // machineId → ring buffer of production counts
    this.blocks = new Map();      // machineId → ring buffer of block counts
    this.tick = 0;
    this.coreItemsDelivered = 0;
    this.coreItemsRejected = 0;
  }

  recordProduction(machine) {
    this.#bump(this.production, machine.id);
  }

  recordBlock(machine) {
    this.#bump(this.blocks, machine.id);
  }

  recordCoreDelivery(matched) {
    if (matched) this.coreItemsDelivered++;
    else this.coreItemsRejected++;
  }

  advanceTick() {
    this.tick++;
  }

  throughputFor(machineId) {
    const buf = this.production.get(machineId);
    if (!buf) return 0;
    const sum = buf.reduce((a, b) => a + b, 0);
    return sum / WINDOW;
  }

  efficiencyFor(machineId) {
    const prod = this.production.get(machineId)?.reduce((a, b) => a + b, 0) ?? 0;
    const blocked = this.blocks.get(machineId)?.reduce((a, b) => a + b, 0) ?? 0;
    const total = prod + blocked;
    return total === 0 ? 0 : prod / total;
  }

  globalThroughput() {
    return this.coreItemsDelivered;
  }

  #bump(map, id) {
    if (!map.has(id)) map.set(id, new Array(WINDOW).fill(0));
    const buf = map.get(id);
    buf[this.tick % WINDOW] = (buf[this.tick % WINDOW] ?? 0) + 1;
  }
}
