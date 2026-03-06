# Victron Energy API — MultiPlus-II GX

API REST Express.js pour exposer les données du **Victron MultiPlus-II GX** en JSON.

Deux modes de connexion supportés :
- **Modbus TCP** (recommandé) — connexion directe sur votre réseau local
- **VRM API** — connexion cloud via le portail Victron VRM

---

## Installation

```bash
# 1. Clonez ou copiez le projet
cd victron-api

# 2. Installez les dépendances
npm install

# 3. Configurez l'environnement
cp .env.example .env
nano .env     # ou éditez avec votre éditeur

# 4. Lancez l'API
npm start
```

---

## Configuration

### Mode Modbus TCP (réseau local — recommandé)

**1. Activez Modbus TCP sur le MultiPlus-II GX :**
Sur l'écran LCD ou via l'interface web (http://IP-du-MultiPlus) :
```
Paramètres → Services → Modbus TCP → Activer
```

**2. Trouvez le Unit-ID du VE.Bus :**
```
Paramètres → Services → Modbus TCP → Services disponibles
```
Cherchez la ligne `com.victronenergy.vebus` — notez son Unit-ID (souvent 238, 242 ou 246).

**3. Configurez .env :**
```env
CONNECTION_MODE=modbus
MODBUS_HOST=192.168.1.100      # IP du MultiPlus-II GX
MODBUS_PORT=502                # Port Modbus (défaut)
MODBUS_UNIT_SYSTEM=100         # Toujours 100
MODBUS_UNIT_VEBUS=246          # Votre Unit-ID VE.Bus
```

### Mode VRM API (accès cloud)

```env
CONNECTION_MODE=vrm
VRM_EMAIL=votre@email.com
VRM_PASSWORD=votre_mot_de_passe
VRM_SITE_ID=123456             # Visible dans l'URL VRM
```

### Mode combiné (les deux)
```env
CONNECTION_MODE=both
# ... tous les paramètres Modbus ET VRM
```

---

## Endpoints

| Méthode | Route | Description | Source |
|---------|-------|-------------|--------|
| GET | `/health` | État de l'API | — |
| GET | `/api/status` | Résumé complet du système | Modbus |
| GET | `/api/battery` | Données batterie | Modbus |
| GET | `/api/inverter` | Onduleur + AC-IN / AC-OUT | Modbus |
| GET | `/api/consumption` | Consommation CA | Modbus |
| GET | `/api/system` | Données système brutes | Modbus |
| GET | `/api/vebus` | Données VE.Bus brutes | Modbus |
| GET | `/api/vrm/summary` | Résumé VRM (cloud) | VRM |
| GET | `/api/vrm/diagnostics` | Tous les points de données VRM | VRM |
| GET | `/api/vrm/installs` | Liste de vos installations VRM | VRM |

---

## Exemples de réponses

### `GET /api/status`
```json
{
  "success": true,
  "timestamp": "2024-08-15T14:23:11.000Z",
  "source": "modbus-tcp",
  "data": {
    "battery": {
      "voltage_v": 52.4,
      "current_a": -12.5,
      "power_w": -655,
      "soc_pct": 78,
      "state": "En décharge",
      "temperature_c": 23.1
    },
    "inverter_charger": {
      "state": "Onduleur (batterie)",
      "error_code": 0,
      "ac_in": {
        "voltage_v": 231.2,
        "current_a": 0.0,
        "frequency_hz": 50.01,
        "power_va": 0
      },
      "ac_out": {
        "voltage_v": 230.0,
        "current_a": 2.8,
        "frequency_hz": 50.0,
        "power_va": 644
      }
    },
    "consumption": {
      "total_w": 644,
      "l1_w": 644,
      "l2_w": 0,
      "l3_w": 0
    },
    "grid": {
      "total_w": 0,
      "l1_w": 0,
      "l2_w": 0,
      "l3_w": 0
    },
    "solar": {
      "power_w": null
    }
  }
}
```

### `GET /api/battery`
```json
{
  "success": true,
  "data": {
    "voltage_v": 52.4,
    "current_a": -12.5,
    "power_w": -655,
    "soc_pct": 78,
    "state": "En décharge",
    "temperature_c": 23.1
  }
}
```

---

## Registres Modbus utilisés

| Service | Unit-ID | Registre | Description | Échelle |
|---------|---------|----------|-------------|---------|
| system | 100 | 840 | Tension batterie | ÷10 (V) |
| system | 100 | 841 | Courant batterie | ÷10 (A) |
| system | 100 | 842 | Puissance batterie | ×1 (W) |
| system | 100 | 843 | SOC batterie | ×1 (%) |
| system | 100 | 844 | État batterie | enum |
| system | 100 | 845 | État VE.Bus | enum |
| system | 100 | 850 | Puissance solaire | ×1 (W) |
| vebus | var | 3 | Tension entrée L1 | ÷10 (V) |
| vebus | var | 4 | Courant entrée L1 | ÷10 (A) |
| vebus | var | 5 | Fréquence entrée L1 | ÷100 (Hz) |
| vebus | var | 9 | Tension sortie L1 | ÷10 (V) |
| vebus | var | 21 | Tension batterie | ÷100 (V) |
| vebus | var | 26 | SOC | ÷10 (%) |
| vebus | var | 27 | État | enum |
| vebus | var | 31 | Température | ÷10 (°C) |

### États VE.Bus
| Code | État |
|------|------|
| 0 | Éteint |
| 3 | Bulk (charge rapide) |
| 4 | Absorption |
| 5 | Float |
| 8 | Passthru (secteur direct) |
| 9 | Onduleur (sur batterie) |
| 10 | Power Assist |

---

## Dépendances

| Package | Usage |
|---------|-------|
| `express` | Serveur HTTP |
| `modbus-serial` | Client Modbus TCP |
| `axios` | Requêtes VRM API |
| `dotenv` | Variables d'environnement |

---

## Dépannage

**L'API répond mais les valeurs sont `null` :**
→ Vérifiez que `MODBUS_UNIT_VEBUS` correspond au bon Unit-ID dans votre appareil.
→ Consultez Paramètres → Services → Modbus TCP → Services disponibles.

**Erreur de connexion Modbus :**
→ Vérifiez que Modbus TCP est bien activé sur le MultiPlus.
→ Vérifiez que l'IP et le port sont corrects et que le firewall autorise le port 502.

**Authentification VRM échoue :**
→ Testez vos identifiants sur https://vrm.victronenergy.com
→ Vérifiez que `VRM_SITE_ID` est le bon numéro (visible dans l'URL de votre installation).
