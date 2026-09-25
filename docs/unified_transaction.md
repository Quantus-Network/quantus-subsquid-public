# UnifiedTransaction

Denormalized explorer list entity for fast global and account offset pagination. Source typed entities (`Transfer`, reversible transfers, `WormholeExtrinsic`) remain the detail source of truth; this table is a dual-written projection filled during indexing (fresh deploy / full reindex).

`Transfer` rows are built from `Wormhole.NativeTransferred` (see [native_transfer.md](./native_transfer.md)). UnifiedTransaction projects each economic movement once with the correct `type` for detail routing.

## Fields

| Field | Meaning |
|-------|---------|
| `id` | Prefixed stable key: `immediate:{transferId}`, `scheduled-reversible:{id}`, `executed-reversible:{id}`, `cancelled-reversible:{id}`, `wormhole:{transferId}` (or `wormhole:{extId}` for aggregate fallback) |
| `type` | `IMMEDIATE` \| `SCHEDULED_REVERSIBLE` \| `EXECUTED_REVERSIBLE` \| `CANCELLED_REVERSIBLE` \| `WORMHOLE` |
| `hash` | Extrinsic id when present; **null** for unsigned paths (executed-reversible, miner/treasury mints) |
| `block` / `blockHeight` | Block reference and height |
| `timestamp` | Event timestamp |
| `from` / `to` | Parties. Set for Transfer-backed rows including wormhole exits. Null only for aggregate wormhole fallback. For executed/cancelled, taken from the linked scheduled transfer |
| `amount` / `fee` | Amount and fee; fee null for executed-reversible. Wormhole exits: prefer `Transfer.fee` when non-zero, else extrinsic fee once on the first output (by `leafIndex`), `0` on the rest (exits are mint paths so `Transfer.fee` is usually `0`) |
| `status` | `SUCCESS` / `ERROR` / `SCHEDULED` / `EXECUTED` / `CANCELLED` |
| `detailId` | Detail routing: transfer id, reversible `txId`, or wormhole extrinsic id |

## Classification (one row per movement)

Transfer-backed rows are classified in this order:

1. **Settlement** — `Transfer` linked as `ExecutedReversibleTransfer.executedTransfer` → omit from the list (appears only as `EXECUTED_REVERSIBLE`)
2. **Wormhole exit** — `Transfer.id` matches a `WormholeOutput.id` (same NativeTransferred id), or `Transfer.extrinsic.id` matches a `WormholeExtrinsic` → `WORMHOLE` with `from`/`to`/`amount` from the Transfer; `detailId` = wormhole extrinsic id. Output-id matching keeps exits typed `WORMHOLE` even when the Extrinsic entity is missing. Multi-output exits emit one row per output, sharing the same `detailId`. Fee: keep non-zero `Transfer.fee`, otherwise attribute `extrinsic.fee` to the first output only
3. **Else** → `IMMEDIATE` (normal transfers **and** miner/treasury mint NativeTransferreds with null `hash`)

Lifecycle rows stay separate: `SCHEDULED_REVERSIBLE`, `EXECUTED_REVERSIBLE`, `CANCELLED_REVERSIBLE`.

### Unsigned events

Extrinsic hash is not a universal join key:

| Case | Connect with | Unified row | `hash` |
|------|----------------|-------------|--------|
| Normal transfer | default | `IMMEDIATE` | extrinsic id |
| Wormhole exit | output id / extrinsic id ∈ wormhole | `WORMHOLE` | wormhole extrinsic id |
| Reversible execute | adjacent events / from-to-amount harden | `EXECUTED_REVERSIBLE` only | null |
| Miner / treasury | none (mint Transfer is enough) | `IMMEDIATE` | null |

Do not invent synthetic hashes. Clients route with `type` + `detailId` and treat null `hash` as inherent/scheduler activity.

### Fallbacks

- **Wormhole:** If a `WormholeExtrinsic` has no matching Transfer in the batch (no Transfer id among that exit's outputs, and no Extrinsic-id match), emit one aggregate `WORMHOLE` row (`from`/`to` null, `amount` = `totalAmount`). Defensive for missing Transfers only — not for Extrinsic-linkage gaps (those still match via `WormholeOutput.id`).
- **Reversible execute:** Primary link is `NativeTransferred`.

## Example queries

```graphql
# Landing / global list
query RecentTxs($limit: Int!, $offset: Int!) {
  unified_transaction(limit: $limit, offset: $offset, order_by: { timestamp: desc }) {
    id
    type
    hash
    block_height
    timestamp
    amount
    fee
    status
    detail_id
    from { id }
    to { id }
  }
  unified_transaction_aggregate {
    aggregate { count }
  }
}

# Account activity
query AccountTxs($account: String!, $limit: Int!, $offset: Int!) {
  unified_transaction(
    where: {
      _or: [
        { from: { id: { _eq: $account } } }
        { to: { id: { _eq: $account } } }
      ]
    }
    limit: $limit
    offset: $offset
    order_by: { timestamp: desc }
  ) {
    id
    type
    hash
    amount
    status
    detail_id
    timestamp
  }
}

# Filter by type
query ImmediateOnly($limit: Int!) {
  unified_transaction(
    where: { type: { _eq: IMMEDIATE } }
    limit: $limit
    order_by: { timestamp: desc }
  ) {
    id
    hash
    amount
    status
    detail_id
  }
}
```

Detail pages: route with `type` + `detail_id` (and `hash` when present) to the existing transfer / reversible / wormhole entities.
