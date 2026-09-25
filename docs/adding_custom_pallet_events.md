# Adding Custom Pallet Events to the Indexer

This guide outlines the general process for adding event indexing from a new custom Substrate pallet to your Subsquid indexer, using the `ReversibilityCore` pallet (responsible for deferred/reversible transactions) as an example.

## Example: `ReversibilityCore` Pallet Events

From the pallet code, we identified the following events:

1.  `ReversibilitySet { who, delay, policy }`
2.  `TransactionScheduled { who, tx_id, execute_at }`
3.  `TransactionCancelled { who, tx_id }`
4.  `TransactionExecuted { tx_id, result }`

## General Steps to Add New Pallet Event Indexing

Here's a breakdown of the steps involved:

### 1. Define Data Structures (`schema.graphql`)

Decide how you want to store the data from these events in your database. You'll likely create new entities for each event type or for the objects they represent.

*Example for `ReversibilityCore` events:*

```graphql
# In schema.graphql

# Represents an account's reversibility setting
# You might already have an Account entity from balance transfers
# type Account @entity { id: ID! ... }

type ReversibilitySetting @entity {
  id: ID! # e.g., accountId-blockNumber or event.id
  account: Account! @index
  delay: BigInt! # Assuming block number is BigInt
  policy: String! # Store DelayPolicy enum as String (e.g., "Explicit", "Intercept")
  timestamp: DateTime!
  blockNumber: Int!
}

type ScheduledTransaction @entity {
  id: ID! # This would be the tx_id (T::Hash as a String)
  schedulerAccount: Account! @index # The 'who' that scheduled it
  # call: String # Storing the full call might be complex; consider key details or hash
  executeAtBlock: BigInt! # From DispatchTime<BlockNumberFor<T>>
  executeAtTimestamp: DateTime # If DispatchTime also implies a timestamp
  status: String! # e.g., "Scheduled", "Executed", "Cancelled"
  createdAt: DateTime!
  createdBlock: Int!
  updatedAt: DateTime! # To track cancellations/executions
}

# You might not need separate entities for Cancelled/Executed if you update ScheduledTransaction
# But if they have unique data, create them:

# type CancelledTransaction @entity { ... }
# type ExecutedTransaction @entity { ... }

# Ensure your Transfer entity (if different) is also defined
# type Transfer @entity { ... }
```

**Notes:**
*   Choose appropriate types for your fields (e.g., `T::Hash` becomes `String`, `BlockNumberFor<T>` becomes `BigInt` or `Int`).
*   Consider how you'll link these to existing entities like `Account`.
*   The `id` for these new entities should be unique. Event IDs (`event.id`) or transaction hashes (`tx_id`) are good candidates.

### 2. Configure Type Generation (`typegen.json`)

Tell Subsquid's type generator which pallet and its items (events, calls, storage, constants) you're interested in. While a basic `typegen.json` is created when you initialize a project, you **must manually edit it** to include your custom pallet or specific items from standard pallets that aren't included by default.

*Example for `ReversibilityCore`:*
Assuming your pallet is named `ReversibilityCore` in the runtime metadata:

```json
// In typegen.json, within the "pallets" object:
{
  // ... other global settings like outDir, specVersions ...
  "pallets": {
    // ... other pallets like Balances ...
    "ReversibilityCore": { // Use the actual pallet name from metadata
      "events": [
        "ReversibilitySet",
        "TransactionScheduled",
        "TransactionCancelled",
        "TransactionExecuted"
      ],
      "calls": [], // Add calls (extrinsics) by name if you need to decode their arguments
      "storage": [ // Add storage item names if you need to query them during indexing
        // e.g., "ReversibleAccounts", "PendingTransfers"
      ],
      "constants": [] // Add constant names if you need their values during indexing
    }
    // ... other pallets ...
  }
}
```

### 3. Generate Types (`npx sqd typegen`)

Run the type generator to create TypeScript definitions for these new events and their data structures. This will update files in your `src/types/` directory.

```bash
npx sqd typegen
```

### 4. Generate Models (`npx sqd codegen`)

Update your TypeORM entity models based on the changes you made to `schema.graphql`.

```bash
npx sqd codegen
```
This updates files in `src/model/generated/`.

### 5. Update Processor Subscription (`processor.ts`)

