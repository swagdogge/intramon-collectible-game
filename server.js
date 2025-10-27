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
// Monsters
// ======================

const monsters = [
  // Electro
  { id: 1, name: "Zyprat", element: "Electro", rarity: "Common", attack: 45, defense: 30, hp: 60, image: "/monsters/zyprat.png", weight: 70 },
  { id: 2, name: "Ampfin", element: "Electro", rarity: "Common", attack: 35, defense: 40, hp: 65, image: "/monsters/ampfin.png", weight: 70 },
  { id: 3, name: "Voltadillp", element: "Electro", rarity: "Common", attack: 55, defense: 50, hp: 80, image: "/monsters/voltadillp.png", weight: 70 },
  { id: 4, name: "Sparklemoth", element: "Electro", rarity: "Common", attack: 70, defense: 45, hp: 75, image: "/monsters/sparklemoth.png", weight: 70 },

  // Water
  { id: 5, name: "Droplet", element: "Water", rarity: "Common", attack: 90, defense: 70, hp: 100, image: "/monsters/droplet.png", weight: 70 },
  { id: 6, name: "Aquabud", element: "Water", rarity: "Common", attack: 45, defense: 30, hp: 60, image: "/monsters/aquabud.png", weight: 70 },
  { id: 7, name: "Coralume", element: "Water", rarity: "Common", attack: 35, defense: 40, hp: 65, image: "/monsters/coralume.png", weight: 70 },
  { id: 8, name: "Marishade", element: "Water", rarity: "Common", attack: 55, defense: 50, hp: 80, image: "/monsters/marishade.png", weight: 70 },

  // Fire
  { id: 9, name: "Emberpup", element: "Fire", rarity: "Common", attack: 70, defense: 45, hp: 75, image: "/monsters/emberpup.png", weight: 70 },
  { id: 10, name: "Moltenewt", element: "Fire", rarity: "Common", attack: 90, defense: 70, hp: 100, image: "/monsters/moltenewt.png", weight: 70 },
  { id: 11, name: "Pyroo", element: "Fire", rarity: "Common", attack: 45, defense: 30, hp: 60, image: "/monsters/pyroo.png", weight: 70 },
  { id: 12, name: "Cindrill", element: "Fire", rarity: "Common", attack: 35, defense: 40, hp: 65, image: "/monsters/cindrill.png", weight: 70 },

  // Ice
  { id: 13, name: "Frostooth", element: "Ice", rarity: "Common", attack: 55, defense: 50, hp: 80, image: "/monsters/frostooth.png", weight: 70 },
  { id: 14, name: "Glacirub", element: "Ice", rarity: "Common", attack: 70, defense: 45, hp: 75, image: "/monsters/glacirub.png", weight: 70 },
  { id: 15, name: "Cryobot", element: "Ice", rarity: "Common", attack: 90, defense: 70, hp: 100, image: "/monsters/cryobot.png", weight: 70 },
  { id: 16, name: "Snowpuff", element: "Ice", rarity: "Common", attack: 45, defense: 30, hp: 60, image: "/monsters/snowpuff.png", weight: 70 },

  // Plant
  { id: 17, name: "Budbun", element: "Plant", rarity: "Common", attack: 35, defense: 40, hp: 65, image: "/monsters/budbun.png", weight: 70 },
  { id: 18, name: "Leafup", element: "Plant", rarity: "Common", attack: 55, defense: 50, hp: 80, image: "/monsters/leafup.png", weight: 70 },
  { id: 19, name: "Spineapple", element: "Plant", rarity: "Common", attack: 70, defense: 45, hp: 75, image: "/monsters/spineapple.png", weight: 70 },
  { id: 20, name: "Vinemite", element: "Plant", rarity: "Common", attack: 90, defense: 70, hp: 100, image: "/monsters/vinemite.png", weight: 70 },

  // Ground
  { id: 21, name: "Terrabug", element: "Ground", rarity: "Common", attack: 45, defense: 30, hp: 60, image: "/monsters/terrabug.png", weight: 70 },
  { id: 22, name: "Rockling", element: "Ground", rarity: "Common", attack: 35, defense: 40, hp: 65, image: "/monsters/rockling.png", weight: 70 },
  { id: 23, name: "Mudpaw", element: "Ground", rarity: "Common", attack: 55, defense: 50, hp: 80, image: "/monsters/mudpaw.png", weight: 70 },
  { id: 24, name: "Stonetail", element: "Ground", rarity: "Common", attack: 70, defense: 45, hp: 75, image: "/monsters/stonetail.png", weight: 70 },
];


