# Victron Solar Miner 🌞⛏️

Mine de la crypto **uniquement** quand votre installation solaire produit un surplus
(batterie pleine ou injection réseau), en utilisant CPU + GPU Nvidia du laptop.

## Architecture

```
[MultiPlus-II GX]
       ↓  Modbus TCP
[API Express (victron-api)]
       ↓  HTTP GET /api/status  (toutes les 10 min)
[victron-miner.sh]
       ├── XMRig  → CPU (Monero)
       └── T-Rex  → GPU Nvidia (Monero/kawpow)
```

## Installation rapide

```bash
sudo bash install.sh
```

Le script installe automatiquement XMRig, T-Rex, et le service systemd.

## Configuration (obligatoire)

```bash
sudo nano /opt/victron-miner/config/victron-miner.conf
```

Les 3 valeurs à renseigner :

| Paramètre | Exemple | Description |
|-----------|---------|-------------|
| `VICTRON_API_URL` | `http://192.168.1.50:3000` | Adresse de votre serveur Express |
| `WALLET_ADDRESS` | `4A...` | Votre adresse Monero (XMR) |
| `POOL_URL` | `pool.supportxmr.com:3333` | Pool de minage |

## Conditions de démarrage du minage

Le script démarre les mineurs si **au moins une** condition est vraie :

| Condition | Paramètre | Valeur par défaut |
|-----------|-----------|-------------------|
| Batterie chargée à 100% | `BATTERY_SOC_THRESHOLD` | 100% |
| Export vers EDF > seuil | `GRID_EXPORT_THRESHOLD` | 50W |
| SOC confort | `BATTERY_SOC_MIN_TO_MINE` | 98% |

## Commandes

```bash
# Démarrer le service
sudo systemctl start victron-miner

# Voir les logs en temps réel
sudo journalctl -u victron-miner -f

# État actuel (batterie + mineurs)
/opt/victron-miner/scripts/victron-miner.sh status

# Forcer le démarrage du minage
/opt/victron-miner/scripts/victron-miner.sh start

# Forcer l'arrêt
/opt/victron-miner/scripts/victron-miner.sh stop

# Une seule vérification (pour tester)
/opt/victron-miner/scripts/victron-miner.sh once
```

## Logs

```
/var/log/victron-miner/miner.log         ← log principal
/var/log/victron-miner/miner-xmrig.log   ← log XMRig (CPU)
/var/log/victron-miner/miner-trex.log    ← log T-Rex (GPU)
```

## Choisir son pool Monero

| Pool | URL | Commission |
|------|-----|-----------|
| SupportXMR | `pool.supportxmr.com:3333` | 0.6% |
| MoneroOcean | `gulf.moneroocean.stream:10128` | 0% (adaptatif) |
| XMRPool.eu | `de.xmrpool.eu:3333` | 1% |

**MoneroOcean** est souvent recommandé : il mine automatiquement la crypto la plus
rentable avec votre matériel et vous paye en XMR.

## Prérequis matériels

- Pilotes NVIDIA installés (`nvidia-smi` doit fonctionner)
- Accès réseau au serveur Express Victron
- `curl`, `jq`, `bc` (installés par `install.sh`)

## Sécurité

- Le service tourne sous votre compte utilisateur (pas root)
- Seules des requêtes GET en lecture sont faites vers l'API Victron
- Les mineurs sont arrêtés proprement sur SIGTERM (arrêt système)
