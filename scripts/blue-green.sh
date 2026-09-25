#!/bin/bash

# Blue-Green Deployment Script
set -e

# Configuration
HEALTH_CHECK_TIMEOUT=60
HEALTH_CHECK_INTERVAL=5
ENV_FILE=.env.blue-green

# Transient state describing an in-progress boot-node deployment. Created by
# `deploy --boot-node`, removed by `promote-chain-node` / `abort-chain-node`.
BOOTNODE_STATE_FILE=.chain-node-next.state

# Chain node data directories (host side)
CHAIN_NODE_DATA_DIR=./chain-node-data
CHAIN_NODE_NEXT_DATA_DIR=./chain-node-data-next

# How long to wait for a chain node's RPC /health to come up (seconds)
CHAIN_NODE_HEALTH_TIMEOUT=300

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Load environment + transient state and derive runtime overrides.
# Source order (later wins): ENV_FILE -> BOOTNODE_STATE_FILE
load_env() {
    if [[ -f "${ENV_FILE}" ]]; then
        set -a
        source "${ENV_FILE}"
        [[ -f "${BOOTNODE_STATE_FILE}" ]] && source "${BOOTNODE_STATE_FILE}"
        set +a
    fi

    # While a boot-node deployment is in progress, point the target color's
    # processor at chain-node-next instead of the canonical chain-node.
    if [[ -n "${BOOTNODE_TARGET_ENV}" ]]; then
        if [[ "${BOOTNODE_TARGET_ENV}" == "blue" ]]; then
            export BLUE_RPC_ENDPOINT="ws://chain-node-next:9944"
        else
            export GREEN_RPC_ENDPOINT="ws://chain-node-next:9944"
        fi
    fi
}

load_env