function getRandomMonster() {
  const totalWeight = monsters.reduce((sum, m) => sum + m.weight, 0);
  const rand = Math.random() * totalWeight;
  let cumulative = 0;
  for (const m of monsters) {
    cumulative += m.weight;
    if (rand <= cumulative) return m;
  }
}

// ======================
// Routes
// ======================

// 42 OAuth login
app.get('/login', (req, res) => {
  const url = `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code`;
  res.redirect(url);
});

// OAuth callback
// OAuth callback

// OAuth callback

// OAuth callback
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;

  try {
    // 1️⃣ Exchange code for access token
    const tokenRes = await axios.post(
      'https://api.intra.42.fr/oauth/token',
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;
    req.session.accessToken = accessToken;

    // 2️⃣ Fetch user info
    const userRes = await axios.get('https://api.intra.42.fr/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const playerId = `42-${userRes.data.id}`;
    const playerName = userRes.data.login;
    req.session.playerId = playerId;
    req.session.username = playerName;

    // 3️⃣ Fetch or create player data
    const playerRef = db.collection('players').doc(playerId);
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
        monsterCount: 0
      };

      // Give 3 welcome monsters
      for (let i = 0; i < 3; i++) {
        const randomMonster = getRandomMonster();
        playerData.inbox.push({
          ...randomMonster,
          instanceId: `${randomMonster.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          reason: 'welcome'
        });
      }
    } else {
      playerData = playerDoc.data();

      // Ensure arrays and monsterCount exist
      playerData.monsters = playerData.monsters || [];
      playerData.inbox = playerData.inbox || [];
      playerData.grantedEvaluations = playerData.grantedEvaluations || [];
      if (typeof playerData.monsterCount !== 'number') {
        playerData.monsterCount = playerData.monsters.length;
      }
    }

    // 4️⃣ Grant monsters for new evaluations
    const evalRes = await axios.get(
      `https://api.intra.42.fr/v2/users/${userRes.data.id}/scale_teams/as_corrector`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    for (let e of evalRes.data) {
      if (playerData.grantedEvaluations.includes(e.id)) continue;

      playerData.grantedEvaluations.push(e.id);

      if (!firstLogin) {
        const newMonster = getRandomMonster();
        playerData.inbox.push({
          ...newMonster,
          instanceId: `${newMonster.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          reason: 'eval'
        });
      }
    }

    // 5️⃣ Update monsterCount manually for old players on first login
    if (!firstLogin) {
      playerData.monsterCount = playerData.monsters.length;
    }

    // 6️⃣ Save player data back to Firestore
    await playerRef.set(playerData);

    console.log(`Player ${playerName} logged in. Monster count: ${playerData.monsterCount}`);

    // 7️⃣ Redirect to frontend
    res.redirect(`/index.html?userId=${userRes.data.id}`);
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.status(500).send('OAuth failed. Check server logs.');
  }
});




// Get player's monsters
app.get('/my-monsters', async (req, res) => {
  const playerId = req.session.playerId;
  if (!playerId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const playerRef = db.collection('players').doc(playerId);
    const playerDoc = await playerRef.get();
    if (!playerDoc.exists) return res.status(404).json({ error: 'Player not found' });

    res.json(playerDoc.data());
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

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



// Gift monster
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
      const fromMonstersCount = fromData.monsters.length;

      // Add monster to recipient inbox
      const toData = toDoc.data();
      toData.inbox = toData.inbox || [];
      toData.inbox.push({ ...monster, reason: 'gift' });

      // Update both docs
      t.update(fromRef, { monsters: fromData.monsters, monstersCount: fromMonstersCount });
      t.update(toRef, { inbox: toData.inbox });
    });

    res.json({ message: 'Monster sent to inbox!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// Claim all monsters in inbox
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
      data.monsters.push(...data.inbox); // move all inbox monsters
      data.inbox = [];

      // Update monstersCount
      const monstersCount = data.monsters.length;

      t.update(playerRef, { inbox: data.inbox, monsters: data.monsters, monstersCount });
    });

    res.json({ message: 'All monsters claimed!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.get('/my-inbox', async (req, res) => {
  const playerId = req.session.playerId;
  if(!playerId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const playerRef = db.collection('players').doc(playerId);
    const playerDoc = await playerRef.get();
    if(!playerDoc.exists) return res.status(404).json({ error: 'Player not found' });

    const playerData = playerDoc.data();
    const inbox = playerData.inbox || [];
    res.json({ inbox, count: inbox.length });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


//CODES

const { getClaimCode, markCodeClaimed, createClaimCode } = require("./claimCodes.js");


app.post("/claim-code", async (req, res) => {
  const { code } = req.body;
  const playerId = req.session.playerId;

  if (!playerId) return res.status(401).json({ error: "Not logged in" });
  if (!code) return res.status(400).json({ error: "Missing code" });

  try {
    const entry = await getClaimCode(db, code);
    if (!entry) return res.status(400).json({ error: "Invalid code" });
    if (new Date() > new Date(entry.expires))
      return res.status(400).json({ error: "Code expired" });

    // Check if already claimed
    if (entry.claimedBy?.includes(playerId))
      return res.status(400).json({ error: "You already used this code" });

    // Create monster instance
    const monster = {
      ...entry.monster,
      instanceId: crypto.randomUUID(),
      reason: "code"
    };

    // Add monster to player's inbox
    const playerRef = db.collection("players").doc(playerId);
    await db.runTransaction(async (t) => {
      const doc = await t.get(playerRef);
      if (!doc.exists) throw new Error("Player not found");

      const data = doc.data();
      data.inbox = data.inbox || [];
      data.inbox.push(monster);
      t.update(playerRef, { inbox: data.inbox });
    });

    // Mark code as claimed (warn if fails but don’t block)
    try {
      await markCodeClaimed(db, code, playerId);
    } catch (err) {
      console.warn(`⚠️ Failed to mark code ${code} as claimed:`, err.message);
    }

    // ✅ Return the monster so frontend can display it
    res.json({ success: true, monster });
  } catch (err) {
    console.error("Error redeeming code:", err);
    res.status(500).json({ error: err.message });
  }
});


// ======================
// INITIAL CLAIM CODES SETUP
// ======================
async function createInitialClaimCodes() {
  try {
    const codesToCreate = [
      {
        code: "HELLOWORLD",
        monster: {
          id: 13,
          name: "Frostooth",
          element: "Ice",
          rarity: "Rare",
          attack: 55,
          defense: 50,
          hp: 80,
          image: "/monsters/frostooth.png"
        },
        expires: "2025-11-05"
      },
      {
        code: "FOURTYTWO",
        monster: {
          id: 18,
          name: "Leafup",
          element: "Plant",
          rarity: "Rare",
          attack: 55,
          defense: 50,
          hp: 80,
          image: "/monsters/leafup.png"
        },
        expires: "2025-11-05"
      }
    ];

    for (const entry of codesToCreate) {
      const ref = db.collection("claimCodes").doc(entry.code);
      const doc = await ref.get();
      if (!doc.exists) {
        await createClaimCode(db, entry.code, entry.monster, entry.expires);
        console.log(`✅ Code ${entry.code} created in Firestore`);
      } else {
        console.log(`ℹ️ Code ${entry.code} already exists — skipping creation.`);
      }
    }
  } catch (err) {
    console.error("❌ Failed to create initial claim codes:", err);
  }
}

// Call the async function
createInitialClaimCodes();



//claim

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
      data.monsters = data.monsters || [];
      data.monsters.push(monster);

      // Update monstersCount
      const monstersCount = data.monsters.length;

      t.update(playerRef, { inbox: data.inbox, monsters: data.monsters, monstersCount });
    });

    res.json({ message: 'Monster claimed!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



//inbox

app.get('/my-inbox', async (req, res) => {
  const playerId = req.session.playerId;
  if(!playerId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const playerRef = db.collection('players').doc(playerId);
    const playerDoc = await playerRef.get();
    if(!playerDoc.exists) return res.status(404).json({ error: 'Player not found' });

    const playerData = playerDoc.data();
    res.json({ inbox: playerData.inbox || [] });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
