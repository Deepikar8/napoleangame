// ============================================================
//  CARDS — Orders and Diplomacy card decks
// ============================================================

export const ORDERS_CARDS = [
  { text: 'Advance to Paris. If you pass Mobilization, collect 200₣.',    action: 'moveTo',         target: 39, collect: true },
  { text: 'Advance to Austerlitz. Glory awaits.',                          action: 'moveTo',         target: 21, collect: true },
  { text: 'Forced march. Advance 3 spaces.',                               action: 'moveBy',         amount: 3 },
  { text: 'Plunder enemy stores. Collect 150₣.',                           action: 'gain',           amount: 150 },
  { text: 'Pay tribute to your marshals. Lose 100₣.',                      action: 'pay',            amount: 100 },
  { text: 'Skip your next turn — your army winters in camp.',              action: 'skip' },
  { text: 'Brilliant maneuver! Collect 200₣ from the treasury.',           action: 'gain',           amount: 200 },
  { text: 'Retreat. Move back 3 spaces.',                                  action: 'moveBy',         amount: -3 },
  { text: 'Promoted to Marshal. Collect 100₣.',                            action: 'gain',           amount: 100 },
  { text: 'Logistics failure. Pay 50₣ per Regiment you own.',              action: 'payPerBuilding', amount: 50 },
  { text: 'Field hospital expenses. Pay 75₣.',                             action: 'pay',            amount: 75 },
  { text: 'Captured artillery. Collect 120₣.',                             action: 'gain',           amount: 120 },
];

export const DIPLOMACY_CARDS = [
  { text: 'Treaty of Tilsit. Collect 200₣.',                               action: 'gain',           amount: 200 },
  { text: 'War reparations levied against you. Pay 100₣.',                 action: 'pay',            amount: 100 },
  { text: 'Get out of Exile free — keep this card.',                        action: 'outOfExile' },
  { text: 'Each rival pays you 50₣ as tribute.',                            action: 'collectFromAll', amount: 50 },
  { text: 'Diplomatic gala. Pay each rival 50₣.',                           action: 'payAll',         amount: 50 },
  { text: 'Bank dividend. Collect 150₣.',                                   action: 'gain',           amount: 150 },
  { text: 'Inheritance from a distant aunt. Collect 100₣.',                 action: 'gain',           amount: 100 },
  { text: 'Insurance against your supply lines. Collect 50₣ per supply line owned.', action: 'gainPerSupply', amount: 50 },
  { text: 'Coronation expenses. Pay 150₣.',                                 action: 'pay',            amount: 150 },
  { text: 'You are sent into exile.',                                        action: 'goToExile' },
  { text: 'Council seat secured. Collect 100₣.',                            action: 'gain',           amount: 100 },
  { text: 'Espionage uncovered against you. Pay 75₣.',                      action: 'pay',            amount: 75 },
];