# Resolve deploy paths to absolute paths (required for scoped sudoers rules).
abs_deploy_path() {
    local path=$1
    if [[ "$path" != /* ]]; then
        path="$(pwd)/${path#./}"
    fi
    printf '%s' "$path"
}

# Prepare a chain-node data directory: create it and chown it to the UID the
# chain node image runs as (substrate images typically run as a non-root user).
# On Docker Desktop (macOS), bind-mount writes are mapped to the host user, so
# chown'ing to the container UID leaves the directory unwritable.
prepare_chain_data_dir() {
    local data_dir=$1
    local image=$2
    local data_dir_abs
    data_dir_abs=$(abs_deploy_path "${data_dir}")

    echo "Pulling chain node image: ${image}..."
    docker pull "${image}"

    mkdir -p "${data_dir}"

    if [[ "$(uname -s)" == "Darwin" ]]; then
        echo "Setting ownership of ${data_dir} to host user $(id -u) (Docker Desktop)..."
        sudo chown -R "$(id -u):$(id -g)" "${data_dir_abs}"
        return 0
    fi

    local chain_node_uid
    if ! chain_node_uid=$(docker run --rm --entrypoint /bin/sh "${image}" -c "id -u" 2>/dev/null); then
        echo -e "${RED}Error: Failed to extract UID from ${image}.${NC}" >&2
        return 1
    fi

    if ! [[ "${chain_node_uid}" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}Error: UID is not a valid number: '${chain_node_uid}'${NC}" >&2
        return 1
    fi

    echo "Setting ownership of ${data_dir} to UID ${chain_node_uid}..."
    sudo chown -R "${chain_node_uid}:${chain_node_uid}" "${data_dir_abs}"
}

# Wait for a chain node's RPC /health endpoint (host-published port) to respond.
wait_for_chain_node() {
    local label=$1
    local port=$2

    echo "Waiting for ${label} RPC health on http://localhost:${port}/health ..."
    local attempts=0
    local max_attempts=$((CHAIN_NODE_HEALTH_TIMEOUT / HEALTH_CHECK_INTERVAL))

    while [ $attempts -lt $max_attempts ]; do
        if curl -f "http://localhost:${port}/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ ${label} RPC is up${NC}"
            return 0
        fi
        echo "Waiting for ${label}... (attempt $((attempts + 1))/${max_attempts})"
        sleep $HEALTH_CHECK_INTERVAL
        attempts=$((attempts + 1))
    done

    echo -e "${RED}✗ ${label} did not become healthy within ${CHAIN_NODE_HEALTH_TIMEOUT}s${NC}"
    return 1
}

# Query system_health JSON-RPC on a host-published port and print sync status.
print_chain_node_sync() {
    local label=$1
    local port=$2

    if ! curl -f "http://localhost:${port}/health" > /dev/null 2>&1; then
        echo -e "  ${label}: ${RED}down${NC}"
        return
    fi

    local resp
    resp=$(curl -s -H 'Content-Type: application/json' \
        -d '{"id":1,"jsonrpc":"2.0","method":"system_health","params":[]}' \
        "http://localhost:${port}" 2>/dev/null || true)

    if [ -z "$resp" ]; then
        echo -e "  ${label}: ${GREEN}up${NC} (system_health unavailable)"
        return
    fi

    echo -e "  ${label}: ${GREEN}up${NC} -> ${resp}"
}

# Get current active environment
get_current_env() {
    if grep -q "set \$app_servers blue" nginx/current_env.conf; then
        echo "blue"
    else
        echo "green"
    fi
}

# Get inactive environment
get_inactive_env() {
    current=$(get_current_env)
    if [ "$current" = "blue" ]; then
        echo "green"
    else
        echo "blue"
    fi
}

# Health check function
health_check() {
    local env=$1
    local port
    
    if [ "$env" = "blue" ]; then
        port=${BLUE_GQL_PORT:-4351}
    else
        port=${GREEN_GQL_PORT:-4352}
    fi
    
    echo "Checking health of $env environment on port $port..."
    
    local attempts=0
    local max_attempts=$((HEALTH_CHECK_TIMEOUT / HEALTH_CHECK_INTERVAL))
    
    while [ $attempts -lt $max_attempts ]; do
        if curl -f "http://localhost:$port/healthz" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ $env environment is healthy${NC}"
            return 0
        fi
        
        echo "Waiting for $env environment... (attempt $((attempts + 1))/$max_attempts)"
        sleep $HEALTH_CHECK_INTERVAL
        attempts=$((attempts + 1))
    done
    
    echo -e "${RED}✗ $env environment failed health check${NC}"
    return 1
}

# Initial setup
init() {
    local image_tag="$1"

    echo "Initializing blue-green deployment..."

    if [[ ! -f "${ENV_FILE}" ]]; then
        echo -e "${RED}Error: Environment file '${ENV_FILE}' not found.${NC}" >&2
        return 1
    fi

    mkdir -p nginx
    echo "set \$app_servers blue;" > nginx/current_env.conf

    prepare_chain_data_dir "${CHAIN_NODE_DATA_DIR}" "${CHAIN_NODE_IMAGE}" || return 1

    echo "Starting blue environment with version ${image_tag}"
    export BLUE_IMAGE_TAG="${image_tag}"

    docker compose --env-file "${ENV_FILE}" up -d blue-db blue-migration blue-graphql blue-processor nginx chain-node

    echo -e "${GREEN}✓ Success initializing blue-green deployment${NC}"
}

set_public_port() {
    local new_port=$1

    echo "Changing nginx public port..."

    export PUBLIC_PORT=$new_port
    docker compose --env-file ${ENV_FILE} up -d nginx

    echo -e "${GREEN}✓ Success changin port to ${new_port}"
}

# Initial setup
clean_all() {
    echo "Removing all containers..."

    docker compose --env-file ${ENV_FILE} down 

    echo -e "${GREEN}✓ Success removing all containers"
}

# Remove target environment
remove_environment() {
    local target_env=$1
    
    echo "Stopping $target_env environment..."

    docker compose --env-file ${ENV_FILE} stop ${target_env}-graphql ${target_env}-processor ${target_env}-migration ${target_env}-db
    docker compose --env-file ${ENV_FILE} rm -f ${target_env}-graphql ${target_env}-processor ${target_env}-migration ${target_env}-db
}

# Start target environment
start_environment() {
    local target_env=$1

    echo "Starting $target_env environment with new image..."

    docker compose --env-file ${ENV_FILE} up -d ${target_env}-db ${target_env}-migration ${target_env}-graphql ${target_env}-processor
}

# Switch traffic function
switch_traffic() {
    local target_env=$1
    echo -e "${BLUE}Switching traffic to $target_env environment...${NC}"
    
    echo "set \$app_servers $target_env;" > nginx/current_env.conf
    
    # Reload nginx configuration
    docker compose --env-file ${ENV_FILE} exec nginx nginx -s reload
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Traffic switched to $target_env${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to switch traffic${NC}"
        return 1
    fi
}

# Rollback function
rollback() {
    local previous_env=$1
    echo -e "${RED}Rolling back to $previous_env environment...${NC}"
    switch_traffic $previous_env
}

# Main deployment function
#
# Usage:
#   deploy <image-tag>              # normal runtime upgrade
#   deploy <image-tag> --boot-node  # breaking / new-genesis chain node deploy
#                                     # (CHAIN_NODE_NEXT_IMAGE / CHAIN_NEXT_SPEC in ENV_FILE)
deploy() {
    local new_image_tag=$1
    shift || true

    local boot_node=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --boot-node)
                boot_node=true
                shift
                ;;
            *)
                echo -e "${RED}Unknown deploy option: $1${NC}"
                echo "Usage: $0 deploy <image-tag> [--boot-node]"
                exit 1
                ;;
        esac
    done

    if [ -z "$new_image_tag" ]; then
        echo "Usage: $0 deploy <image-tag> [--boot-node]"
        exit 1
    fi

    if [ "$boot_node" = true ]; then
        deploy_with_boot_node "$new_image_tag"
        return $?
    fi

    # Refuse a normal deploy while a boot-node transition is pending: the target
    # color is wired to chain-node-next and the orchestration is mid-flight.
    if [ -n "$BOOTNODE_TARGET_ENV" ]; then
        echo -e "${RED}✗ A boot-node deployment is in progress (target: ${BOOTNODE_TARGET_ENV}).${NC}"
        echo "Finish it with 'promote-chain-node' or cancel it with 'abort-chain-node' first."
        exit 1
    fi

    local current_env=$(get_current_env)
    local target_env=$(get_inactive_env)
    
    echo -e "${BLUE}Starting blue-green deployment...${NC}"
    echo "Current active environment: $current_env"
    echo "Deploying to: $target_env"
    echo "New image tag: $new_image_tag"
    
    # Update the image tag for the target environment
    if [ "$target_env" = "blue" ]; then
        export BLUE_IMAGE_TAG=$new_image_tag
    else
        export GREEN_IMAGE_TAG=$new_image_tag
    fi
    
    # Stop and remove the target environment services
    remove_environment $target_env
    
    # Start the target environment
    start_environment $target_env
    
    # Health check the new environment
    if health_check $target_env; then
        echo -e "${GREEN}✓ New environment is working correctly${NC}"
        echo -e "Next: verify, then '${BLUE}$0 switch ${target_env}${NC}' to send traffic to it."
    else
        echo -e "${RED}✗ Deployment failed - new environment is not healthy${NC}"
        exit 1
    fi
}

# Boot-node (breaking / new-genesis) deployment.
#
# Spins up the temporary chain-node-next running the NEW node image, points the
# inactive ("target") indexer environment at it, and lets that env re-index the
# new chain from scratch - all while the live environment keeps serving from the
# untouched canonical chain-node. Nothing is switched automatically; once the
# target env is healthy you:  switch <target>  ->  promote-chain-node.
deploy_with_boot_node() {
    local new_image_tag=$1

    if [ -n "$BOOTNODE_TARGET_ENV" ]; then
        echo -e "${RED}✗ A boot-node deployment is already in progress (target: ${BOOTNODE_TARGET_ENV}).${NC}"
        echo "Finish it with 'promote-chain-node' or cancel it with 'abort-chain-node' first."
        exit 1
    fi

    load_env

    if [ -z "$CHAIN_NODE_NEXT_IMAGE" ]; then
        echo -e "${RED}✗ CHAIN_NODE_NEXT_IMAGE is not set in ${ENV_FILE}.${NC}"
        exit 1
    fi
    if [ -z "$CHAIN_NEXT_SPEC" ]; then
        echo -e "${RED}✗ CHAIN_NEXT_SPEC is not set in ${ENV_FILE}.${NC}"
        exit 1
    fi

    local current_env=$(get_current_env)
    local target_env=$(get_inactive_env)

    echo -e "${BLUE}Starting BOOT-NODE deployment (new chain genesis)...${NC}"
    echo "Current active environment : $current_env  (stays on canonical chain-node)"
    echo "Target environment         : $target_env  (will index the NEW chain)"
    echo "Indexer image tag          : $new_image_tag"
    echo "New chain node image       : ${CHAIN_NODE_NEXT_IMAGE}  (from ${ENV_FILE})"
    echo "New chain spec             : ${CHAIN_NEXT_SPEC}  (from ${ENV_FILE})"

    # Prepare a fresh data dir for the new chain and bring up chain-node-next.
    # sudo because a leftover dir may be owned by the chain node's UID.
    sudo rm -rf "$(abs_deploy_path "${CHAIN_NODE_NEXT_DATA_DIR}")"
    prepare_chain_data_dir "${CHAIN_NODE_NEXT_DATA_DIR}" "${CHAIN_NODE_NEXT_IMAGE}" || exit 1

    echo "Starting chain-node-next (new chain)..."
    docker compose --env-file "${ENV_FILE}" --profile bootnode up -d chain-node-next

    if ! wait_for_chain_node "chain-node-next" 9945; then
        echo -e "${RED}✗ chain-node-next failed to come up. Aborting boot-node deploy.${NC}"
        docker compose --env-file "${ENV_FILE}" --profile bootnode rm -sf chain-node-next || true
        sudo rm -rf "$(abs_deploy_path "${CHAIN_NODE_NEXT_DATA_DIR}")" || true
        echo "Run '$0 abort-chain-node' if any partial state remains."
        exit 1
    fi

    # Persist transient state so a later 'promote-chain-node' knows what to do.
    echo "BOOTNODE_TARGET_ENV=${target_env}" > "${BOOTNODE_STATE_FILE}"
    load_env

    # Point the target env at the new image and (re)create it. Its DB is
    # ephemeral, so it re-indexes the new chain from START_BLOCK automatically.
    if [ "$target_env" = "blue" ]; then
        export BLUE_IMAGE_TAG=$new_image_tag
    else
        export GREEN_IMAGE_TAG=$new_image_tag
    fi

    remove_environment "$target_env"
    start_environment "$target_env"

    echo -e "${YELLOW}Note: chain-node-next may still be syncing the new chain.${NC}"
    echo "      The target indexer will catch up as the node syncs."

    if health_check "$target_env"; then
        echo -e "${GREEN}✓ Target environment ($target_env) is up against the new chain${NC}"
        echo ""
        echo -e "${BLUE}Next steps:${NC}"
        echo "  1. Watch sync:    $0 chain-node-status"
        echo "  2. Verify env:    $0 logs $target_env processor"
        echo "  3. Switch traffic: $0 switch $target_env"
        echo "  4. Promote node:  $0 promote-chain-node"
        echo "  (or cancel with:  $0 abort-chain-node)"
    else
        echo -e "${RED}✗ Target environment failed health check${NC}"
        echo "Inspect logs, then either retry or run '$0 abort-chain-node'."
        exit 1
    fi
}

# Promote chain-node-next to become the canonical chain-node, then tear down the
# temporary node and the now-incompatible old environment - returning the stack
# to its normal single-chain-node shape.
promote_chain_node() {
    if [ -z "$BOOTNODE_TARGET_ENV" ]; then
        echo -e "${RED}✗ No boot-node deployment in progress - nothing to promote.${NC}"
        exit 1
    fi

    local target_env=$BOOTNODE_TARGET_ENV
    local old_env
    if [ "$target_env" = "blue" ]; then old_env="green"; else old_env="blue"; fi

    # Safety: live traffic must already be on the new env. We never switch
    # traffic automatically here - that's a deliberate, separate manual step.
    local current_env=$(get_current_env)
    if [ "$current_env" != "$target_env" ]; then
        echo -e "${RED}✗ Live traffic is still on '${current_env}', not the new env '${target_env}'.${NC}"
        echo "Switch traffic manually first, then promote:"
        echo "  $0 switch ${target_env}"
        echo "  $0 promote-chain-node"
        exit 1
    fi

    echo -e "${BLUE}Promoting chain-node-next -> chain-node...${NC}"
    echo "Target (new) env: $target_env   Old env to retire: $old_env"

    # Stop both nodes so we can atomically swap the data directory.
    echo "Stopping chain nodes..."
    docker compose --env-file "${ENV_FILE}" --profile bootnode stop chain-node chain-node-next

    echo "Swapping chain data: ${CHAIN_NODE_NEXT_DATA_DIR} -> ${CHAIN_NODE_DATA_DIR}"
    sudo rm -rf "$(abs_deploy_path "${CHAIN_NODE_DATA_DIR}")"
    sudo mv "$(abs_deploy_path "${CHAIN_NODE_NEXT_DATA_DIR}")" "$(abs_deploy_path "${CHAIN_NODE_DATA_DIR}")"

    # The new image/spec become the canonical chain node for THIS run. They are
    # exported so the recreate below uses them; persisting them permanently is a
    # manual step (see the reminder printed at the end).
    local promoted_image="${CHAIN_NODE_NEXT_IMAGE}"
    local promoted_spec="${CHAIN_NEXT_SPEC}"

    # Clear the transient transition state and reload: per-color RPC overrides
    # disappear (both colors point back at the canonical chain-node).
    rm -f "${BOOTNODE_STATE_FILE}"
    load_env

    export CHAIN_NODE_IMAGE="${promoted_image}"
    export CHAIN_SPEC="${promoted_spec}"

    echo "Recreating canonical chain-node with the promoted image/data..."
    docker compose --env-file "${ENV_FILE}" up -d chain-node

    if ! wait_for_chain_node "chain-node" 9944; then
        echo -e "${RED}✗ Promoted chain-node did not come up. Investigate before proceeding.${NC}"
        exit 1
    fi

    # Recreate the live (target) processor so it picks up the canonical RPC
    # endpoint again (brief ingestion reconnect; GraphQL keeps serving).
    echo "Re-pointing ${target_env} processor at canonical chain-node..."
    docker compose --env-file "${ENV_FILE}" up -d ${target_env}-processor

    # The old env indexed the previous chain with the previous image and is now
    # incompatible. Retire it; the next normal deploy recreates it cleanly.
    echo "Retiring incompatible old environment ($old_env)..."
    remove_environment "$old_env"

    # Destroy the temporary node service/container.
    echo "Destroying chain-node-next..."
    docker compose --env-file "${ENV_FILE}" --profile bootnode rm -sf chain-node-next

    echo -e "${GREEN}✓ Promotion complete. chain-node now runs ${promoted_image} (spec: ${promoted_spec}).${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: persist the new chain node settings in ${ENV_FILE} so future${NC}"
    echo -e "${YELLOW}operations keep using them:${NC}"
    echo "  CHAIN_NODE_IMAGE=${promoted_image}"
    echo "  CHAIN_SPEC=${promoted_spec}"
    echo ""
    echo -e "${YELLOW}The '${old_env}' environment was retired; deploy to it normally to restore full blue-green redundancy.${NC}"
}

# Cancel an in-progress boot-node deployment BEFORE promotion. Tears down
# chain-node-next and the half-deployed target env, leaving the live env and the
# canonical chain-node untouched.
abort_chain_node() {
    if [ -z "$BOOTNODE_TARGET_ENV" ]; then
        echo -e "${RED}✗ No boot-node deployment in progress - nothing to abort.${NC}"
        exit 1
    fi

    local target_env=$BOOTNODE_TARGET_ENV
    local current_env=$(get_current_env)

    if [ "$current_env" = "$target_env" ]; then
        echo -e "${RED}✗ Live traffic is on the new env '${target_env}'.${NC}"
        echo "Switch back to the old env first ('$0 switch $(get_inactive_env)'), then abort."
        exit 1
    fi

    echo -e "${YELLOW}Aborting boot-node deployment (target: ${target_env})...${NC}"

    # Remove the half-deployed target env (it indexed the new chain).
    remove_environment "$target_env"

    # Destroy chain-node-next and its data.
    docker compose --env-file "${ENV_FILE}" --profile bootnode rm -sf chain-node-next
    sudo rm -rf "$(abs_deploy_path "${CHAIN_NODE_NEXT_DATA_DIR}")"

    # Clear transient state; canonical chain-node was never touched.
    rm -f "${BOOTNODE_STATE_FILE}"
    load_env

    echo -e "${GREEN}✓ Boot-node deployment aborted. Live env '${current_env}' untouched.${NC}"
    echo -e "${YELLOW}Re-deploy normally to '${target_env}' to restore full blue-green redundancy.${NC}"
}

# Show chain-node / chain-node-next health, sync status, and transition state.
chain_node_status() {
    echo -e "${BLUE}Chain node status${NC}"
    print_chain_node_sync "chain-node      (canonical, :9944)" 9944

    if [ -n "$BOOTNODE_TARGET_ENV" ]; then
        print_chain_node_sync "chain-node-next (temporary, :9945)" 9945
        echo ""
        echo -e "${YELLOW}Boot-node deployment IN PROGRESS:${NC}"
        echo "  Target env      : ${BOOTNODE_TARGET_ENV}"
        echo "  New chain image : ${CHAIN_NODE_NEXT_IMAGE}"
        [ -n "$CHAIN_NEXT_SPEC" ] && echo "  New chain spec  : ${CHAIN_NEXT_SPEC}"
        echo "  Promote with    : $0 promote-chain-node"
        echo "  Cancel with     : $0 abort-chain-node"
    else
        echo -e "  ${GREEN}No boot-node deployment in progress.${NC}"
        echo "  Canonical image : ${CHAIN_NODE_IMAGE}"
        [ -n "$CHAIN_SPEC" ] && echo "  Canonical spec  : ${CHAIN_SPEC}"
    fi
}

# Show current status
status() {
    local current_env=$(get_current_env)
    echo "Current active environment: $current_env"
    echo "Health status:"
    
    # Check both environments
    for env in blue green; do
        local port
        if [ "$env" = "blue" ]; then
            port=${BLUE_GQL_PORT:-4351}
        else
            port=${GREEN_GQL_PORT:-4352}
        fi
        
        if curl -f "http://localhost:$port/healthz" > /dev/null 2>&1; then
            if [ "$env" = "$current_env" ]; then
                echo -e "  $env: ${GREEN}healthy (active)${NC}"
            else
                echo -e "  $env: ${GREEN}healthy${NC}"
            fi
        else
            echo -e "  $env: ${RED}unhealthy${NC}"
        fi
    done
}

# Switch manually between environments
switch() {
    local target_env=$1
    
    if [ "$target_env" != "blue" ] && [ "$target_env" != "green" ]; then
        echo "Usage: $0 switch <blue|green>"
        exit 1
    fi
    
    local current_env=$(get_current_env)
    
    if [ "$current_env" = "$target_env" ]; then
        echo "Already running on $target_env environment"
        exit 0
    fi
    
    # Health check target environment first
    if health_check $target_env; then
        switch_traffic $target_env
        echo -e "${GREEN}✓ Switched to $target_env environment${NC}"
    else
        echo -e "${RED}✗ Cannot switch to $target_env - environment is not healthy${NC}"
        exit 1
    fi
}

# Stop single environment
stop_env() {
    local target_env=$1

    if [ "$target_env" != "blue" ] && [ "$target_env" != "green" ]; then
        echo -e "${RED}✗ Invalid environment: $target_env${NC}"
        echo "Usage: $0 stop <blue|green>"
        exit 1
    fi

    echo "Stopping $target_env environment..."
    docker compose --env-file ${ENV_FILE} stop ${target_env}-graphql ${target_env}-processor ${target_env}-migration ${target_env}-db
    echo -e "${GREEN}✓ $target_env environment stopped${NC}"
}

# Stop all environments (including nginx)
stop_all() {
    echo "Stopping all environments (blue + green + nginx + chain-node[-next])..."
    docker compose --env-file ${ENV_FILE} --profile bootnode stop blue-graphql blue-processor blue-migration blue-db green-graphql green-processor green-migration green-db nginx chain-node chain-node-next
    echo -e "${GREEN}✓ All environments stopped${NC}"
}

# Restart single environment
restart_env() {
    local target_env=$1

    if [ "$target_env" != "blue" ] && [ "$target_env" != "green" ]; then
        echo -e "${RED}✗ Invalid environment: $target_env${NC}"
        echo "Usage: $0 restart <blue|green>"
        exit 1
    fi

    echo "Restarting $target_env environment..."

    docker compose --env-file ${ENV_FILE} stop ${target_env}-graphql ${target_env}-processor ${target_env}-migration ${target_env}-db
    docker compose --env-file ${ENV_FILE} up -d ${target_env}-db ${target_env}-migration ${target_env}-graphql ${target_env}-processor

    echo -e "${GREEN}✓ $target_env environment restarted${NC}"
}

# Restart all environments (including nginx)
restart_all() {
    echo "Restarting all environments (blue + green + nginx + chain-node)..."

    docker compose --env-file ${ENV_FILE} --profile bootnode stop blue-graphql blue-processor blue-migration blue-db green-graphql green-processor green-migration green-db nginx chain-node chain-node-next
    docker compose --env-file ${ENV_FILE} up -d blue-db blue-migration blue-graphql blue-processor green-db green-migration green-graphql green-processor nginx chain-node

    # If a boot-node deployment is mid-flight, bring its temporary node back too.
    if [ -n "$BOOTNODE_TARGET_ENV" ]; then
        echo "Boot-node deployment in progress - restarting chain-node-next..."
        docker compose --env-file ${ENV_FILE} --profile bootnode up -d chain-node-next
    fi

    echo -e "${GREEN}✓ All environments restarted${NC}"
}

# Monitor logs for an environment, a specific service, or all — with optional --since
logs() {
    local target_env=$1
    local service=""
    local since=""

    # Parse arguments
    shift
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --since)
                since=$2
                shift 2
                ;;
            *)
                if [ -z "$service" ]; then
                    service=$1
                fi
                shift
                ;;
        esac
    done

    if [ -z "$target_env" ]; then
        echo "Usage: $0 logs <blue|green|all> [service] [--since <duration>]"
        echo "Examples:"
        echo "  $0 logs blue"
        echo "  $0 logs green api"
        echo "  $0 logs all --since 10m"
        echo "  $0 logs all api --since 1h"
        exit 1
    fi

    local since_arg=""
    if [ -n "$since" ]; then
        since_arg="--since $since"
    fi

    case "$target_env" in
        blue|green)
            if [ -n "$service" ]; then
                echo -e "${BLUE}Streaming logs for $target_env-$service ${since:+(since $since)}...${NC}"
                docker compose --env-file ${ENV_FILE} logs -f $since_arg ${target_env}-${service}
            else
                echo -e "${BLUE}Streaming logs for all $target_env services ${since:+(since $since)}...${NC}"
                docker compose --env-file ${ENV_FILE} logs -f $since_arg ${target_env}-graphql ${target_env}-processor ${target_env}-migration ${target_env}-db
            fi
            ;;
        all)
            if [ -n "$service" ]; then
                echo -e "${BLUE}Streaming logs for all environments ($service only) ${since:+(since $since)}...${NC}"
                docker compose --env-file ${ENV_FILE} logs -f $since_arg blue-${service} green-${service}
            else
                echo -e "${BLUE}Streaming logs for all environments (all services) ${since:+(since $since)}...${NC}"
                docker compose --env-file ${ENV_FILE} logs -f $since_arg blue-graphql blue-processor blue-migration blue-db green-graphql green-processor green-migration green-db
            fi
            ;;
        *)
            echo -e "${RED}Invalid environment: $target_env. Must be 'blue', 'green', or 'all'.${NC}"
            exit 1
            ;;
    esac
}

# 🏗️ Build Docker image for the subsquid indexer
build() {
    local provided_tag=$1
    local tag=""

    # Check if user provided a tag
    if [ -n "$provided_tag" ]; then
        tag="$provided_tag"
        echo -e "${BLUE}Using provided tag: $tag${NC}"
    else
        # Try to get the latest git tag
        # This only works if your tag is an annotated tag otherwise it will fail.
        if git describe --tags --abbrev=0 >/dev/null 2>&1; then
            tag=$(git describe --tags --abbrev=0)
            echo -e "${BLUE}No tag provided. Using latest Git tag: $tag${NC}"
        else
            tag="latest"
            echo -e "${YELLOW}No tag found in Git. Using fallback tag: $tag${NC}"
        fi
    fi

    echo -e "${BLUE}Building Docker image: quantus-subsquid-public:$tag${NC}"
    docker build -t quantus-subsquid-public:$tag .
}

# Main script logic
case "$1" in
    "build")
        build $2
        ;;
    "init")
        init $2
        ;;
    "deploy")
        deploy "${@:2}"
        ;;
    "promote-chain-node")
        promote_chain_node
        ;;
    "abort-chain-node")
        abort_chain_node
        ;;
    "chain-node-status")
        chain_node_status
        ;;
    "status")
        status
        ;;
    "switch")
        switch $2
        ;;
    "set-port")
        set_public_port $2
        ;;
    "remove")
        remove_environment $2
        ;;
    "clean-all")
        clean_all
        ;;
    "stop")
        stop_env $2
        ;;
    "stop-all")
        stop_all
        ;;
    "restart")
        restart_env $2
        ;;
    "restart-all")
        restart_all
        ;;
    "logs")
        logs $2 ${@:3}
        ;;
    *)
        echo "Commands:"
        echo "  build [tag]                                    - Build docker image with provided tag or default to latest tag"
        echo "  init <tag>                                     - Initial green-blue deployment"
        echo "  deploy <tag>                                   - Normal deploy (runtime upgrade) to the inactive env"
        echo "  deploy <tag> --boot-node                       - Boot-node deploy: bring up chain-node-next using"
        echo "                                                   CHAIN_NODE_NEXT_IMAGE / CHAIN_NEXT_SPEC from ${ENV_FILE}"
        echo "  promote-chain-node                             - Promote chain-node-next -> chain-node, retire old env"
        echo "                                                    (requires traffic already switched to the new env)"
        echo "  abort-chain-node                               - Cancel an in-progress boot-node deploy"
        echo "  chain-node-status                              - Show chain node health/sync + transition state"
        echo "  status                                         - Show current environment status"
        echo "  switch <env>                                   - Switch between blue and green environments"
        echo "  set-port <env>                                 - Set nginx public port"
        echo "  remove <env>                                   - Remove existing environment"
        echo "  clean-all                                      - Remove all existing containers"
        echo "  stop <env>                                     - Stop specific env"
        echo "  stop-all                                       - Stop all exisiting containers"
        echo "  restart <env>                                  - Restart specific env"
        echo "  restart-all                                    - Restart all exisiting containers"
        echo "  logs <env> [service] [--since=<datetime>]      - Show logs for all or just certain env"
        exit 1
        ;;
esac