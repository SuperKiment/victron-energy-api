/**
 * client.js — Client Modbus TCP pour Victron MultiPlus-II GX
 *
 * Le MultiPlus-II GX embarque une carte GX (Venus OS) qui expose
 * un serveur Modbus TCP sur le port 502.
 *
 * Prérequis :
 *   Activer Modbus TCP sur l'appareil :
 *   Paramètres → Services → Modbus TCP → Activer
 */

const ModbusRTU = require('modbus-serial');
const { SYSTEM_REGISTERS, VEBUS_REGISTERS, VEBUS_STATES, BATTERY_STATES } = require('../../registers');

class VictronModbusClient {
  constructor(config) {
    this.host    = config.host;
    this.port    = parseInt(config.port)    || 502;
    this.timeout = parseInt(config.timeout) || 5000;
    this.unitSystem = parseInt(config.unitSystem) || 100;
    this.unitVebus  = parseInt(config.unitVebus)  || 246;
    this.cacheTtl   = parseInt(config.cacheTtl)   || 5000;

    this.client = new ModbusRTU();
    this.cache  = {};
    this._connecting = false;
    this._connected  = false;
  }

  // ---------------------------------------------------------------------------
  // Connexion / reconnexion automatique
  // ---------------------------------------------------------------------------
  async connect() {
    if (this._connecting) return;
    this._connecting = true;
    try {
      this.client.setTimeout(this.timeout);
      await this.client.connectTCP(this.host, { port: this.port });
      this._connected = true;
      console.log(`[Modbus] Connecté à ${this.host}:${this.port}`);
    } catch (err) {
      this._connected = false;
      console.error(`[Modbus] Échec connexion : ${err.message}`);
      throw err;
    } finally {
      this._connecting = false;
    }
  }

  async ensureConnected() {
    if (!this._connected) await this.connect();
  }

