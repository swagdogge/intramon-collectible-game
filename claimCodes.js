// claimCodes.js
export const claimCodes = {
  HELLOWORLD: {
    monster: {
      name: "Pumpking",
      rarity: "epic",
      element: "Fire",
      image: "/monsters/pumpking.png",
      hp: 180,
      attack: 120,
      defense: 90
    },
    expires: "2025-11-05",
    claimedBy: [] // store playerIds who have already used it
  },
  FOURTYTWO: {
    monster: {
      name: "Aqualyte",
      rarity: "rare",
      element: "Water",
      image: "/monsters/aqualyte.png",
      hp: 140,
      attack: 90,
      defense: 100
    },
    expires: "2100-12-01",
    claimedBy: []
  }
};

