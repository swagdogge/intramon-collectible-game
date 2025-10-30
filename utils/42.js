const axios = require('axios');

/**
 * Fetch user's coalition info
 */
async function getUserCoalition(accessToken, userId) {
  const coalitions = await axios.get(`https://api.intra.42.fr/v2/users/${userId}/coalitions_users`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!coalitions.data.length) return null;

  const coalitionId = coalitions.data[0].coalition_id;
  const coalitionInfo = await axios.get(`https://api.intra.42.fr/v2/coalitions/${coalitionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return coalitionInfo.data; // contains name, color, bloc, etc.
}

/**
 * Compute crystals earned from logtime
 */
function computeCrystals(lastCheck, locations) {
  if (!locations.length) return 0;

  const lastDate = new Date(lastCheck || 0);
  const currentDate = new Date();
  let hours = 0;

  for (const loc of locations) {
    const begin = new Date(loc.begin_at);
    const end = new Date(loc.end_at || currentDate);

    // only count time after last check
    const effectiveBegin = begin > lastDate ? begin : lastDate;
    if (end > effectiveBegin) {
      hours += (end - effectiveBegin) / (1000 * 60 * 60); // milliseconds → hours
    }
  }

  return Math.floor(hours); // 1 crystal per hour (adjust later)
}

module.exports = { getUserCoalition, computeCrystals };
