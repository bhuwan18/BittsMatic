export class Progression {
  constructor({ saveData = null, onChange = null } = {}) {
    this.objectives = [
      { id: "make-1", target: 1 },
      { id: "make-2", target: 2 },
      { id: "make-3", target: 3 },
      { id: "make-4", target: 4 },
      { id: "make-8", target: 8 },
      { id: "make-16", target: 16 },
      { id: "make-32", target: 32 },
      { id: "make-64", target: 64 }
    ];
    this.resources = new Map();
    this.milestones = [
      { id: "multiply", label: "Multiply", requirements: { "10": 3 } },
      { id: "divide", label: "Divide", requirements: { "20": 1 } }
    ];
    this.unlocked = new Set(["belt", "source", "core", "add", "subtract", "multiply", "divide"]);
    this.currentLevel = 0;
    this.completedObjectives = [];
    this.wrongDeliveries = 0;
    this.lastDelivery = null;
    this.onChange = onChange;

    if (saveData) this.#restore(saveData);
    this.#updateUnlocks();
  }

  deliver(value, amount = 1) {
    const key = value.toString();
    this.resources.set(key, this.count(key) + amount);
    const objective = this.currentObjective();
    const matched = Boolean(objective && Number(value) === objective.target);
    let completedObjective = null;

    if (matched && objective && !objective.complete) {
      completedObjective = objective.id;
      this.completedObjectives.push(objective.id);
      this.currentLevel = Math.min(this.currentLevel + 1, this.objectives.length - 1);
    } else if (!matched) {
      this.wrongDeliveries += 1;
    }

    this.lastDelivery = {
      value,
      matched,
      target: objective?.target ?? null,
      completedObjective
    };
    this.#updateUnlocks();
    this.onChange?.(this);
    return {
      matched,
      completedObjective,
      nextObjective: this.currentObjective()
    };
  }

  currentObjective() {
    const objective = this.objectives[this.currentLevel] ?? this.objectives.at(-1);
    if (!objective) return null;
    return {
      ...objective,
      complete: this.completedObjectives.includes(objective.id)
    };
  }

  count(value) {
    return this.resources.get(value.toString()) ?? 0;
  }

  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  nextMilestones() {
    return this.milestones.map((milestone) => ({
      ...milestone,
      unlocked: this.isUnlocked(milestone.id),
      complete: Object.entries(milestone.requirements).every(([value, count]) => this.count(value) >= count)
    }));
  }

  #updateUnlocks() {
    for (const milestone of this.milestones) {
      const complete = Object.entries(milestone.requirements)
        .every(([value, count]) => this.count(value) >= count);
      if (complete) this.unlocked.add(milestone.id);
    }
  }

  toSaveData() {
    return {
      currentLevel: this.currentLevel,
      completedObjectives: [...this.completedObjectives],
      wrongDeliveries: this.wrongDeliveries,
      resources: Object.fromEntries(this.resources)
    };
  }

  #restore(saveData) {
    this.currentLevel = Number.isInteger(saveData.currentLevel) ? saveData.currentLevel : 0;
    this.currentLevel = Math.max(0, Math.min(this.currentLevel, this.objectives.length - 1));
    this.completedObjectives = Array.isArray(saveData.completedObjectives)
      ? saveData.completedObjectives.filter((id) => this.objectives.some((objective) => objective.id === id))
      : [];
    this.wrongDeliveries = Number.isInteger(saveData.wrongDeliveries) ? Math.max(0, saveData.wrongDeliveries) : 0;
    this.resources = new Map(Object.entries(saveData.resources ?? {}));
  }
}
