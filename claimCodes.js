// claimCodes.js

async function getClaimCode(db, code) {
  const doc = await db.collection("claimCodes").doc(code.toUpperCase()).get();
  return doc.exists ? doc.data() : null;
}

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

async function createClaimCode(db, code, monster, expires) {
  const ref = db.collection("claimCodes").doc(code.toUpperCase());
  await ref.set({
    monster,
    expires,
    claimedBy: []
  });
}

module.exports = { getClaimCode, markCodeClaimed, createClaimCode };