Tell the Subsquid processor to subscribe to these new events (and calls, if you added any to `typegen.json` and want to process them).

*Example for `ReversibilityCore` events:*

```typescript
// In src/processor.ts, within .addEvent({ name: [...] }) or .addCall({ name: [...] })

// Make sure to import the event/call names from the generated types:
// e.g., import {events as reversibilityEvents} from './types/reversibilityCore' // Path depends on typegen output

// Example for events:
// ... existing event subscriptions ...
events.reversibilityCore.reversibilitySet.name,
events.reversibilityCore.transactionScheduled.name,
events.reversibilityCore.transactionCancelled.name,
events.reversibilityCore.transactionExecuted.name,
// ... existing event subscriptions ...
```
*(The exact path to `events.reversibilityCore...` will depend on your `typegen.json` and output structure. You might need to import from `src/types` directly if they are merged there.)*

### 6. Implement Handler Logic (`main.ts`)

This is where you process the raw event (or call) data and save it to your database using the entities you defined.

*   In your main `processor.run(..., async (ctx) => { ... })` loop:
    *   Iterate through `ctx.blocks` and `block.events` (and/or `block.calls`).
    *   Add `if/else if` blocks to check for your new event/call names.
    *   Inside each block:
        1.  **Decode Data**: Use the generated decoder for the specific event/call and spec version.
        2.  **Prepare Data**: Extract useful data. Convert types as needed (e.g., `AccountId` to SS58 string, `BlockNumber` to `BigInt`).
        3.  **Query Storage (If Configured & Needed)**: If you configured storage items in `typegen.json` and generated types for them, you can use the generated helpers (e.g., `await ctx.storage.reversibilityCore.reversibleAccounts.get(accountId, block.header.hash)`) to fetch on-chain state at that specific block to enrich your entity.
        4.  **Create/Update Entities**: 
            *   Fetch related entities if necessary (e.g., get or create an `Account` for `who`).
            *   Create an instance of your new entity (e.g., `new ReversibilitySetting({ ... })`).
            *   For stateful updates (e.g., updating status of a `ScheduledTransaction`), fetch the existing entity, modify it, and save it.
        5.  **Store Data**: Use `ctx.store.save(...)` or `ctx.store.insert(...)` for new entities, and `ctx.store.save(...)` or `ctx.store.upsert(...)` for updated entities.

*Example snippet for `ReversibilitySet` event:*
```typescript
// Inside the event loop in main.ts
else if (event.name === events.reversibilityCore.reversibilitySet.name) {
    // Assuming types.events.reversibilityCore.reversibilitySet is available
    // The actual version (e.g., v1, v9130) depends on your chain's metadata
    if (events.reversibilityCore.reversibilitySet.vYOUR_SPEC_VERSION.is(event)) {
        const decoded = events.reversibilityCore.reversibilitySet.vYOUR_SPEC_VERSION.decode(event);
        const accountId = ss58.codec(42).encode(decoded.who); // Use your SS58 prefix
        
        let account = await ctx.store.get(Account, accountId);
        if (!account) {
            account = new Account({id: accountId});
            // Potentially initialize other Account fields if you have them
            await ctx.store.insert(account);
        }

        const setting = new ReversibilitySetting({
            id: event.id, // Or another unique ID like `${accountId}-${block.header.height}`
            account: account,
            delay: BigInt(decoded.delay.toString()), // Ensure conversion to BigInt
            policy: decoded.policy.toString(), // Convert enum to string
            timestamp: new Date(block.header.timestamp!),
            blockNumber: block.header.height,
        });
        await ctx.store.insert(setting);
    }
}
```

### 7. Generate Database Migration (`npx sqd migration:generate ...`)

After all code changes (schema, models, handlers), generate a new database migration to reflect the new tables/columns needed for your new entities.

```bash
npx sqd migration:generate AddReversibilityCoreEntities
```
(Replace `AddReversibilityCoreEntities` with a descriptive name for your migration.)

### 8. Apply Migrations and Test

1.  **Stop** any running indexer.
2.  **Apply migrations**: `npx sqd migration:apply` (or `npx sqd run` will do this automatically).
3.  **Build and Run**: `npx sqd build && npx sqd run`.
4.  **Test**: Trigger the new events on your chain and verify they are indexed correctly by querying your GraphQL API.

This provides a structured approach to extending your indexer for new pallet events. 