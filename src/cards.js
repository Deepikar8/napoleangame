// ============================================================
//  EMPIRE & COALITION — Card Decks
//  Flavor written for a player who knows the Age of Napoleon podcast
// ============================================================

export const ORDERS_CARDS = [
  {
    text: "The sun of Austerlitz rises through the morning fog. Your guns find their mark on the Pratzen Heights. Advance to Austerlitz — if you pass Mobilization, collect 200₣.",
    action: 'moveTo',
    target: 21,
    collect: true
  },
  {
    text: "Marshal Ney, the bravest of the brave, leads the rearguard in person. The army escapes intact. Advance 3 spaces.",
    action: 'moveBy',
    amount: 3
  },
  {
    text: "Davout holds the line at Auerstedt against three times his number — and wins the day alone. Collect 200₣ from a grateful Emperor.",
    action: 'gain',
    amount: 200
  },
  {
    text: "Your supply train is ambushed in the Sierra by Spanish guerrillas. The wounded must be cared for. Skip your next turn.",
    action: 'skip'
  },
  {
    text: "Murat's cavalry breaks the Russian squares at Eylau. Collect 150₣ from captured baggage — but war is hell, and the snow runs red.",
    action: 'gain',
    amount: 150
  },
  {
    text: "The Grande Armée crosses the Niemen. A million men march east. Pay 100₣ in supplies and forage — and pray.",
    action: 'pay',
    amount: 100
  },
  {
    text: "Lannes falls at Aspern-Essling, the first marshal lost in battle. Pay 75₣ for the funeral procession that brings him home.",
    action: 'pay',
    amount: 75
  },
  {
    text: "Massena, the Old Fox, outmaneuvers the Austrians once more. Collect 120₣ from territories he has secured for you.",
    action: 'gain',
    amount: 120
  },
  {
    text: "The Imperial Guard — never committed, never broken — marches to Paris in triumph. Advance directly to Paris. If you pass Mobilization, collect 200₣.",
    action: 'moveTo',
    target: 39,
    collect: true
  },
  {
    text: "The retreat from Moscow. Cossacks shadow your every step. Move back 3 spaces, and weep for the Grande Armée.",
    action: 'moveBy',
    amount: -3
  },
  {
    text: "Promotion in the field. The Emperor pins the eagle on your collar himself. You are made a Marshal of France. Collect 100₣.",
    action: 'gain',
    amount: 100
  },
  {
    text: "Logistics failure on the Spanish road. Your regiments demand back pay or they will not march. Pay 50₣ per Regiment you own.",
    action: 'payPerBuilding',
    amount: 50
  }
];

export const DIPLOMACY_CARDS = [
  {
    text: "The Treaty of Tilsit. You and the Tsar embrace on a raft in the middle of the Niemen. The world is divided between two empires. Collect 200₣.",
    action: 'gain',
    amount: 200
  },
  {
    text: "The Continental System bites deeper than any blockade. Smugglers, contraband, ruined merchants — pay 100₣ in lost trade.",
    action: 'pay',
    amount: 100
  },
  {
    text: "A friend at court. Caulaincourt himself intervenes on your behalf. Keep this card — play it to escape Exile at any time.",
    action: 'outOfExile'
  },
  {
    text: "The Confederation of the Rhine bows to you. Each rival pays you 50₣ in tribute, as a vassal must.",
    action: 'collectFromAll',
    amount: 50
  },
  {
    text: "A grand ball at the Tuileries. The crowned heads of Europe attend, eat your food, drink your wine, and laugh behind your back. Pay each rival 50₣.",
    action: 'payAll',
    amount: 50
  },
  {
    text: "The Bank of France issues new bonds, secured against territories not yet conquered. Collect 150₣. (Talleyrand smiles. He always smiles.)",
    action: 'gain',
    amount: 150
  },
  {
    text: "Josephine's intercession secures you a private audience. The Emperor is moved. Collect 100₣ from the Imperial Treasury.",
    action: 'gain',
    amount: 100
  },
  {
    text: "Insurance against the Royal Navy holds firm — your supply lines remain intact. Collect 50₣ for each Supply Line you own.",
    action: 'gainPerSupply',
    amount: 50
  },
  {
    text: "Your coronation is a triumph. The Pope is there. The crown is heavy. The bill is heavier. Pay 150₣ for the ceremony.",
    action: 'pay',
    amount: 150
  },
  {
    text: "Talleyrand has been selling your secrets to Vienna for years. The truth comes out. You are sent to Elba.",
    action: 'goToExile'
  },
  {
    text: "A seat on the Council of State. Your influence at court grows. Collect 100₣.",
    action: 'gain',
    amount: 100
  },
  {
    text: "Fouché's secret police uncover a plot — against you. Pay 75₣ to silence witnesses and have the conspirators quietly disappeared.",
    action: 'pay',
    amount: 75
  }
];
