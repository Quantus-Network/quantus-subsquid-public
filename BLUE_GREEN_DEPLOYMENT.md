# Guide to do Blue-Green Deployment

This is a short guide on how to do deployment. You can also use this for development but maybe it's too much.

## Build Squid Image

Before building the docker image, you need to release git tag. Beforehand, make sure main branch is already up to date.

### Release tag

We will need to release tag so we can run our github action to build the docker image for us.
The tag has to be an annotated tag like below,

```sh
git tag -a v0.0.1 -m "Subsquid accessing schrodinger quantus testnet with metadata v112"
```

Please adjust the value of tag and message accordingly. After you create the tag, we can push it using command bellow.

```sh
git push --follow-tags
```

### Run github action

After you create the annotated tag, just go to this [github page](https://github.com/Quantus-Network/quantus-subsquid-public/actions/workflows/quantus-subquid-docker-image.yml) and run the workflow using the correct tag you just released.

When it's done, we can continue to deploy it.

## Deployment

You can use the `deploy.sh` script to manage deployment.

```sh
./deploy.sh
```

## Switch Active Environment
```sh
./blue-green.sh switch <env>
```

You can switch between `blue` and `green` using this command.

## Chain node deployments

The blue and green indexer environments both read from a single canonical
`chain-node` service. There are two kinds of chain-related deployments:

### 1. Normal deploy (runtime upgrade, same chain)

When the chain only undergoes a runtime upgrade (same genesis / chain spec), the
existing `chain-node` keeps running and you just roll the indexer image:

```sh
./blue-green.sh deploy <image-tag>
./blue-green.sh switch <target-env>
```

Nothing special is required — this is the common case.

### 2. Boot-node deploy (breaking change / new genesis)

When you deploy a **new boot node** (a new node image that bootstraps a **new
chain with a different genesis/chain spec**), you must NOT recreate the shared
`chain-node` in place — that would starve the live indexer of blocks and bring
it down.

Instead, a temporary `chain-node-next` service is brought up alongside the
canonical node. It runs the new node image with its own data directory and host
ports (`9945`/`30334`/`9617`), so it can fully sync the new chain while the live
environment keeps serving from the untouched `chain-node`. The inactive
("target") indexer environment is pointed at `chain-node-next` and re-indexes
the new chain from scratch.

You only ever run two chain nodes during the transition window; once you promote,
the temporary node is destroyed and the stack returns to its normal shape.

#### Step by step

```sh
# 1. Set CHAIN_NODE_NEXT_IMAGE and CHAIN_NEXT_SPEC in .env.blue-green, then
#    start a boot-node deployment (or use ./deploy.sh --boot-node).
./blue-green.sh deploy <indexer-image-tag> --boot-node

# 2. Watch the new chain node sync and the target env catch up.
./blue-green.sh chain-node-status
./blue-green.sh logs <target-env> processor

# 3. When the target env is healthy and synced, send live traffic to it.
#    This is a deliberate manual step - promote will refuse until it's done.
./blue-green.sh switch <target-env>

# 4. Promote: chain-node-next becomes the canonical chain-node, the temporary
#    node is destroyed, and the old (incompatible) environment is retired.
./blue-green.sh promote-chain-node
```

To cancel before promoting (tears down `chain-node-next` and the half-deployed
target env, leaving the live env and canonical node untouched):

```sh
./blue-green.sh abort-chain-node
```

#### What `promote-chain-node` does

1. Refuses to run unless live traffic is already on the target env (run
   `switch <target-env>` first — promotion never switches traffic for you).
2. Stops `chain-node` and `chain-node-next`.
3. Atomically moves the fully-synced `./chain-node-data-next` onto
   `./chain-node-data` (same filesystem, instant; old data discarded).
4. Recreates `chain-node` with the promoted image + spec + data and waits for it
   to be healthy.
5. Re-points the live environment's processor back at the canonical
   `chain-node` (brief ingestion reconnect; GraphQL keeps serving throughout).
6. Retires the old environment (it indexed the previous chain with the previous
   image and is incompatible with the new chain). The next normal `deploy`
   recreates it and restores full blue-green redundancy.
7. Destroys the temporary `chain-node-next` service.

#### After promoting: persist the new chain settings

Promotion uses the new image/spec for the recreate, but does **not** write any
state file. To make the change permanent for future operations (restarts, normal
deploys, etc.), update `.env.blue-green` with the values printed at the end of
`promote-chain-node`:

```sh
CHAIN_NODE_IMAGE=<new-chain-image>
CHAIN_SPEC=<new-chain-spec>
```

#### Notes

- Because the per-environment Postgres services have **no persistent volume**,
  every deploy starts from a fresh database and re-indexes — so a new genesis is
  handled cleanly without any manual DB reset.
- Promotion requires live traffic to already be on the target env; there is no
  force/auto-switch — switch manually to avoid breaking the live service.
- The automated `deploy.sh` will refuse to run while a boot-node deployment is
  in progress (it detects `.chain-node-next.state`).
- The transient `.chain-node-next.state` file is gitignored.