  // ---------------------------------------------------------------------------
  // Lecture d'un registre unique
  // ---------------------------------------------------------------------------
  async readRegister(unitId, address) {
    await this.ensureConnected();
    this.client.setID(unitId);
    try {
      const data = await this.client.readHoldingRegisters(address, 1);
      return data.data[0];
    } catch (err) {
      // Reconnexion automatique si la connexion a été perdue
      if (err.message && (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT'))) {
        this._connected = false;
        await this.connect();
        this.client.setID(unitId);
        const data = await this.client.readHoldingRegisters(address, 1);
        return data.data[0];
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Lecture d'un groupe de registres selon une liste de définitions
  // Les registres non contigus sont lus un par un pour éviter les erreurs.
  // ---------------------------------------------------------------------------
  async readRegisterGroup(unitId, registerDefs) {
    const result = {};
    for (const reg of registerDefs) {
      try {
        const raw = await this.readRegister(unitId, reg.address);

        // Valeurs signées 16 bits (ex : courant en décharge = négatif)
        const signed = raw > 32767 ? raw - 65536 : raw;
        const value  = reg.scale > 1
          ? parseFloat((signed / reg.scale).toFixed(2))
          : parseFloat((signed * (reg.scale < 1 ? 1 / reg.scale : 1)).toFixed(2));

        result[reg.key] = { value, unit: reg.unit, desc: reg.desc };
      } catch (_err) {
        result[reg.key] = { value: null, unit: reg.unit, desc: reg.desc, error: 'registre indisponible' };
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Cache pour éviter de bombarder le Modbus toutes les requêtes HTTP
  // ---------------------------------------------------------------------------
  isCacheValid(key) {
    const entry = this.cache[key];
    return entry && (Date.now() - entry.ts) < this.cacheTtl;
  }

  setCache(key, data) {
    this.cache[key] = { ts: Date.now(), data };
  }

  getCache(key) {
    return this.cache[key]?.data;
  }

  // ---------------------------------------------------------------------------
  // Données système globales (Unit-ID 100)
  // ---------------------------------------------------------------------------
  async getSystemData() {
    const cacheKey = 'system';
    if (this.isCacheValid(cacheKey)) return this.getCache(cacheKey);

    const raw = await this.readRegisterGroup(this.unitSystem, SYSTEM_REGISTERS);

    // Enrichissement sémantique
    const batteryState = raw.battery_state?.value;
    const vebusState   = raw.vebus_state?.value;

    const enriched = {
      ...raw,
      battery_state_label: {
        value: BATTERY_STATES[batteryState] ?? `Inconnu (${batteryState})`,
        desc: 'État lisible de la batterie',
      },
      vebus_state_label: {
        value: VEBUS_STATES[vebusState] ?? `Inconnu (${vebusState})`,
        desc: 'État lisible du VE.Bus',
      },
      ac_consumption_total: {
        value: [
          raw.ac_consumption_l1?.value ?? 0,
          raw.ac_consumption_l2?.value ?? 0,
          raw.ac_consumption_l3?.value ?? 0,
        ].reduce((a, b) => a + b, 0),
        unit: 'W',
        desc: 'Consommation CA totale (L1+L2+L3)',
      },
      grid_total: {
        value: [
          raw.grid_l1?.value ?? 0,
          raw.grid_l2?.value ?? 0,
          raw.grid_l3?.value ?? 0,
        ].reduce((a, b) => a + b, 0),
        unit: 'W',
        desc: 'Puissance réseau totale',
      },
    };

    this.setCache(cacheKey, enriched);
    return enriched;
  }

  // ---------------------------------------------------------------------------
  // Données détaillées du MultiPlus-II (VE.Bus)
  // ---------------------------------------------------------------------------
  async getVebusData() {
    const cacheKey = 'vebus';
    if (this.isCacheValid(cacheKey)) return this.getCache(cacheKey);

    const raw = await this.readRegisterGroup(this.unitVebus, VEBUS_REGISTERS);

    // Enrichissement sémantique
    const stateCode = raw.state?.value;
    const enriched = {
      ...raw,
      state_label: {
        value: VEBUS_STATES[stateCode] ?? `Inconnu (${stateCode})`,
        desc: 'État lisible du chargeur/onduleur',
      },
    };

    this.setCache(cacheKey, enriched);
    return enriched;
  }

  // ---------------------------------------------------------------------------
  // Vue d'ensemble synthétique (résumé)
  // ---------------------------------------------------------------------------
  async getSummary() {
    const cacheKey = 'summary';
    if (this.isCacheValid(cacheKey)) return this.getCache(cacheKey);

    const [sys, vebus] = await Promise.allSettled([
      this.getSystemData(),
      this.getVebusData(),
    ]);

    const s = sys.status === 'fulfilled' ? sys.value : {};
    const v = vebus.status === 'fulfilled' ? vebus.value : {};

    const summary = {
      battery: {
        voltage_v:   s.battery_voltage?.value ?? v.battery_voltage?.value ?? null,
        current_a:   s.battery_current?.value ?? v.battery_current?.value ?? null,
        power_w:     s.battery_power?.value   ?? v.battery_power?.value   ?? null,
        soc_pct:     s.battery_soc?.value     ?? v.battery_soc?.value     ?? null,
        state:       s.battery_state_label?.value ?? null,
        temperature_c: v.temperature?.value ?? null,
      },
      inverter_charger: {
        state:           v.state_label?.value ?? s.vebus_state_label?.value ?? null,
        error_code:      v.error?.value ?? s.vebus_error?.value ?? null,
        ac_in: {
          voltage_v:     v.ac_in_voltage_l1?.value ?? null,
          current_a:     v.ac_in_current_l1?.value ?? null,
          frequency_hz:  v.ac_in_frequency_l1?.value ?? null,
          power_va:      v.ac_in_power_l1?.value ?? null,
        },
        ac_out: {
          voltage_v:     v.ac_out_voltage_l1?.value ?? null,
          current_a:     v.ac_out_current_l1?.value ?? null,
          frequency_hz:  v.ac_out_frequency?.value ?? null,
          power_va:      v.ac_out_power_l1?.value ?? null,
        },
      },
      consumption: {
        total_w: s.ac_consumption_total?.value ?? null,
        l1_w:    s.ac_consumption_l1?.value ?? null,
        l2_w:    s.ac_consumption_l2?.value ?? null,
        l3_w:    s.ac_consumption_l3?.value ?? null,
      },
      grid: {
        total_w: s.grid_total?.value ?? null,
        l1_w:    s.grid_l1?.value ?? null,
        l2_w:    s.grid_l2?.value ?? null,
        l3_w:    s.grid_l3?.value ?? null,
      },
      solar: {
        power_w: s.pv_power?.value ?? null,
      },
    };

    this.setCache(cacheKey, summary);
    return summary;
  }

  async close() {
    try { this.client.close(); } catch (_) {}
    this._connected = false;
  }
}

module.exports = VictronModbusClient;
