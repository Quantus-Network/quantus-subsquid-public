# Substrate Indexer Setup Guide

This guide will help you set up and run a Subsquid-based indexer for a Substrate chain. The indexer tracks balance transfers and can be extended to track other events and calls.

## Prerequisites

- Node.js (v16 or later)
- Docker

## Setup

1. Install dependencies:
```bash
npm install
```

Install sqd command line 

```bash
npm install -g @subsquid/cli
```

2. Create a `.env` file in the root directory with your RPC endpoint:
```
RPC_ENDPOINT=ws://localhost:9944  # For local node
# or
RPC_ENDPOINT=wss://your-testnet-endpoint  # For testnet
```

3. Generate types and code for your chain:
```bash
sqd typegen
sqd codegen
sqd build
```

## Running the Indexer

1. Start the database:

**Start retaining existing data**
```bash
sqd up
```

**Start clean (delete existing database):**
```bash
sqd down
sqd up
npx squid-typeorm-migration generate
sqd migration:clean
sqd migration:apply
```

2. Start the indexer

This will run the processor and serve GraphQL

```bash
sqd run
```

If you only want to start the processor but not the rest of the system, use this instead
```bash
sqd process
```

## Development

- The processor configuration is in `src/processor.ts`
- The GraphQL schema is in `schema.graphql`
- The database migrations are in `db/migrations`

## Current Features

- Tracks balance transfers
- Stores transfer amounts, fees, and account information
- Provides GraphQL API for querying the indexed data

### Reversible Transfers

This indexer also tracks the full lifecycle of reversible transfers:
- **Scheduled**: When a new reversible transfer is created.
- **Executed**: When a scheduled transfer is successfully completed.
- **Cancelled**: When a scheduled transfer is cancelled before execution.

The indexer creates or updates `ReversibleTransfer` entities in the database and creates a single `Event` entity when a transfer is first scheduled.

## Querying Data

The GraphQL server provides a flexible API for querying the indexed data. Here are a few examples:

## Extending

To add new events or calls to track:

1. Update the processor configuration in `src/processor.ts`
2. Update the GraphQL schema in `schema.graphql`
3. Generate new migrations:
```bash
sqd migration:generate
```

## Troubleshooting

If you encounter issues:

1. Make sure Docker is running
2. Check that your RPC endpoint is correct in `.env`
3. Try cleaning the database and starting fresh:
```bash
sqd down
sqd up
sqd migration:clean
sqd migration:apply

or 
sqd down && sqd up && sqd migration:clean && sqd migration:apply
```

## In case we need to redo this - how to create a new subsquid project

1. Install Subsquid CLI globally:
```bash
npm install -g @subsquid/cli
```

2. Initialize a new Subsquid project:
```bash
sqd init substrate-indexer --template substrate
cd substrate-indexer
```


## Additional Resources

For more detailed information about the project structure and advanced features, please refer to the [original README](substrate-indexer/README.md) in the substrate-indexer directory.

## License

[Add your license information here] 
