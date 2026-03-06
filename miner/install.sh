#!/usr/bin/env bash
# ============================================================
# install.sh — Installation automatique de victron-miner
# Lancez avec : sudo bash install.sh
# ============================================================
set -e

INSTALL_DIR="/opt/victron-miner"
LOG_DIR="/var/log/victron-miner"
MINERS_DIR="/opt/miners"
SERVICE_FILE="/etc/systemd/system/victron-miner.service"
CURRENT_USER="${SUDO_USER:-$(whoami)}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      Victron Solar Miner — Installation          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# --- Vérification root ---
if [[ $EUID -ne 0 ]]; then
  echo "[ERREUR] Ce script doit être lancé avec sudo"
  exit 1
fi

# --- Dépendances système ---
echo "[1/6] Installation des dépendances système..."
apt-get update -qq
apt-get install -y curl jq bc wget unzip

# --- Pilotes CUDA (si non installés) ---
if ! command -v nvidia-smi &>/dev/null; then
  echo ""
  echo "⚠  nvidia-smi introuvable. Pilotes NVIDIA requis pour T-Rex (GPU)."
  echo "   Installez-les avec :"
  echo "   sudo ubuntu-drivers autoinstall && sudo reboot"
  echo "   Puis relancez ce script."
  echo ""
fi

# --- Création des dossiers ---
echo "[2/6] Création des dossiers..."
mkdir -p "$INSTALL_DIR/scripts" "$INSTALL_DIR/config"
mkdir -p "$LOG_DIR"
mkdir -p "$MINERS_DIR/xmrig" "$MINERS_DIR/trex"

chown -R "$CURRENT_USER:$CURRENT_USER" "$LOG_DIR"

# --- Copie des fichiers du projet ---
echo "[3/6] Installation des fichiers..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/scripts/victron-miner.sh" "$INSTALL_DIR/scripts/"
cp "$SCRIPT_DIR/config/victron-miner.conf" "$INSTALL_DIR/config/"
chmod +x "$INSTALL_DIR/scripts/victron-miner.sh"
chown -R "$CURRENT_USER:$CURRENT_USER" "$INSTALL_DIR"

# --- Téléchargement de XMRig ---
echo "[4/6] Téléchargement de XMRig (CPU miner)..."
XMRIG_VERSION="6.21.3"
XMRIG_URL="https://github.com/xmrig/xmrig/releases/download/v${XMRIG_VERSION}/xmrig-${XMRIG_VERSION}-linux-x64.tar.gz"

if [[ ! -f "$MINERS_DIR/xmrig/xmrig" ]]; then
  wget -q --show-progress -O /tmp/xmrig.tar.gz "$XMRIG_URL"
  tar xzf /tmp/xmrig.tar.gz -C /tmp/
  cp "/tmp/xmrig-${XMRIG_VERSION}/xmrig" "$MINERS_DIR/xmrig/"
  chmod +x "$MINERS_DIR/xmrig/xmrig"
  rm -rf "/tmp/xmrig-${XMRIG_VERSION}" /tmp/xmrig.tar.gz
  echo "   XMRig installé → $MINERS_DIR/xmrig/xmrig"
else
  echo "   XMRig déjà installé, ignoré."
fi

# --- Téléchargement de T-Rex ---
echo "[5/6] Téléchargement de T-Rex (GPU Nvidia miner)..."
TREX_VERSION="0.26.8"
TREX_URL="https://github.com/trexminer/T-Rex/releases/download/${TREX_VERSION}/t-rex-${TREX_VERSION}-linux.tar.gz"

if [[ ! -f "$MINERS_DIR/trex/t-rex" ]]; then
  wget -q --show-progress -O /tmp/trex.tar.gz "$TREX_URL"
  tar xzf /tmp/trex.tar.gz -C "$MINERS_DIR/trex/"
  chmod +x "$MINERS_DIR/trex/t-rex"
  rm -f /tmp/trex.tar.gz
  echo "   T-Rex installé → $MINERS_DIR/trex/t-rex"
else
  echo "   T-Rex déjà installé, ignoré."
fi

# --- Service systemd ---
echo "[6/6] Installation du service systemd..."
sed "s/VOTRE_UTILISATEUR/$CURRENT_USER/g" \
  "$SCRIPT_DIR/victron-miner.service" \
  | sed "s|/opt/victron-miner|$INSTALL_DIR|g" \
  > "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable victron-miner

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║              Installation terminée !             ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  ➤ ÉTAPE OBLIGATOIRE : configurez votre .conf   ║"
echo "║                                                  ║"
echo "║  sudo nano $INSTALL_DIR/config/victron-miner.conf"
echo "║                                                  ║"
echo "║  Paramètres à remplir :                          ║"
echo "║    VICTRON_API_URL  → IP:port du serveur Express ║"
echo "║    WALLET_ADDRESS   → Votre adresse XMR          ║"
echo "║    POOL_URL         → Votre pool de minage       ║"
echo "║                                                  ║"
echo "║  Puis lancez :                                   ║"
echo "║    sudo systemctl start victron-miner            ║"
echo "║    sudo journalctl -u victron-miner -f           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
