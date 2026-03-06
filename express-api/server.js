/**
 * server.js — Point d'entrée principal
 * API REST Express.js pour Victron Energy MultiPlus-II GX
 *
 * ─────────────────────────────────────────────────────
 * Installation rapide :
 *   cp .env.example .env          # Copiez et editez votre config
 *   npm install                   # Installez les dépendances
 *   npm start                     # Lancez le serveur
 * ─────────────────────────────────────────────────────
 *
 * Deux modes de connexion :
 *   1. Modbus TCP (local, réseau LAN)
 *      → Connexion directe à l'IP du MultiPlus-II GX sur le port 502
 *      → Prérequis : Activer Modbus TCP dans Paramètres → Services → Modbus TCP
 *
 *   2. VRM API (cloud, accès distant)
 *      → Connexion au portail Victron VRM via internet
 *      → Prérequis : Compte VRM actif + connexion internet du MultiPlus
 */

'use strict';
require('dotenv').config();

const express = require('express');
const VictronModbusClient = require('./src/modbus/client');
const VictronVRMClient    = require('./src/vrm/client');
const buildRoutes         = require('./src/routes/index');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT            = process.env.PORT            || 3000;
const CONNECTION_MODE = process.env.CONNECTION_MODE  || 'modbus';
const CACHE_TTL_MS    = parseInt(process.env.CACHE_TTL_MS) || 5000;

// ---------------------------------------------------------------------------
// Initialisation des clients selon le mode
// ---------------------------------------------------------------------------
let modbusClient = null;
let vrmClient    = null;

if (CONNECTION_MODE === 'modbus' || CONNECTION_MODE === 'both') {
  if (!process.env.MODBUS_HOST) {
    console.warn('[Config] MODBUS_HOST non défini — Modbus TCP désactivé');
  } else {
    modbusClient = new VictronModbusClient({
      host:       process.env.MODBUS_HOST,
      port:       process.env.MODBUS_PORT       || 502,
      timeout:    process.env.MODBUS_TIMEOUT    || 5000,
      unitSystem: process.env.MODBUS_UNIT_SYSTEM || 100,
      unitVebus:  process.env.MODBUS_UNIT_VEBUS  || 246,
      cacheTtl:   CACHE_TTL_MS,
    });
    console.log(`[Config] Modbus TCP → ${process.env.MODBUS_HOST}:${process.env.MODBUS_PORT || 502}`);
  }
}

if (CONNECTION_MODE === 'vrm' || CONNECTION_MODE === 'both') {
  if (!process.env.VRM_EMAIL || !process.env.VRM_SITE_ID) {
    console.warn('[Config] VRM_EMAIL ou VRM_SITE_ID non défini — VRM API désactivée');
  } else {
    vrmClient = new VictronVRMClient({
      email:    process.env.VRM_EMAIL,
      password: process.env.VRM_PASSWORD,
      siteId:   process.env.VRM_SITE_ID,
      cacheTtl: Math.max(CACHE_TTL_MS, 60000), // VRM se met à jour au max toutes les minutes
    });
    console.log(`[Config] VRM API → site #${process.env.VRM_SITE_ID}`);
  }
}

if (!modbusClient && !vrmClient) {
  console.error('[Erreur] Aucune source de données configurée !');
  console.error('  → Copiez .env.example en .env et remplissez les valeurs');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Application Express
// ---------------------------------------------------------------------------
const app = express();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Victron-API');
  next();
});

// CORS (optionnel — utile si vous consommez l'API depuis un navigateur)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Logging simple
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Routes de l'API
app.use('/', buildRoutes(modbusClient, vrmClient, CONNECTION_MODE));

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
const server = app.listen(PORT, async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       Victron Energy API — MultiPlus-II GX       ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  URL locale   : http://localhost:${PORT}              ║`);
  console.log(`║  Mode         : ${CONNECTION_MODE.padEnd(36)}║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Endpoints disponibles :                         ║');
  console.log('║   GET /health              → Statut de l\'API     ║');
  console.log('║   GET /api/status          → Résumé synthétique  ║');
  console.log('║   GET /api/battery         → Batterie            ║');
  console.log('║   GET /api/inverter        → Onduleur/chargeur   ║');
  console.log('║   GET /api/consumption     → Consommation CA     ║');
  console.log('║   GET /api/system          → Système complet     ║');
  console.log('║   GET /api/vebus           → VE.Bus brut         ║');
  console.log('║   GET /api/vrm/summary     → Résumé VRM (cloud)  ║');
  console.log('║   GET /api/vrm/diagnostics → Diagnostics VRM     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Connexion initiale Modbus (optionnelle, teste la connectivité au démarrage)
  if (modbusClient) {
    try {
      await modbusClient.connect();
      console.log('[✓] Connexion Modbus TCP établie');
    } catch (e) {
      console.warn(`[!] Modbus non joignable pour l'instant (${e.message})`);
      console.warn('    → L\'API tentera de se reconnecter à chaque requête');
    }
  }
});

// ---------------------------------------------------------------------------
// Arrêt propre
// ---------------------------------------------------------------------------
const shutdown = async (signal) => {
  console.log(`\n[Arrêt] Signal ${signal} reçu...`);
  if (modbusClient) await modbusClient.close();
  server.close(() => {
    console.log('[Arrêt] Serveur arrêté');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
