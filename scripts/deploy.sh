#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BLUE_GREEN_SCRIPT="${SCRIPT_DIR}/blue-green.sh"
DEPLOY_RECORD=".last_deployed"
BOOTNODE_STATE_FILE=".chain-node-next.state"
ENV_FILE=".env.blue-green"
REPO_DIR="$(pwd)"

usage() {
    echo "Usage: $0 [--boot-node]"
    echo ""
    echo "  (no args)     Normal deploy: init if nothing is running, otherwise a"
    echo "                blue-green runtime upgrade to the latest git tag."
    echo "  --boot-node   Boot-node deploy: bring up a new chain node from a new"
    echo "                genesis and re-index it on the inactive environment."
    echo "                Chain image/spec come from CHAIN_NODE_NEXT_IMAGE and"
    echo "                CHAIN_NEXT_SPEC in ${ENV_FILE}."
}

# Parse args
BOOT_NODE=false
for arg in "$@"; do
    case "$arg" in
        --boot-node)
            BOOT_NODE=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $arg"
            usage
            exit 1
            ;;
    esac
done

# Detect if ANY blue/green containers are running
is_running() {
    docker ps --format "{{.Names}}" | grep -Eq "blue-graphql|green-graphql"
}

# Get latest Git tag (SemVer-safe)
get_latest_tag() {
    git -C "$REPO_DIR" fetch --tags > /dev/null 2>&1
    git -C "$REPO_DIR" tag -l | sort -V | tail -n 1
}

LATEST_TAG=$(get_latest_tag)

if [ -z "$LATEST_TAG" ]; then
    echo "❌ No git tags found in repository."
    exit 1
fi

echo "Latest Git tag detected: $LATEST_TAG"

##########################################
# BOOT-NODE MODE: deploy.sh --boot-node
##########################################
if [ "$BOOT_NODE" = true ]; then
    if [ -f "$BOOTNODE_STATE_FILE" ]; then
        echo "⏸ A boot-node deployment is already in progress."
        "$BLUE_GREEN_SCRIPT" chain-node-status
        exit 0
    fi

    if ! is_running; then
        echo "❌ No active blue/green environment detected."
        echo "➡ Run a normal deploy first ('$0') to initialize the stack."
        exit 1
    fi

    if [ ! -f "$ENV_FILE" ]; then
        echo "❌ Environment file '${ENV_FILE}' not found."
        exit 1
    fi

    echo "🌱 Boot-node deployment"
    echo "Indexer tag      : $LATEST_TAG"
    echo "Chain image/spec : CHAIN_NODE_NEXT_IMAGE / CHAIN_NEXT_SPEC in ${ENV_FILE}"

    "$BLUE_GREEN_SCRIPT" deploy "$LATEST_TAG" --boot-node

    echo "$LATEST_TAG" > "$DEPLOY_RECORD"
    echo "✅ Boot-node deployment started. Follow the next steps printed above to"
    echo "   verify, switch traffic, then promote the new chain node."
    exit 0
fi

##########################################
# NORMAL MODE: deploy.sh
##########################################

# A boot-node (new-genesis) deployment is a deliberate, manual, multi-step flow.
# Never let the automated normal deployer interfere while one is mid-flight.
if [ -f "$BOOTNODE_STATE_FILE" ]; then
    echo "⏸ Boot-node deployment in progress — skipping automated deploy."
    echo "   Run '${BLUE_GREEN_SCRIPT} chain-node-status' for details."
    exit 0
fi

# Load last deployed tag
if [ -f "$DEPLOY_RECORD" ]; then
    LAST_DEPLOYED=$(cat "$DEPLOY_RECORD")
else
    LAST_DEPLOYED=""
fi

if is_running; then
    SERVICE_RUNNING=true
else
    SERVICE_RUNNING=false
fi

echo "Services running: $SERVICE_RUNNING"
echo "Last deployed: ${LAST_DEPLOYED:-<none>}"

##########################################
# CASE A: No services running → INIT MODE
##########################################
if [ "$SERVICE_RUNNING" = false ]; then
    echo "⚠ No active blue/green environment detected."
    echo "➡ Running INIT with tag $LATEST_TAG"
    $BLUE_GREEN_SCRIPT init "$LATEST_TAG"
    echo "$LATEST_TAG" > "$DEPLOY_RECORD"
    echo "✅ Init completed."
    exit 0
fi

##########################################
# CASE B: Services running but tag is same → skip
##########################################
if [ "$LATEST_TAG" = "$LAST_DEPLOYED" ]; then
    echo "✔ Already at latest version ($LATEST_TAG)."
    echo "➡ No deployment needed."
    exit 0
fi

##########################################
# CASE C: New version available → DEPLOY
##########################################
echo "🚀 New version detected:"
echo "Old: $LAST_DEPLOYED"
echo "New: $LATEST_TAG"
echo "➡ Running DEPLOY"

$BLUE_GREEN_SCRIPT deploy "$LATEST_TAG"

echo "$LATEST_TAG" > "$DEPLOY_RECORD"
echo "✅ Deployment completed."
