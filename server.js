require('dotenv').config(); // Load env variables
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const axios = require('axios');
const qs = require('qs');
const admin = require('firebase-admin');
const path = require('path');

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
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post('https://api.intra.42.fr/oauth/token',
      qs.stringify({ grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri: REDIRECT_URI }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;
    req.session.accessToken = accessToken;

    const userRes = await axios.get('https://api.intra.42.fr/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const playerId = `42-${userRes.data.id}`;
    const playerName = userRes.data.login;
    req.session.playerId = playerId;
    req.session.username = playerName;

    // Fetch or create player
    const playerRef = db.collection('players').doc(playerId);
    const playerDoc = await playerRef.get();
    let playerData = playerDoc.exists ? playerDoc.data() : { name: playerName, monsters: [], grantedEvaluations: [] };

    // Grant monsters for new evaluations
    const evalRes = await axios.get(`https://api.intra.42.fr/v2/users/${userRes.data.id}/scale_teams/as_corrector`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    for (let e of evalRes.data) {
      if (playerData.grantedEvaluations.includes(e.id)) continue;
      const newMonster = getRandomMonster();
      playerData.monsters.push({ ...newMonster, instanceId: `${newMonster.id}-${Date.now()}-${Math.floor(Math.random()*10000)}` });
      playerData.grantedEvaluations.push(e.id);
    }

    await playerRef.set(playerData);
    res.redirect(`/index.html?userId=${userRes.data.id}`);

  } catch(err) {
    console.error('OAuth error:', err.response?.data || err.message);
    res.status(500).send('OAuth failed');
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

      fromData.monsters = fromData.monsters.filter(m => m.instanceId !== monster.instanceId);
      const toData = toDoc.data();
      toData.monsters.push(monster);

      t.update(fromRef, { monsters: fromData.monsters });
      t.update(toRef, { monsters: toData.monsters });

      const giftRef = db.collection('gifts').doc();
      t.set(giftRef, { from: fromPlayerId, to: toPlayerId, monster, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    });

    res.json({ message: 'Monster successfully gifted!' });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch gifts
app.get('/my-gifts', async (req,res) => {
  const playerId = req.session.playerId;
  if(!playerId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const snapshot = await db.collection('gifts')
      .where('to','==',playerId)
      .orderBy('timestamp','desc')
      .limit(10)
      .get();

    const gifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(gifts);
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete gift
app.delete('/gift/:giftId', async (req,res) => {
  const { giftId } = req.params;
  if(!giftId) return res.status(400).json({ error: 'Missing gift ID' });

  try {
    await db.collection('gifts').doc(giftId).delete();
    res.json({ message: 'Gift removed' });
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
