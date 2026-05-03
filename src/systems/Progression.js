export class Progression {
  constructor() {
    this.resources = new Map();
    this.milestones = [
      { id: "processor", label: "Processor", requirements: { ore: 5 } },
      { id: "combiner", label: "Combiner", requirements: { plate: 4 } },
      { id: "fastGenerator", label: "Fast Generator", requirements: { gear: 3 } }
    ];
    this.unlocked = new Set(["belt", "generator", "core"]);
  }

  deliver(type, amount = 1) {
    this.resources.set(type, this.count(type) + amount);
    this.#updateUnlocks();
  }

  count(type) {
    return this.resources.get(type) ?? 0;
  }

  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  nextMilestones() {
    return this.milestones.map((milestone) => ({
      ...milestone,
      unlocked: this.isUnlocked(milestone.id),
      complete: Object.entries(milestone.requirements).every(([type, count]) => this.count(type) >= count)
    }));
  }

  #updateUnlocks() {
    for (const milestone of this.milestones) {
      const complete = Object.entries(milestone.requirements)
        .every(([type, count]) => this.count(type) >= count);
      if (complete) this.unlocked.add(milestone.id);
    }
  }
}
