// Level-gated machine unlocks matching Beltmatic's progression curve
const LEVEL_UNLOCKS = {
  1: ["add", "subtract"],
  4: ["multiply"],
  10: ["divide"],
  13: ["bridge"],
  19: ["exponentiate"],
  22: ["storage"]
};

const UPGRADE_DEFS = {
  "extractor-speed": { label: "Extractor Speed", requiredLevel: 5, tiers: [10, 30, 75] },
  "belt-speed":      { label: "Belt Speed",       requiredLevel: 10, tiers: [15, 50, 120] }
};
const BELT_SPEED_MULTIPLIERS     = [2, 2.5, 3, 4];
const EXTRACTOR_SPEED_MULTIPLIERS = [1, 1.5, 2, 2.5];

// Base target sequence — randomized ±20% per playthrough using mapSeed
const BASE_TARGETS = [
  1, 2, 3, 4, 5, 7, 9, 12, 16, 20,
  25, 32, 40, 50, 64, 80, 100, 128, 160, 200,
  256, 320, 400, 512, 625, 729, 900, 1024, 1296, 2048
];

function seededRand(seed, index) {
  let s = (seed ^ (index * 2654435761)) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  return (s >>> 0) / 4294967296;
}

function buildObjectives(mapSeed) {
  return BASE_TARGETS.map((base, i) => {
    const r = mapSeed ? seededRand(mapSeed, i) : 0.5;
    const variance = Math.round(base * 0.2 * (r - 0.5) * 2);
    const target = Math.max(1, base + variance);
    return { id: `level-${i + 1}`, level: i + 1, target };
  });
}

export class Progression {
  constructor({ saveData = null, onChange = null } = {}) {
    this.resources = new Map();
    this.currentLevel = 0;
    this.completedObjectives = [];
    this.wrongDeliveries = 0;
    this.lastDelivery = null;
    this.mapSeed = null;
    this.upgradePoints = 0;
    this.purchasedUpgrades = {};
    this.onChange = onChange;
    this.unlocked = new Set(["belt", "source", "extractor", "core"]);

    if (saveData) this.#restore(saveData);

    this.objectives = buildObjectives(this.mapSeed);
    this.#applyLevelUnlocks();
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
      const next = this.currentLevel + 1;
      this.currentLevel = Math.min(next, this.objectives.length - 1);
      this.#applyLevelUnlocks();
    } else if (!matched) {
      this.wrongDeliveries += 1;
    }
    if (matched) this.upgradePoints += 1;

    this.lastDelivery = {
      value,
      matched,
      target: objective?.target ?? null,
      completedObjective
    };
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

  // Kept for UI backward compat — returns unlock progress as milestone-like objects
  nextMilestones() {
    return Object.entries(LEVEL_UNLOCKS).map(([level, ids]) => ({
      id: ids[0],
      label: ids.map((id) => id.charAt(0).toUpperCase() + id.slice(1)).join(", "),
      unlocked: ids.every((id) => this.isUnlocked(id)),
      requiredLevel: Number(level)
    }));
  }

  get beltSpeedMultiplier() {
    const tier = this.purchasedUpgrades["belt-speed"] ?? 0;
    return BELT_SPEED_MULTIPLIERS[Math.min(tier, BELT_SPEED_MULTIPLIERS.length - 1)];
  }

  get extractorSpeedMultiplier() {
    const tier = this.purchasedUpgrades["extractor-speed"] ?? 0;
    return EXTRACTOR_SPEED_MULTIPLIERS[Math.min(tier, EXTRACTOR_SPEED_MULTIPLIERS.length - 1)];
  }

  buyUpgrade(id) {
    const def = UPGRADE_DEFS[id];
    if (!def) return false;
    const tier = this.purchasedUpgrades[id] ?? 0;
    if (tier >= def.tiers.length) return false;
    if (this.currentLevel < def.requiredLevel - 1) return false;
    const cost = def.tiers[tier];
    if (this.upgradePoints < cost) return false;
    this.upgradePoints -= cost;
    this.purchasedUpgrades[id] = tier + 1;
    this.onChange?.(this);
    return true;
  }

  availableUpgrades() {
    return Object.entries(UPGRADE_DEFS).map(([id, def]) => {
      const tier = this.purchasedUpgrades[id] ?? 0;
      const unlocked = this.currentLevel >= def.requiredLevel - 1;
      const maxed = tier >= def.tiers.length;
      const cost = maxed ? null : def.tiers[tier];
      const canAfford = cost !== null && this.upgradePoints >= cost;
      return { id, label: def.label, tier, maxTier: def.tiers.length, cost, canAfford, unlocked, maxed, requiredLevel: def.requiredLevel };
    });
  }

  toSaveData() {
    return {
      version: 2,
      currentLevel: this.currentLevel,
      completedObjectives: [...this.completedObjectives],
      wrongDeliveries: this.wrongDeliveries,
      resources: Object.fromEntries(this.resources),
      mapSeed: this.mapSeed,
      upgradePoints: this.upgradePoints,
      purchasedUpgrades: { ...this.purchasedUpgrades }
    };
  }

  #applyLevelUnlocks() {
    for (const [level, ids] of Object.entries(LEVEL_UNLOCKS)) {
      if (this.currentLevel >= Number(level) - 1) {
        for (const id of ids) this.unlocked.add(id);
      }
    }
  }

  #restore(saveData) {
    const maxLevel = BASE_TARGETS.length - 1;
    this.currentLevel = Number.isInteger(saveData.currentLevel)
      ? Math.max(0, Math.min(saveData.currentLevel, maxLevel))
      : 0;
    this.completedObjectives = Array.isArray(saveData.completedObjectives)
      ? saveData.completedObjectives
      : [];
    this.wrongDeliveries = Number.isInteger(saveData.wrongDeliveries)
      ? Math.max(0, saveData.wrongDeliveries)
      : 0;
    this.resources = new Map(Object.entries(saveData.resources ?? {}));
    this.mapSeed = Number.isInteger(saveData.mapSeed) ? saveData.mapSeed : null;
    this.upgradePoints = Number.isInteger(saveData.upgradePoints) ? Math.max(0, saveData.upgradePoints) : 0;
    this.purchasedUpgrades = (typeof saveData.purchasedUpgrades === "object" && saveData.purchasedUpgrades)
      ? { ...saveData.purchasedUpgrades }
      : {};
  }
}
