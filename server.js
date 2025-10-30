require('dotenv').config(); // Load env variables
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const axios = require('axios');
const qs = require('qs');
const admin = require('firebase-admin');
const path = require('path');
const crypto = require('crypto');
const { monsters, getRandomMonsterInstance, enrichMonster } = require('./data/monsters');
const { getUserCoalition, computeCrystals } = require('./utils/42');


// ======================
// Firebase Setup
// ======================

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ======================
// Express Setup
// ======================

const app = express();
const PORT = process.env.PORT || 10000; // fallback just in case
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));


app.use(cors());
app.use(bodyParser.json());
app.set('trust proxy', 1); // Needed for secure cookies behind HTTPS proxy (like Render)

app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // only HTTPS in prod
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// ======================
// 42 OAuth Config
// ======================

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// ======================
// Routes
// ======================

// 42 OAuth login
app.get('/login', (req, res) => {
  const url = `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code`;
  res.redirect(url);
});


// ======================
// oautch callback
// ======================

app.get("/oauth/callback", async (req, res) => {
  const code = req.query.code;

  try {
    // 1️⃣ Exchange code for access token
    const tokenRes = await axios.post(
      "https://api.intra.42.fr/oauth/token",
      qs.stringify({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenRes.data.access_token;
    req.session.accessToken = accessToken;

    // 2️⃣ Fetch user info
    const userRes = await axios.get("https://api.intra.42.fr/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const playerId = `42-${userRes.data.id}`;
    const playerName = userRes.data.login;
    req.session.playerId = playerId;
    req.session.username = playerName;

    // 3️⃣ Fetch or create player data
    const playerRef = db.collection("players").doc(playerId);
    const playerDoc = await playerRef.get();

    let firstLogin = false;
    let playerData;

    if (!playerDoc.exists) {
      firstLogin = true;
      playerData = {
        name: playerName,
        monsters: [],
        inbox: [],
        grantedEvaluations: [],
        monsterCount: 0,
        crystals: 0,
        lastLogCheck: new Date().toISOString()
      };

      // 🎁 Give 3 welcome monsters
      for (let i = 0; i < 3; i++) {
        const randomMonster = getRandomMonsterInstance();
        playerData.inbox.push({
          id: randomMonster.id,
          rarity: randomMonster.rarity,
          attack: randomMonster.attack,
          defense: randomMonster.defense,
          hp: randomMonster.hp,
          instanceId: `${randomMonster.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          reason: "welcome"
        });
      }
    } else {
      playerData = playerDoc.data();
      // Ensure structure integrity
      playerData.monsters = playerData.monsters || [];
      playerData.inbox = playerData.inbox || [];
      playerData.grantedEvaluations = playerData.grantedEvaluations || [];
      playerData.crystals = playerData.crystals || 0;
      playerData.lastLogCheck = playerData.lastLogCheck || new Date().toISOString();

      if (typeof playerData.monsterCount !== "number") {
        playerData.monsterCount = playerData.monsters.length;
      }
    }

    // 4️⃣ Fetch coalition info
    try {
      const coalition = await getUserCoalition(accessToken, userRes.data.id);
      if (coalition) {
        playerData.coalitionId = coalition.id;
        playerData.coalitionName = coalition.name;
        playerData.coalitionColor = coalition.color;
      }
    } catch (err) {
      console.warn("⚠️ Coalition fetch failed:", err.message);
    }

    // 5️⃣ Grant monsters for new evaluations
    try {
      const evalRes = await axios.get(
        `https://api.intra.42.fr/v2/users/${userRes.data.id}/scale_teams/as_corrector`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      for (let e of evalRes.data) {
        if (playerData.grantedEvaluations.includes(e.id)) continue;

        playerData.grantedEvaluations.push(e.id);

        if (!firstLogin) {
          const newMonster = getRandomMonsterInstance();
          playerData.inbox.push({
            id: newMonster.id,
            rarity: newMonster.rarity,
            attack: newMonster.attack,
            defense: newMonster.defense,
            hp: newMonster.hp,
            instanceId: `${newMonster.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            reason: "eval"
          });
        }
      }
    } catch (err) {
      console.warn("⚠️ Evaluation fetch failed:", err.message);
    }

    // 6️⃣ Compute crystals from logtime
    try {
      const locationsRes = await axios.get(
        `https://api.intra.42.fr/v2/users/${userRes.data.id}/locations`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const crystalsEarned = computeCrystals(playerData.lastLogCheck, locationsRes.data || []);
      if (crystalsEarned > 0) {
        playerData.crystals += crystalsEarned;
        console.log(`💎 Awarded ${crystalsEarned} crystals to ${playerName}`);
      }
      playerData.lastLogCheck = new Date().toISOString();
    } catch (err) {
      console.warn("⚠️ Failed to compute crystals:", err.message);
    }

    // 7️⃣ Update monster count and save
    if (!firstLogin) {
      playerData.monsterCount = playerData.monsters.length;
    }

    await playerRef.set(playerData);
    console.log(`✅ ${playerName} logged in | Monsters: ${playerData.monsterCount} | Crystals: ${playerData.crystals}`);

    // 8️⃣ Redirect back to frontend
    res.redirect(`/index.html?userId=${userRes.data.id}`);
  } catch (err) {
    console.error("❌ OAuth callback error:", err.response?.data || err.message);
    res.status(500).send("OAuth failed. Check server logs.");
  }
});


// ======================
// my-monsters
// ======================
app.get('/my-monsters', async (req, res) => {
  const playerId = req.session.playerId;
  if (!playerId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const playerDoc = await db.collection('players').doc(playerId).get();
    if (!playerDoc.exists) return res.status(404).json({ error: 'Player not found' });

    const playerData = playerDoc.data();

    // Enrich monsters for frontend
    const enrichedMonsters = (playerData.monsters || []).map(enrichMonster);

    res.json({ ...playerData, monsters: enrichedMonsters });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ======================
// leaderboard
// ======================
app.get('/leaderboard', async (req, res) => {
  try {
    const snapshot = await db.collection('players').get();
    const leaderboard = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      // Ensure monsterCount exists
      if (typeof data.monsterCount !== 'number') {
        data.monsterCount = (data.monsters || []).length;
      }
      leaderboard.push({
        name: data.name,
        monsterCount: data.monsterCount
      });
    });

    // Sort descending by monsterCount
    leaderboard.sort((a, b) => b.monsterCount - a.monsterCount);

    res.json({ leaderboard });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});
// ======================
// gift
// ======================
app.post('/gift', async (req, res) => {
  const fromPlayerId = req.session.playerId;
  if (!fromPlayerId) return res.status(401).json({ error: 'Not logged in' });

  const { toPlayerId, offeredMonsters } = req.body;
  if (!toPlayerId || !offeredMonsters?.length) return res.status(400).json({ error: 'Invalid request' });

  try {
    const fromRef = db.collection('players').doc(fromPlayerId);
    const toRef = db.collection('players').doc(toPlayerId);

    await db.runTransaction(async t => {
      const [fromDoc, toDoc] = await Promise.all([t.get(fromRef), t.get(toRef)]);
      if (!fromDoc.exists || !toDoc.exists) throw new Error('Player not found');

      const monster = offeredMonsters[0];
      if (!monster.instanceId) throw new Error('Missing instanceId');

      const fromData = fromDoc.data();
      if (!fromData.monsters.some(m => m.instanceId === monster.instanceId)) throw new Error('Monster not owned');

      // Remove monster from sender
      fromData.monsters = fromData.monsters.filter(m => m.instanceId !== monster.instanceId);
      const frommonsterCount = fromData.monsters.length;

      // Add monster to recipient inbox (with reason)
      const toData = toDoc.data();
      toData.inbox = toData.inbox || [];
      toData.inbox.push({
        id: monster.id,
        rarity: monster.rarity,
        attack: monster.attack,
        defense: monster.defense,
        hp: monster.hp,
        instanceId: monster.instanceId,
        reason: 'gift'
      });

      // Update both docs
      t.update(fromRef, { monsters: fromData.monsters, monsterCount: frommonsterCount });
      t.update(toRef, { inbox: toData.inbox });
    });

    res.json({ message: 'Monster sent to inbox!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// ======================
// claim all
// ======================
app.post('/claim-all', async (req, res) => {
  const playerId = req.session.playerId;
  if (!playerId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const playerRef = db.collection('players').doc(playerId);
    await db.runTransaction(async t => {
      const doc = await t.get(playerRef);
      if (!doc.exists) throw new Error('Player not found');

      const data = doc.data();
      if (!data.inbox?.length) return;

      data.monsters = data.monsters || [];

      // Move all inbox monsters, keep only minimal info + reason removed since claimed
      const claimedMonsters = data.inbox.map(m => ({
        id: m.id,
        rarity: m.rarity,
        attack: m.attack,
        defense: m.defense,
        hp: m.hp,
        instanceId: m.instanceId
      }));

      data.monsters.push(...claimedMonsters);
      data.inbox = [];

      const monsterCount = data.monsters.length;
      t.update(playerRef, { inbox: data.inbox, monsters: data.monsters, monsterCount });
    });

    res.json({ message: 'All monsters claimed!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================
// Get player's inbox (enriched)
// ======================
app.get('/my-inbox', async (req, res) => {
  const playerId = req.session.playerId;
  if (!playerId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const playerRef = db.collection('players').doc(playerId);
    const playerDoc = await playerRef.get();
    if (!playerDoc.exists) return res.status(404).json({ error: 'Player not found' });

    const playerData = playerDoc.data();
    const inbox = (playerData.inbox || []).map(enrichMonster); // 🔹 Enrich monsters before sending

    res.json({ inbox, count: inbox.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

//CODES

const {
  getClaimCode,
  markCodeClaimed,
  validateClaimCode,
  createMonsterInstance,
  createInitialClaimCodes
} = require("./claimCodes.js");

app.post("/claim-code", async (req, res) => {
  const { code } = req.body;
  const playerId = req.session.playerId;

  try {
    const entry = await validateClaimCode(db, code, playerId);

    // Lookup the monster in your monsters array using the stored ID
    const m = monsters.find(mon => mon.id === entry.monster.id);
    if (!m) return res.status(500).json({ error: `Monster ID ${entry.monster.id} not found` });

    // Create monster instance for inbox
    const monster = createMonsterInstance(m, "code");

    // Add monster to player's inbox
    const playerRef = db.collection("players").doc(playerId);
    await db.runTransaction(async t => {
      const doc = await t.get(playerRef);
      if (!doc.exists) throw new Error("Player not found");

      const data = doc.data();
      data.inbox = data.inbox || [];
      data.inbox.push(monster);
      t.update(playerRef, { inbox: data.inbox });
    });

    // Mark code as claimed
    try {
      await markCodeClaimed(db, code, playerId);
    } catch (err) {
      console.warn(`⚠️ Failed to mark code ${code} as claimed:`, err.message);
    }

    res.json({ success: true, monster });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Call the async function
createInitialClaimCodes();


app.post('/claim/:instanceId', async (req, res) => {
  const playerId = req.session.playerId;
  if (!playerId) return res.status(401).json({ error: 'Not logged in' });

  const { instanceId } = req.params;
  try {
    const playerRef = db.collection('players').doc(playerId);

    await db.runTransaction(async t => {
      const doc = await t.get(playerRef);
      if (!doc.exists) throw new Error('Player not found');

      const data = doc.data();
      const monsterIndex = data.inbox?.findIndex(m => m.instanceId === instanceId);
      if (monsterIndex === -1) throw new Error('Monster not in inbox');

      const [monster] = data.inbox.splice(monsterIndex, 1);

      // Move only minimal info to monsters array
      const claimedMonster = {
        id: monster.id,
        rarity: monster.rarity,
        attack: monster.attack,
        defense: monster.defense,
        hp: monster.hp,
        instanceId: monster.instanceId
      };

      data.monsters = data.monsters || [];
      data.monsters.push(claimedMonster);

      const monsterCount = data.monsters.length;
      t.update(playerRef, { inbox: data.inbox, monsters: data.monsters, monsterCount });
    });

    res.json({ message: 'Monster claimed!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ======================
// Get player's coalition
// ======================
app.get("/my-coalition", async (req, res) => {
  const playerId = req.session.playerId;
  if (!playerId) return res.status(401).json({ error: "Not logged in" });

  try {
    const playerDoc = await db.collection("players").doc(playerId).get();
    if (!playerDoc.exists) return res.status(404).json({ error: "Player not found" });

    const data = playerDoc.data();
    res.json({
      coalitionId: data.coalitionId || null,
      coalitionName: data.coalitionName || "Unknown",
      coalitionColor: data.coalitionColor || "#888888"
    });
  } catch (err) {
    console.error("❌ Coalition fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================
// Get player's crystals
// ======================
app.get("/my-crystals", async (req, res) => {
  const playerId = req.session.playerId;
  if (!playerId) return res.status(401).json({ error: "Not logged in" });

  try {
    const playerDoc = await db.collection("players").doc(playerId).get();
    if (!playerDoc.exists) return res.status(404).json({ error: "Player not found" });

    const data = playerDoc.data();
    res.json({
      crystals: data.crystals || 0,
      lastLogCheck: data.lastLogCheck || null
    });
  } catch (err) {
    console.error("❌ Crystals fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================
// Improved: Claim crystals from logtime
// ======================
app.get("/refresh-logtime", async (req, res) => {
  const playerId = req.session.playerId;
  const accessToken = req.session.accessToken;

  if (!playerId || !accessToken) {
    return res.status(401).json({ error: "Not logged in or missing access token" });
  }

  try {
    const userRes = await axios.get("https://api.intra.42.fr/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userId = userRes.data.id;

    // 1️⃣ Fetch player data
    const playerRef = db.collection("players").doc(playerId);
    const playerDoc = await playerRef.get();
    if (!playerDoc.exists) return res.status(404).json({ error: "Player not found" });

    const playerData = playerDoc.data();
    playerData.lastLogCheckTime = playerData.lastLogCheckTime || 0;
    playerData.lastLogCheck = playerData.lastLogCheck || 0; // stores last known totalHours
    playerData.crystals = playerData.crystals || 0;

    // 2️⃣ Anti-spam cooldown: 1 refresh per hour
    const now = Date.now();
    if (now - playerData.lastLogCheckTime < 60 * 60 * 1000) {
      const mins = Math.ceil((60 * 60 * 1000 - (now - playerData.lastLogCheckTime)) / 60000);
      return res.json({
        success: false,
        message: `⏳ Please wait ${mins} more min before refreshing again.`
      });
    }

    // 3️⃣ Try to get total logtime hours
    let totalHours = 0;
    try {
      const statsRes = await axios.get(`https://api.intra.42.fr/v2/users/${userId}/locations_stats`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      totalHours = statsRes.data?.hours || 0;
    } catch {
      // Fallback: manually count recent logins (last 7 days)
      console.warn("⚠️ Fallback: using recent locations data for logtime");
      const locRes = await axios.get(`https://api.intra.42.fr/v2/users/${userId}/locations`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { per_page: 100 }
      });

      const locations = locRes.data || [];
      totalHours = locations.reduce((sum, l) => {
        if (l.end_at && l.begin_at) {
          const diff = (new Date(l.end_at) - new Date(l.begin_at)) / (1000 * 60 * 60);
          return sum + Math.max(diff, 0);
        }
        return sum;
      }, 0);
    }

    // 4️⃣ Calculate new hours since last check
    const prevHours = playerData.lastLogCheck || 0;
    const hoursGained = totalHours - prevHours;

    if (hoursGained <= 0) {
      await playerRef.update({ lastLogCheckTime: now });
      return res.json({
        success: true,
        crystalsEarned: 0,
        message: "No new logtime since your last check."
      });
    }

    // 5️⃣ Compute rewards
    const REWARD_RATE = 10; // 10 crystals per hour
    const crystalsEarned = Math.floor(hoursGained * REWARD_RATE);
    playerData.crystals += crystalsEarned;

    // 6️⃣ Save back to Firestore
    await playerRef.update({
      crystals: playerData.crystals,
      lastLogCheck: totalHours,
      lastLogCheckTime: now
    });

    console.log(`💎 ${playerData.name} earned ${crystalsEarned} crystals (${hoursGained.toFixed(2)}h logged)`);

    res.json({
      success: true,
      crystalsEarned,
      totalCrystals: playerData.crystals,
      hoursGained: hoursGained.toFixed(2),
      message: `You earned ${crystalsEarned} crystals for ${hoursGained.toFixed(2)} new hours!`
    });
  } catch (err) {
    console.error("❌ Error refreshing logtime:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to refresh logtime" });
  }
});



// Find user by username
app.get('/find-user/:username', async (req,res) => {
  const username = req.params.username;
  try {
    const snapshot = await db.collection('players').where('name','==',username).get();
    if(snapshot.empty) return res.json({ exists:false });

    const playerDoc = snapshot.docs[0];
    res.json({ exists:true, playerId: playerDoc.id });
  } catch(err) {
    console.error(err);
    res.status(500).json({ exists:false, error: err.message });
  }
});


