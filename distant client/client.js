/**
 * vrm-client.js — Client pour l'API REST Victron VRM
 *
 * Le portail VRM (https://vrm.victronenergy.com) collecte les données
 * de votre MultiPlus-II GX et les expose via une API REST.
 *
 * Documentation : https://vrm-api-docs.victronenergy.com/
 * Base URL      : https://vrmapi.victronenergy.com/v2
 *
 * Utilisation : accès à distance (internet requis)
 * Avantage    : pas besoin d'être sur le même réseau que l'appareil
 * Inconvénient: données légèrement moins temps-réel (intervalle ≈ 1 min)
 */

const axios = require('axios');

const VRM_BASE = 'https://vrmapi.victronenergy.com/v2';

// Codes des attributs diagnostics VRM — les plus utiles
// (ces codes peuvent évoluer, utilisez /diagnostics pour les explorer)
const DIAG_CODES = {
  BATTERY_SOC:         soc => soc,
  BATTERY_VOLTAGE:     300,
  BATTERY_CURRENT:     301,
  BATTERY_POWER:       302,
  BATTERY_STATE:       304,
  VEBUS_STATE:         64,
  CHARGER_STATE:       65,
  AC_IN_VOLTAGE:       6,
  AC_IN_CURRENT:       7,
  AC_OUT_VOLTAGE:      9,
  AC_OUT_CURRENT:      10,
  PV_POWER:            855,
  AC_CONSUMPTION:      13,
  GRID_POWER:          857,
};

class VictronVRMClient {
  constructor(config) {
    this.email    = config.email;
    this.password = config.password;
    this.siteId   = config.siteId;
    this.cacheTtl = parseInt(config.cacheTtl) || 60000; // VRM se met à jour ~1/min

    this._token   = null;
    this._userId  = null;
    this._tokenTs = 0;
    this._cache   = {};
  }

  // ---------------------------------------------------------------------------
  // Authentification — obtient un token Bearer
  // ---------------------------------------------------------------------------
  async authenticate() {
    // Réutilise le token pendant 24h
    if (this._token && (Date.now() - this._tokenTs) < 23 * 3600 * 1000) return;

    const resp = await axios.post(`${VRM_BASE}/auth/login`, {
      username: this.email,
      password: this.password,
    });

    if (!resp.data?.token) throw new Error('Authentification VRM échouée');

    this._token  = resp.data.token;
    this._userId = resp.data.idUser;
    this._tokenTs = Date.now();
    console.log('[VRM] Authentifié avec succès');
  }

  authHeader() {
    return { Authorization: `Bearer ${this._token}` };
  }

  // ---------------------------------------------------------------------------
  // Récupère toutes les données diagnostics de l'installation
  // Endpoint : GET /installations/{siteId}/diagnostics?count=1000
  // ---------------------------------------------------------------------------
  async getDiagnostics() {
    await this.authenticate();
    const resp = await axios.get(
      `${VRM_BASE}/installations/${this.siteId}/diagnostics`,
      { headers: this.authHeader(), params: { count: 1000 } }
    );
    return resp.data?.records ?? [];
  }

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------
  isCacheValid(key) {
    const e = this._cache[key];
    return e && (Date.now() - e.ts) < this.cacheTtl;
  }
  setCache(key, data) { this._cache[key] = { ts: Date.now(), data }; }
  getCache(key) { return this._cache[key]?.data; }

  // ---------------------------------------------------------------------------
  // Résumé synthétique à partir des diagnostics
  // ---------------------------------------------------------------------------
  async getSummary() {
    const cacheKey = 'vrm_summary';
    if (this.isCacheValid(cacheKey)) return this.getCache(cacheKey);

    const records = await this.getDiagnostics();

    // Indexe les records par code + description pour retrouver facilement
    const byCode = {};
    const byDesc = {};
    for (const r of records) {
      byCode[r.idDataAttribute] = r;
      const k = r.description?.toLowerCase().replace(/\s+/g, '_');
      if (k) byDesc[k] = r;
    }

    const get = (desc) => byDesc[desc]?.formattedValue ?? null;
    const raw = (desc) => byDesc[desc]?.rawValue ?? null;

    // Trouve les valeurs importantes par description (plus stable que les codes)
    const summary = {
      source: 'VRM API',
      timestamp: new Date().toISOString(),
      battery: {
        soc_pct:       raw('battery_state_of_charge') ?? raw('state_of_charge'),
        voltage_v:     raw('battery_voltage'),
        current_a:     raw('battery_current'),
        power_w:       raw('battery_power'),
        state:         get('battery_state'),
        time_to_go_s:  raw('battery_time_to_go'),
      },
      inverter_charger: {
        state:         get('vebus_state') ?? get('multiplus_state'),
        ac_in: {
          voltage_v:   raw('input_voltage_(l1)') ?? raw('ac_input_voltage'),
          current_a:   raw('input_current_(l1)') ?? raw('ac_input_current'),
          power_w:     raw('input_power_(l1)')   ?? raw('ac_input_power'),
        },
        ac_out: {
          voltage_v:   raw('output_voltage_(l1)') ?? raw('ac_output_voltage'),
          current_a:   raw('output_current_(l1)') ?? raw('ac_output_current'),
          power_w:     raw('output_power_(l1)')   ?? raw('ac_output_power'),
        },
      },
      solar: {
        power_w:       raw('pv_power'),
        yield_kwh:     raw('pv_yield_today'),
      },
      grid: {
        power_w:       raw('grid_power'),
        voltage_v:     raw('grid_voltage'),
      },
      consumption: {
        total_w:       raw('ac_consumption'),
      },
      // Données brutes pour exploration
      _raw_records_count: records.length,
    };

    this.setCache(cacheKey, summary);
    return summary;
  }

  // ---------------------------------------------------------------------------
  // Retourne tous les records bruts (utile pour découvrir les codes)
  // ---------------------------------------------------------------------------
  async getAllDiagnostics() {
    const cacheKey = 'vrm_diag_all';
    if (this.isCacheValid(cacheKey)) return this.getCache(cacheKey);

    const records = await this.getDiagnostics();
    const result = records.map(r => ({
      id:          r.idDataAttribute,
      device:      r.Device,
      instance:    r.instance,
      description: r.description,
      value:       r.formattedValue,
      raw:         r.rawValue,
    }));

    this.setCache(cacheKey, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Liste des installations de l'utilisateur
  // ---------------------------------------------------------------------------
  async getInstallations() {
    await this.authenticate();
    const resp = await axios.get(
      `${VRM_BASE}/users/${this._userId}/installations`,
      { headers: this.authHeader() }
    );
    return (resp.data?.records ?? []).map(i => ({
      id:       i.idSite,
      name:     i.name,
      timezone: i.timezone,
      online:   i.connection_state === 'connected',
    }));
  }
}

module.exports = VictronVRMClient;
