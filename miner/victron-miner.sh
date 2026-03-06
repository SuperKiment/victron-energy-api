#!/usr/bin/env bash
# ============================================================
# victron-miner.sh — Orchestrateur de minage solaire
#
# Lance XMRig (CPU) + T-Rex (GPU Nvidia) quand l'énergie
# solaire est excédentaire selon les données Victron.
#
# Usage :
#   ./victron-miner.sh            # Boucle infinie (mode daemon)
#   ./victron-miner.sh status     # Affiche l'état actuel
#   ./victron-miner.sh start      # Force le démarrage du minage
#   ./victron-miner.sh stop       # Force l'arrêt du minage
#   ./victron-miner.sh once       # Une seule vérification et quitte
# ============================================================

set -euo pipefail

# --- Chargement de la configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config/victron-miner.conf"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "[ERREUR] Fichier de configuration introuvable : $CONFIG_FILE"
  exit 1
fi
source "$CONFIG_FILE"

# --- Création des dossiers nécessaires ---
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p /tmp

# ============================================================
# Fonctions utilitaires
# ============================================================

log() {
  local level="$1"; shift
  local msg="$*"
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  local line="[$ts] [$level] $msg"
  echo "$line"
  echo "$line" >> "$LOG_FILE"
}

info()    { log "INFO " "$@"; }
warn()    { log "WARN " "$@"; }
success() { log "OK   " "$@"; }
error()   { log "ERROR" "$@"; }

# Dépendances requises
check_deps() {
  local missing=()
  for cmd in curl jq; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Dépendances manquantes : ${missing[*]}"
    error "Installez avec : sudo apt install ${missing[*]}"
    exit 1
  fi
}

# ============================================================
# Interrogation de l'API Victron
# ============================================================

fetch_victron_status() {
  local url="${VICTRON_API_URL}/api/status"
  local response http_code

  # Timeout court — si l'API ne répond pas, on ne mine pas
  response=$(curl --silent --max-time 15 --write-out "\n%{http_code}" "$url" 2>/dev/null) || {
    warn "Impossible de joindre l'API Victron ($url)"
    return 1
  }

  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | head -n -1)

  if [[ "$http_code" != "200" ]]; then
    warn "API Victron retourne HTTP $http_code"
    return 1
  fi

  # Vérifie que c'est du JSON valide
  echo "$body" | jq empty 2>/dev/null || {
    warn "Réponse API invalide (pas du JSON)"
    return 1
  }

  echo "$body"
}

# Évalue si le minage doit démarrer à partir des données JSON
should_mine() {
  local json="$1"

  local soc grid_total
  soc=$(echo "$json"       | jq -r '.data.battery.soc_pct       // 0')
  grid_total=$(echo "$json" | jq -r '.data.grid.total_w          // 0')

  # grid_total négatif = on consomme du réseau
  # grid_total positif = on injecte dans le réseau (surplus !)
  local grid_export=0
  if (( $(echo "$grid_total > 0" | bc -l) )); then
    grid_export=$grid_total
  fi

  info "Batterie: ${soc}% | Réseau: ${grid_total}W (export: ${grid_export}W)"

  # Condition 1 : batterie chargée au seuil min et SOC ≥ seuil
  if (( $(echo "$soc >= $BATTERY_SOC_THRESHOLD" | bc -l) )); then
    info "→ Condition remplie : SOC ${soc}% ≥ ${BATTERY_SOC_THRESHOLD}%"
    return 0
  fi

  # Condition 2 : export réseau suffisant
  if (( $(echo "$grid_export >= $GRID_EXPORT_THRESHOLD" | bc -l) )); then
    info "→ Condition remplie : export réseau ${grid_export}W ≥ ${GRID_EXPORT_THRESHOLD}W"
    return 0
  fi

  # Condition 3 : SOC élevé (proche du plein)
  if (( $(echo "$soc >= $BATTERY_SOC_MIN_TO_MINE" | bc -l) )); then
    info "→ Condition remplie : SOC ${soc}% ≥ ${BATTERY_SOC_MIN_TO_MINE}% (seuil confort)"
    return 0
  fi

  info "→ Conditions non remplies — pas de minage"
  return 1
}

# ============================================================
# Gestion des processus mineurs
# ============================================================

is_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    kill -0 "$pid" 2>/dev/null && return 0
  fi
  return 1
}

start_xmrig() {
  if is_running "$PID_FILE_XMRIG"; then
    return 0  # Déjà lancé
  fi

  if [[ ! -x "$XMRIG_BIN" ]]; then
    warn "XMRig introuvable : $XMRIG_BIN — minage CPU ignoré"
    return 1
  fi

  info "Démarrage XMRig (CPU)..."
  "$XMRIG_BIN" \
    --url    "$POOL_URL" \
    --user   "${WALLET_ADDRESS}.${WORKER_NAME}-cpu" \
    --pass   "x" \
    --threads "$CPU_THREADS" \
    --no-color \
    --log-file "${LOG_FILE%.log}-xmrig.log" \
    --background \
    --pid "$PID_FILE_XMRIG" \
    2>>"$LOG_FILE" &

  sleep 2
  if is_running "$PID_FILE_XMRIG"; then
    success "XMRig démarré (PID $(cat "$PID_FILE_XMRIG"))"
  else
    warn "XMRig n'a pas démarré correctement"
  fi
}

