/**
 * registers.js — Table des registres Modbus TCP Victron Energy
 *
 * Sources officielles :
 *   - GX Modbus-TCP Manual : https://www.victronenergy.com/live/ccgx:modbustcp_faq
 *   - Register list Excel  : disponible sur https://www.victronenergy.com/support-and-downloads/whitepapers
 *
 * Chaque registre est défini par :
 *   - address  : adresse du registre Modbus
 *   - scale    : diviseur à appliquer à la valeur brute
 *   - unit     : unité physique
 *   - key      : clé de sortie dans le JSON
 *   - desc     : description lisible
 */

// =============================================================================
// SYSTEM — Unit-ID 100 (com.victronenergy.system)
// Vue d'ensemble de tout le système
// =============================================================================
const SYSTEM_REGISTERS = [
  // --- Consommation CA ---
  { address: 817, scale: 1,   unit: 'W',   key: 'ac_consumption_l1',    desc: 'Consommation CA phase L1' },
  { address: 818, scale: 1,   unit: 'W',   key: 'ac_consumption_l2',    desc: 'Consommation CA phase L2' },
  { address: 819, scale: 1,   unit: 'W',   key: 'ac_consumption_l3',    desc: 'Consommation CA phase L3' },

  // --- Batterie système ---
  { address: 840, scale: 10,  unit: 'V',   key: 'battery_voltage',      desc: 'Tension batterie' },
  { address: 841, scale: 10,  unit: 'A',   key: 'battery_current',      desc: 'Courant batterie (+ = charge, - = décharge)' },
  { address: 842, scale: 1,   unit: 'W',   key: 'battery_power',        desc: 'Puissance batterie' },
  { address: 843, scale: 1,   unit: '%',   key: 'battery_soc',          desc: 'État de charge (State of Charge)' },
  { address: 844, scale: 1,   unit: 'enum',key: 'battery_state',        desc: 'État batterie (0=idle, 1=charge, 2=décharge)' },

  // --- Réseau (grid) ---
  { address: 820, scale: 1,   unit: 'W',   key: 'grid_l1',              desc: 'Puissance réseau L1' },
  { address: 821, scale: 1,   unit: 'W',   key: 'grid_l2',              desc: 'Puissance réseau L2' },
  { address: 822, scale: 1,   unit: 'W',   key: 'grid_l3',              desc: 'Puissance réseau L3' },

  // --- Solaire (si branché) ---
  { address: 850, scale: 1,   unit: 'W',   key: 'pv_power',             desc: 'Puissance solaire totale' },

  // --- VE.Bus / MultiPlus ---
  { address: 845, scale: 1,   unit: 'enum',key: 'vebus_state',          desc: 'État VE.Bus' },
  { address: 846, scale: 1,   unit: 'enum',key: 'vebus_error',          desc: 'Code erreur VE.Bus' },
];

// =============================================================================
// VE.BUS — Unit-ID variable (com.victronenergy.vebus)
// Données détaillées du MultiPlus-II
// =============================================================================
const VEBUS_REGISTERS = [
  // --- Entrée CA (AC-IN) ---
  { address: 3,  scale: 10,  unit: 'V',   key: 'ac_in_voltage_l1',     desc: 'Tension entrée CA L1' },
  { address: 4,  scale: 10,  unit: 'A',   key: 'ac_in_current_l1',     desc: 'Courant entrée CA L1' },
  { address: 5,  scale: 100, unit: 'Hz',  key: 'ac_in_frequency_l1',   desc: 'Fréquence entrée CA L1' },
  { address: 6,  scale: 0.1, unit: 'VA',  key: 'ac_in_power_l1',       desc: 'Puissance entrée CA L1' },

  // --- Sortie CA (AC-OUT-1) ---
  { address: 9,  scale: 10,  unit: 'V',   key: 'ac_out_voltage_l1',    desc: 'Tension sortie CA L1' },
  { address: 10, scale: 10,  unit: 'A',   key: 'ac_out_current_l1',    desc: 'Courant sortie CA L1' },
  { address: 11, scale: 100, unit: 'Hz',  key: 'ac_out_frequency',     desc: 'Fréquence sortie CA' },
  { address: 12, scale: 0.1, unit: 'VA',  key: 'ac_out_power_l1',      desc: 'Puissance sortie CA L1' },

  // --- Batterie (vue depuis le Multi) ---
  { address: 21, scale: 100, unit: 'V',   key: 'battery_voltage',      desc: 'Tension batterie' },
  { address: 22, scale: 10,  unit: 'A',   key: 'battery_current',      desc: 'Courant batterie' },
  { address: 24, scale: 1,   unit: 'W',   key: 'battery_power',        desc: 'Puissance batterie' },
  { address: 26, scale: 10,  unit: '%',   key: 'battery_soc',          desc: 'État de charge' },

  // --- État du MultiPlus ---
  { address: 27, scale: 1,   unit: 'enum',key: 'state',                desc: 'État VE.Bus / chargeur' },
  { address: 28, scale: 1,   unit: 'enum',key: 'error',                desc: 'Code erreur' },
  { address: 31, scale: 10,  unit: '°C',  key: 'temperature',          desc: 'Température interne' },
];

// =============================================================================
// Énumération des états du VE.Bus / chargeur
// =============================================================================
const VEBUS_STATES = {
  0:   'Éteint',
  1:   'Faible puissance (AES)',
  2:   'Défaut',
  3:   'Bulk (charge rapide)',
  4:   'Absorption',
  5:   'Float',
  6:   'Stockage',
  7:   'Égalisation',
  8:   'Passthru (secteur direct)',
  9:   'Onduleur (batterie)',
  10:  'Power Assist',
  11:  'Alimentation de secours',
  252: 'Contrôle externe',
};

const BATTERY_STATES = {
  0: 'Idle (repos)',
  1: 'En charge',
  2: 'En décharge',
};

module.exports = {
  SYSTEM_REGISTERS,
  VEBUS_REGISTERS,
  VEBUS_STATES,
  BATTERY_STATES,
};
