const crypto = require('crypto');
const { monsters } = require('./data/monsters');

/**
 * Fetch a claim code document from Firestore
 */
async function getClaimCode(db, code) {
  const doc = await db.collection("claimCodes").doc(code.toUpperCase()).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Mark a code as claimed by a player
 */
async function markCodeClaimed(db, code, playerId) {
  const ref = db.collection("claimCodes").doc(code.toUpperCase());
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (!doc.exists) throw new Error("Code not found");

    const data = doc.data();
    data.claimedBy = data.claimedBy || [];

    if (data.claimedBy.includes(playerId))
      throw new Error("You already used this code");

    data.claimedBy.push(playerId);
    t.update(ref, { claimedBy: data.claimedBy });
  });
}

/**
 * Create a new claim code
 */
async function createClaimCode(db, code, monster, expires) {
  const ref = db.collection("claimCodes").doc(code.toUpperCase());
  await ref.set({
    monster,
    expires,
    claimedBy: []
  });
}

/**
 * Validate a code for a given player
 */
async function validateClaimCode(db, code, playerId) {
  if (!code) throw new Error("Missing code");
  if (!playerId) throw new Error("Not logged in");

  const entry = await getClaimCode(db, code);
  if (!entry) throw new Error("Invalid code");

  if (new Date() > new Date(entry.expires)) throw new Error("Code expired");
  if (entry.claimedBy?.includes(playerId)) throw new Error("You already used this code");

  return entry;
}

/**
 * Create a monster instance for a player inbox
 */
function createMonsterInstance(baseMonster, reason = "code") {
  return {
    id: baseMonster.id,
    rarity: baseMonster.rarity,
    attack: baseMonster.attack,
    defense: baseMonster.defense,
    hp: baseMonster.hp,
    instanceId: crypto.randomUUID(),
    reason
  };
}

/**
 * Create initial claim codes in Firestore
 */
async function createInitialClaimCodes(db) {
  try {
    const codesToCreate = [
      { code: "HELLOWORLD", monsterId: "3-rare", expires: "2025-11-05" },
      { code: "FOURTYTWO", monsterId: "4-rare", expires: "2025-11-05" }
    ];

    for (const entry of codesToCreate) {
      const ref = db.collection("claimCodes").doc(entry.code);
      const doc = await ref.get();

      if (!doc.exists) {
        const m = monsters.find(mon => mon.id === entry.monsterId);
        if (!m) {
          console.warn(`⚠️ Monster ID ${entry.monsterId} not found, skipping code ${entry.code}`);
          continue;
        }

        // Store minimal info in claim code (id + rarity)
        await createClaimCode(db, entry.code, { id: m.id, rarity: m.rarity }, entry.expires);
        console.log(`✅ Code ${entry.code} created for ${m.name} (${m.rarity})`);
      } else {
        console.log(`ℹ️ Code ${entry.code} already exists — skipping creation.`);
      }
    }
  } catch (err) {
    console.error("❌ Failed to create initial claim codes:", err);
  }
}

module.exports = {
  getClaimCode,
  markCodeClaimed,
  createClaimCode,
  validateClaimCode,
  createMonsterInstance,
  createInitialClaimCodes
};
