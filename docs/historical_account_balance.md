# Subsquid Indexer Development Notes

This document contains notes and patterns for extending the indexer.

## Tracking Historical Account Balances

Instead of trying to store only the *current* balance for an account (which requires complex and potentially slow storage lookups), a more robust pattern is to track the *history* of balance changes.

**Concept:**

We don't store a single `balance` field on the `Account` entity. Instead, we create a separate entity (e.g., `HistoricalBalance`) that represents a snapshot of an account's balance at a specific point in time (block number/timestamp).

**Implementation Steps:**

1.  **Schema (`schema.graphql`)**: 
    *   Define an `Account` entity (likely just with `id`).
    *   Define a new entity, e.g., `HistoricalBalance`:
        ```graphql
        type HistoricalBalance @entity {
          id: ID! # e.g., "accountId-blockNumber"
          account: Account! @index
          timestamp: DateTime!
          blockNumber: Int! @index
          free: BigInt!      # Or separate fields: free, reserved, etc.
          reserved: BigInt!
          # Add other relevant balance types if needed
          event: String # Optional: Record which event triggered this snapshot
        }
        
        type Account @entity {
          id: ID!
          balanceSnapshots: [HistoricalBalance!] @derivedFrom(field: "account")
        }
        ```
    *   Adjust the `Transfer` entity if needed (it might not need direct balance fields if all lookups go via `HistoricalBalance`).

2.  **Processor (`processor.ts`)**: 
    *   Subscribe to *all* events that can change an account's balance. This typically includes:
        *   `balances.Transfer`
        *   `balances.BalanceSet`
        *   `balances.Deposit`
        *   `balances.Withdraw`
        *   `balances.Reserved`
        *   `balances.Unreserved`
        *   `balances.Slashed`
        *   `balances.DustLost`
        *   ...(potentially others depending on the chain's pallets)

3.  **Codegen & Migration**: 
    *   Run `npx sqd codegen` to update TypeORM models based on the new schema.
    *   Run `npx sqd migration:generate AddHistoricalBalance` (or similar) to create the database migration file.

4.  **Mapping Logic (`main.ts`)**: 
    *   Inside the main `processor.run` loop:
        *   For each relevant event affecting an `accountId`:
            1.  **Fetch Previous State**: Query the database for the *most recent* `HistoricalBalance` record for that `accountId` where `blockNumber < currentEventBlockNumber`.
            2.  **Calculate New State**: Based on the event type and data (e.g., subtract transfer amount, use `BalanceSet` values directly, add deposit amount), calculate the new `free`, `reserved`, etc., balances using the fetched previous state as the starting point. If no previous state exists (first time account is seen), assume starting balances are zero.
            3.  **Create New Snapshot**: Create a *new* `HistoricalBalance` entity instance with the calculated balances, the current event's `blockNumber` and `timestamp`, and link it to the `Account`.
            4.  **Save**: Upsert the `Account` (if it was newly created) and insert the *new* `HistoricalBalance` record into the store (`ctx.store`).

**Benefits of this Pattern:**

*   Provides a full history of balance changes.
*   Avoids complex/slow direct storage lookups (`system.account`) during indexing.
*   Relies only on event data and previously stored state.
*   Often more performant for the indexer.

**Considerations:**

*   Requires careful handling of all relevant balance-changing events.
*   Database size will grow larger as snapshots are stored for each change.
*   Querying the *current* balance requires fetching the latest `HistoricalBalance` record for an account. 