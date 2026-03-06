/**
 * routes/index.js — Routes Express de l'API Victron
 *
 * Endpoints disponibles :
 *   GET /api/status          → Résumé synthétique (batterie, AC, état)
 *   GET /api/battery         → Données batterie détaillées
 *   GET /api/inverter        → Données onduleur/chargeur (AC-IN / AC-OUT)
 *   GET /api/system          → Données système complètes (Modbus)
 *   GET /api/vebus           → Données VE.Bus brutes (Modbus)
 *   GET /api/vrm/summary     → Résumé VRM (si configuré)
 *   GET /api/vrm/diagnostics → Tous les points de données VRM
 *   GET /api/vrm/installs    → Liste des installations VRM
 *   GET /health              → Vérification que l'API tourne
 */

const express = require('express');
const router  = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ok = (res, data, meta = {}) =>
  res.json({ success: true, timestamp: new Date().toISOString(), ...meta, data });

const err = (res, message, status = 503) =>
  res.status(status).json({ success: false, error: message, timestamp: new Date().toISOString() });

const withErrorHandling = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error('[Route]', e.message);
    err(res, e.message);
  }
};

// ---------------------------------------------------------------------------
module.exports = (modbusClient, vrmClient, connectionMode) => {
// ---------------------------------------------------------------------------

  // --- Santé de l'API ---
  router.get('/health', (req, res) => res.json({
    status: 'ok',
    mode: connectionMode,
    modbus_enabled: !!modbusClient,
    vrm_enabled:    !!vrmClient,
    uptime_s: Math.floor(process.uptime()),
  }));

  // =========================================================================
  // MODBUS TCP — routes locales
  // =========================================================================

  if (modbusClient) {

    // Résumé synthétique (recommandé pour un dashboard simple)
    router.get('/api/status', withErrorHandling(async (req, res) => {
      const data = await modbusClient.getSummary();
      ok(res, data, { source: 'modbus-tcp' });
    }));

    // Données batterie
    router.get('/api/battery', withErrorHandling(async (req, res) => {
      const summary = await modbusClient.getSummary();
      ok(res, summary.battery, { source: 'modbus-tcp', desc: 'Données batterie' });
    }));

    // Données onduleur/chargeur
    router.get('/api/inverter', withErrorHandling(async (req, res) => {
      const summary = await modbusClient.getSummary();
      ok(res, summary.inverter_charger, { source: 'modbus-tcp', desc: 'Onduleur/chargeur MultiPlus-II' });
    }));

    // Consommation CA
    router.get('/api/consumption', withErrorHandling(async (req, res) => {
      const summary = await modbusClient.getSummary();
      ok(res, summary.consumption, { source: 'modbus-tcp', desc: 'Consommation CA' });
    }));

    // Données système globales (brut avec unités)
    router.get('/api/system', withErrorHandling(async (req, res) => {
      const data = await modbusClient.getSystemData();
      ok(res, data, { source: 'modbus-tcp', unit_id: modbusClient.unitSystem });
    }));

    // Données VE.Bus brutes (MultiPlus)
    router.get('/api/vebus', withErrorHandling(async (req, res) => {
      const data = await modbusClient.getVebusData();
      ok(res, data, { source: 'modbus-tcp', unit_id: modbusClient.unitVebus });
    }));

  } else {
    // Modbus non configuré → message d'aide
    const modbusDisabled = (req, res) => err(res,
      'Modbus TCP non activé. Définissez CONNECTION_MODE=modbus et configurez MODBUS_HOST dans .env', 503);
    router.get('/api/status',      modbusDisabled);
    router.get('/api/battery',     modbusDisabled);
    router.get('/api/inverter',    modbusDisabled);
    router.get('/api/system',      modbusDisabled);
    router.get('/api/vebus',       modbusDisabled);
    router.get('/api/consumption', modbusDisabled);
  }

  // =========================================================================
  // VRM API — routes cloud
  // =========================================================================

  if (vrmClient) {

    // Résumé VRM
    router.get('/api/vrm/summary', withErrorHandling(async (req, res) => {
      const data = await vrmClient.getSummary();
      ok(res, data, { source: 'vrm-api', site_id: vrmClient.siteId });
    }));

    // Tous les diagnostics (utile pour explorer les codes disponibles)
    router.get('/api/vrm/diagnostics', withErrorHandling(async (req, res) => {
      const data = await vrmClient.getAllDiagnostics();
      ok(res, data, { source: 'vrm-api', site_id: vrmClient.siteId, count: data.length });
    }));

    // Liste des installations associées au compte
    router.get('/api/vrm/installs', withErrorHandling(async (req, res) => {
      const data = await vrmClient.getInstallations();
      ok(res, data, { source: 'vrm-api' });
    }));

    // Si VRM configuré et pas de Modbus, redirige /api/status sur VRM
    if (!modbusClient) {
      router.get('/api/status', withErrorHandling(async (req, res) => {
        const data = await vrmClient.getSummary();
        ok(res, data, { source: 'vrm-api' });
      }));
    }

  } else {
    const vrmDisabled = (req, res) => err(res,
      'VRM API non configurée. Définissez VRM_EMAIL, VRM_PASSWORD et VRM_SITE_ID dans .env', 503);
    router.get('/api/vrm/summary',     vrmDisabled);
    router.get('/api/vrm/diagnostics', vrmDisabled);
    router.get('/api/vrm/installs',    vrmDisabled);
  }

  // Route inconnue
  router.use((req, res) => err(res, `Route inconnue : ${req.method} ${req.path}`, 404));

  return router;
};
