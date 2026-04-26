// ============================================================
//  COMMANDERS — Historical commanders with passive abilities
//  Four French, three Coalition. Asymmetric by design.
// ============================================================

export const COMMANDERS = [
  // ── French ──────────────────────────────────────────────
  {
    id: 'napoleon',
    name: 'Napoleon Bonaparte',
    title: 'The Emperor of the French',
    faction: 'french',
    monogram: 'N',
    bio: 'From Corsican lieutenant to master of Europe. Genius and tyrant in equal measure.',
    abilityName: 'Eagle of Victory',
    abilityText: 'Collect +50₣ whenever you acquire a Battle Territory (Austerlitz, Jena-Auerstedt, or Wagram).',
    ability: 'eagleOfVictory',
  },
  {
    id: 'davout',
    name: 'Marshal Davout',
    title: 'The Iron Marshal',
    faction: 'french',
    monogram: 'D',
    bio: 'Never lost a battle. The marshal Napoleon trusted with his life.',
    abilityName: 'Iron Discipline',
    abilityText: 'Rivals pay +25% rent on territories you own.',
    ability: 'ironDiscipline',
  },
  {
    id: 'murat',
    name: 'Marshal Murat',
    title: 'King of Naples',
    faction: 'french',
    monogram: 'M',
    bio: 'The most magnificent cavalryman in Europe. Vain, brave, doomed.',
    abilityName: 'Cavalry Charge',
    abilityText: 'When you roll doubles, also collect 75₣ (on the first and second doubles only — not the exile-triggering third).',
    ability: 'cavalryCharge',
  },
  {
    id: 'ney',
    name: 'Marshal Ney',
    title: 'The Bravest of the Brave',
    faction: 'french',
    monogram: 'Ne',
    bio: 'Hero of the rearguard at Berezina. Faced the firing squad without a blindfold.',
    abilityName: 'Rearguard Action',
    abilityText: 'When you would be sent to Exile, roll a die first. On a 5 or 6, you hold the line and stay where you are instead.',
    ability: 'rearguardAction',
  },

  // ── Coalition ────────────────────────────────────────────
  {
    id: 'wellington',
    name: 'Duke of Wellington',
    title: 'The Iron Duke',
    faction: 'coalition',
    monogram: 'W',
    bio: 'The man who never lost a battle he commanded. Patient, defensive, lethal.',
    abilityName: 'Defensive Genius',
    abilityText: 'You pay 25% less rent on all territories you do not own.',
    ability: 'defensiveGenius',
  },
  {
    id: 'alexander',
    name: 'Tsar Alexander I',
    title: 'Autocrat of All the Russias',
    faction: 'coalition',
    monogram: 'A',
    bio: "Napoleon's friend at Tilsit, his enemy at Moscow, his judge at Vienna.",
    abilityName: 'Scorched Earth',
    abilityText: 'Whenever any rival lands on a Russian (Green) territory you own, collect an additional 100₣ from the bank on top of normal rent.',
    ability: 'scorchedEarth',
  },
  {
    id: 'blucher',
    name: 'Marshal Blücher',
    title: 'Marshal Forward',
    faction: 'coalition',
    monogram: 'B',
    bio: "Old, half-mad, and absolutely relentless. The Prussian who wouldn't quit.",
    abilityName: 'Vorwärts!',
    abilityText: 'When leaving Exile by any means, immediately roll and move on the same turn instead of waiting for the next.',
    ability: 'vorwarts',
  },
];

/** Convenience lookup — returns null for unknown ids. */
export function getCommanderById(id) {
  return COMMANDERS.find(c => c.id === id) ?? null;
}
