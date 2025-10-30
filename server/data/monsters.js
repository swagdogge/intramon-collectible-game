// server/data/monsters.js

// Base monsters
const baseMonsters = [
  { id: 1, name: "Voltadillo", element: "Electro", baseAttack: 55, baseDefense: 40, baseHp: 70, image: "/monsters/voltadillo.png" },
  { id: 2, name: "Aqualet", element: "Water", baseAttack: 45, baseDefense: 55, baseHp: 80, image: "/monsters/aqualet.png" },
  { id: 3, name: "Emberpup", element: "Fire", baseAttack: 65, baseDefense: 35, baseHp: 75, image: "/monsters/emberpup.png" },
  { id: 4, name: "Leafup", element: "Plant", baseAttack: 50, baseDefense: 60, baseHp: 85, image: "/monsters/leafup.png" },
  { id: 5, name: "Frostooth", element: "Ice", baseAttack: 40, baseDefense: 65, baseHp: 80, image: "/monsters/frostooth.png" },
  { id: 6, name: "Pebblit", element: "Ground", baseAttack: 35, baseDefense: 80, baseHp: 90, image: "/monsters/pebblit.png" }
];

// Rarity multipliers
const rarityStats = {
  Common: { mult: 1.0, chance: 0.75 },
  Rare: { mult: 1.2, chance: 0.20 },
  Epic: { mult: 1.4, chance: 0.05 }
};

// Generate all monsters with rarity variants
const monsters = [];
for (const base of baseMonsters) {
  for (const [rarity, { mult }] of Object.entries(rarityStats)) {
    monsters.push({
      id: `${base.id}-${rarity.toLowerCase()}`,
      baseId: base.id,
      name: base.name,
      element: base.element,
      rarity,
      attack: Math.round(base.baseAttack * mult),
      defense: Math.round(base.baseDefense * mult),
      hp: Math.round(base.baseHp * mult),
      image: base.image
    });
  }
}

// Random monster generator (returns minimal object for player storage)
function getRandomMonsterInstance() {
  // Pick rarity first (weighted)
  const r = Math.random();
  let rarity;
  if (r < rarityStats.Epic.chance) rarity = "Epic";
  else if (r < rarityStats.Epic.chance + rarityStats.Rare.chance) rarity = "Rare";
  else rarity = "Common";

  // Pick a monster of that rarity
  const pool = monsters.filter(m => m.rarity === rarity);
  const m = pool[Math.floor(Math.random() * pool.length)];

  // Return minimal info for player storage
  return {
    id: m.id,        // e.g., "1-common"
    rarity: m.rarity,
    attack: m.attack,
    defense: m.defense,
    hp: m.hp
  };
}

// Helper to merge stored monster with base info
function enrichMonster(minimal) {
  const base = monsters.find(m => m.id === minimal.id);
  return { ...base, ...minimal };
}

module.exports = { monsters, getRandomMonsterInstance, enrichMonster };