start_trex() {
  if is_running "$PID_FILE_TREX"; then
    return 0
  fi

  if [[ ! -x "$TREX_BIN" ]]; then
    warn "T-Rex introuvable : $TREX_BIN — minage GPU ignoré"
    return 1
  fi

  info "Démarrage T-Rex (GPU Nvidia)..."
  "$TREX_BIN" \
    --algo   "kawpow" \
    --url    "stratum+tcp://${POOL_URL}" \
    --user   "${WALLET_ADDRESS}.${WORKER_NAME}-gpu" \
    --pass   "x" \
    --intensity "$GPU_INTENSITY" \
    --no-color \
    --log-path "${LOG_FILE%.log}-trex.log" \
    --quiet \
    2>>"$LOG_FILE" &

  local pid=$!
  echo $pid > "$PID_FILE_TREX"
  sleep 3

  if is_running "$PID_FILE_TREX"; then
    success "T-Rex démarré (PID $pid)"
  else
    warn "T-Rex n'a pas démarré correctement"
    rm -f "$PID_FILE_TREX"
  fi
}

stop_miner() {
  local name="$1"
  local pid_file="$2"

  if ! is_running "$pid_file"; then
    return 0
  fi

  local pid
  pid=$(cat "$pid_file")
  info "Arrêt de $name (PID $pid)..."

  kill -SIGTERM "$pid" 2>/dev/null || true
  sleep 3

  # Force kill si toujours en vie
  if kill -0 "$pid" 2>/dev/null; then
    warn "$name ne répond pas, force kill..."
    kill -SIGKILL "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  success "$name arrêté"
}

start_mining() {
  if [[ "$(cat "$STATE_FILE" 2>/dev/null)" == "mining" ]] \
     && is_running "$PID_FILE_XMRIG" \
     && is_running "$PID_FILE_TREX"; then
    info "Minage déjà en cours — rien à faire"
    return
  fi

  success "=== DÉMARRAGE DU MINAGE ==="
  start_xmrig
  start_trex
  echo "mining" > "$STATE_FILE"
}

stop_mining() {
  if [[ "$(cat "$STATE_FILE" 2>/dev/null)" != "mining" ]] \
     && ! is_running "$PID_FILE_XMRIG" \
     && ! is_running "$PID_FILE_TREX"; then
    return
  fi

  info "=== ARRÊT DU MINAGE ==="
  stop_miner "XMRig" "$PID_FILE_XMRIG"
  stop_miner "T-Rex" "$PID_FILE_TREX"
  echo "idle" > "$STATE_FILE"
}

# ============================================================
# Commandes manuelles
# ============================================================

cmd_status() {
  echo "════════════════════════════════════════"
  echo " Victron Miner — État"
  echo "════════════════════════════════════════"

  local state
  state=$(cat "$STATE_FILE" 2>/dev/null || echo "inconnu")
  echo " État enregistré : $state"
  echo ""

  if is_running "$PID_FILE_XMRIG"; then
    echo " ✓ XMRig  (CPU) — PID $(cat "$PID_FILE_XMRIG")"
  else
    echo " ✗ XMRig  (CPU) — arrêté"
  fi

  if is_running "$PID_FILE_TREX"; then
    echo " ✓ T-Rex  (GPU) — PID $(cat "$PID_FILE_TREX")"
  else
    echo " ✗ T-Rex  (GPU) — arrêté"
  fi

  echo ""
  echo " Dernière requête API :"
  local json
  if json=$(fetch_victron_status 2>/dev/null); then
    local soc voltage grid
    soc=$(echo "$json"     | jq -r '.data.battery.soc_pct   // "?"')
    voltage=$(echo "$json" | jq -r '.data.battery.voltage_v // "?"')
    grid=$(echo "$json"    | jq -r '.data.grid.total_w       // "?"')
    echo "   Batterie : ${soc}% / ${voltage}V"
    echo "   Réseau   : ${grid}W"
  else
    echo "   API inaccessible"
  fi
  echo "════════════════════════════════════════"
}

# Vérification unique (pour cron ou test)
cmd_once() {
  check_deps
  info "Vérification unique..."
  local json

  if json=$(fetch_victron_status); then
    if should_mine "$json"; then
      start_mining
    else
      stop_mining
    fi
  else
    error "API inaccessible — les mineurs sont laissés dans leur état actuel"
  fi
}

# Boucle principale
cmd_daemon() {
  check_deps
  info "================================================"
  info " Victron Miner démarré — intervalle: ${CHECK_INTERVAL}s"
  info "================================================"

  # Nettoyage au signal d'arrêt
  trap 'info "Signal reçu, arrêt..."; stop_mining; exit 0' SIGTERM SIGINT

  while true; do
    info "--- Vérification ---"
    local json

    if json=$(fetch_victron_status); then
      if should_mine "$json"; then
        start_mining
      else
        stop_mining
      fi
    else
      error "API inaccessible — état maintenu inchangé"
    fi

    info "Prochaine vérification dans ${CHECK_INTERVAL}s..."
    sleep "$CHECK_INTERVAL"
  done
}

# ============================================================
# Point d'entrée
# ============================================================
case "${1:-daemon}" in
  daemon|"")  cmd_daemon  ;;
  once)       cmd_once    ;;
  status)     cmd_status  ;;
  start)      check_deps; start_mining ;;
  stop)       stop_mining ;;
  *)
    echo "Usage: $0 [daemon|once|status|start|stop]"
    exit 1
    ;;
esac
