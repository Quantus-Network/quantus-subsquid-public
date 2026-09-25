# Quick Install & Run Guide for Quantus Subsquid Indexer

This guide provides the simplest steps to get the Quantus Subsquid indexer up and running on your server after cloning the repository.

## 1. Prerequisites

Make sure you have the following installed on your server:
*   **Node.js**: Version 16.x or newer.
*   **Docker**: To run the PostgreSQL database.
*   **Git**: To clone the repository.

## 2. Getting Started

First, clone the repository and navigate into the project directory:

```bash
git clone https://github.com/Quantus-Network/quantus-subsquid-public.git
cd quantus-subsquid-public
```

## 3. Configuration: RPC Endpoint

The indexer needs to connect to your Substrate node.
1.  Create a file named `.env` in the current `quantus-subsquid-public` directory (which is your project root).
2.  Add the following line to it, replacing `wss://your-rpc-endpoint:443` with your actual node's RPC endpoint:

    ```env
    RPC_KUSAMA_HTTP=wss://your-rpc-endpoint:443
    ```
    *Example for a local node running on the default port:*
    ```env
    RPC_KUSAMA_HTTP=ws://127.0.0.1:9944
    ```

## 4. Install Dependencies

Install the necessary Node.js packages:

```bash
npm install
```

(This will also install the Subsquid CLI tools needed for the following steps, making them available via `npx sqd ...`.)

## 5. Running for the First Time (Initial Sync & GraphQL API)

This section covers starting everything from a clean slate.

1.  **Start the Database**:
    ```bash
    npx sqd up
    ```

2.  **Generate Initial Database Schema (Important First Step)**:
    Before running the indexer for the very first time, or if you've changed `schema.graphql`, it's crucial to generate the database migration files. These files tell the database how to create the necessary tables.
    ```bash
    npx sqd migration:generate InitialSetup
    ```
    (You only *need* to run `migration:generate` when the `schema.graphql` changes or for the initial setup if no migrations exist. The name `InitialSetup` is just an example.)

3.  **Build, Apply Migrations, Run Processor & API**:
    The `npx sqd run` command is comprehensive. It will:
    *   Build your indexer code (from `src/*.ts` to `lib/*.js`).
    *   Automatically check for and apply any pending database migrations (like the `InitialSetup` one we just generated if it's the first time).
    *   Start the indexer (processor) to begin syncing data from the chain.
    *   Start the GraphQL API server.

    ```bash
    npx sqd run
    ```
    The processor will start syncing from block 0 (as defined in `src/processor.ts` by default for a fresh start). This initial sync can take a long time depending on the chain's history. The GraphQL API will become available at `http://localhost:4350/graphql` once the API server part of `sqd run` starts.

    You can run this command in a terminal multiplexer like `screen` or `tmux` to keep it running in the background on your server.

## 6. Checking the GraphQL API

Once `npx sqd run` is active and the API has started (you'll see a log line like `[api] ... listening on port 4350`), you can access the GraphiQL interface in your browser at:
`http://localhost:4350/graphql` (or your server's IP address if running remotely).

## 7. Stopping and Resuming Normal Operation

*   **To Stop**: Press `Ctrl+C` in the terminal where `npx sqd run` is active. If running in `screen` or `tmux`, detach and then kill the `sqd run` process.
*   **To Resume**: Simply navigate back to the `quantus-subsquid-public` directory and run:
    ```bash
    npx sqd run
    ```
    The indexer will automatically pick up from the last block it successfully processed, as this state is stored in the database. You do **not** need to run `sqd down` or `migration:apply` for a normal resume.

## 8. How to Resync (Full Reset - Wipe All Data)

Use this if you need to clear all indexed data and start the sync completely from scratch (e.g., after critical schema changes or if you suspect data corruption).

1.  **Stop the running indexer** (see section 7).
2.  **Take down the database (this wipes its data)**:
    ```bash
    npx sqd down
    ```
3.  **Start the database fresh**:
    ```bash
    npx sqd up
    ```
4.  **Ensure processor is set to sync from beginning**: Check `src/processor.ts` and make sure `.setBlockRange({ from: 0 })` is active (or that no `setBlockRange` is specified that would limit it).
5.  **Re-apply database migrations**: This creates a fresh schema in the new empty database.
    ```bash
    npx sqd migration:apply
    ```
    *(Note: `sqd migration:generate` is not usually needed here unless `schema.graphql` changed and you didn't generate migrations for it yet. `migration:apply` uses existing migration files.)*
6.  **Restart the indexer and API**:
    ```bash
    npx sqd run
    ```

## 9. How to Resync from the Last 1000 Blocks

If you only want to re-index recent history, for example, the last 1000 blocks (perhaps after a short downtime or to quickly get recent data on a new setup without a full history sync):

1.  **Stop the running indexer** (see section 7).
2.  **Wipe the database (Recommended for a clean partial sync)**:
    ```bash
    npx sqd down
    npx sqd up
    npx sqd migration:apply # Recreate schema in the empty DB
    ```
3.  **Modify the processor configuration**:
    *   Open the file `src/processor.ts`.
    *   Find the `.setBlockRange(...)` call. If it exists and is `from: 0`, change it. If it doesn't exist, add it.
    *   Set it to `from: -1000`:
        ```typescript
        // Add this chainable call to your processor definition if not present, or modify existing
        .setBlockRange({
            from: -1000 // Process blocks from (current_head - 1000)
        })
        ```
    *   Save the file.
4.  **Build and Restart the indexer and API**:
    ```bash
    npx sqd build  # Ensure code changes from processor.ts are compiled
    npx sqd run
    ```
    The indexer will start fetching blocks from roughly 1000 blocks behind the current chain tip.

5.  **Important - After Partial Sync to Resume Full Syncing**:
    Once the "-1000 blocks" sync has caught up to the chain tip, if you want the indexer to *continue syncing all new blocks indefinitely*, you MUST:
    *   Stop the indexer.
    *   Modify `src/processor.ts` again. Change `.setBlockRange({ from: -1000 })` back to `.setBlockRange({ from: 0 })` (or remove the `.setBlockRange()` call entirely if you want it to pick up from where the -1000 sync finished and then just follow the chain tip).
    *   Save `src/processor.ts`.
    *   Restart the indexer: `npx sqd build && npx sqd run`. It will now continue from where it left off and process new blocks.

This guide should help a newcomer get the indexer running.

## 10. More questions?
If something is not working well, use Gemini 2.5 Pro to read this file and tell you what to do ;) - it's really good at subsquid.

## 11. Metadata

Squid typegen is set to run on the metadata

Regenerate chain metadata with this 
```sh
npm run meta:update
```

## 11. Overview of the Architecture

Understanding the main parts of your Subsquid indexer can help you know what's going on:

*   **Processor (`src/processor.ts`)**:
    *   This is the workhorse that connects to your Substrate node (defined by `RPC_KUSAMA_HTTP` in your `.env` file).
    *   It's configured to ask for specific data from the blockchain, like certain events (e.g., balance transfers) or function calls.
    *   It fetches this raw data in batches.

*   **Mapping Logic (`src/main.ts`)**:
    *   The processor sends the raw data it fetched to this script.
    *   The code here (which you can customize) transforms the raw, often complex, blockchain data into a more usable format.
    *   For example, it decodes event details, converts addresses to the correct human-readable format (using the SS58 prefix we discussed), and prepares the data to be saved.

*   **Schema (`schema.graphql`)**:
    *   This file is like a blueprint for your database.
    *   You define what your final, indexed data should look like: what entities (e.g., `Account`, `Transfer`), what fields each entity has (e.g., `id`, `amount`, `timestamp`), and their types (e.g., `String`, `BigInt`, `DateTime`).
    *   This schema is also used to automatically generate the structure of your GraphQL API.

*   **Database (PostgreSQL)**:
    *   A PostgreSQL database (managed by Docker via `npx sqd up` and `npx sqd down`) stores all the processed and structured data that your mapping logic (`src/main.ts`) saves.
    *   The tables and columns in this database are created based on your `schema.graphql` definition, via migration files.

*   **Migrations (`db/migrations/`)**:
    *   When you change `schema.graphql` or for the initial setup, you run `npx sqd migration:generate <MigrationName>`.
    *   This creates JavaScript files in the `db/migrations/` folder. These files contain the SQL commands to create or alter your database tables to match your schema.
    *   `npx sqd run` (or `npx sqd migration:apply`) executes these files to update the database structure.

*   **Typegen (`npx sqd typegen`)**:
    *   This command connects to your chain, inspects its metadata, and generates TypeScript definitions for all the events, calls, and storage items available on your specific chain.
    *   These generated types (in the `src/types/` folder) are used in `src/main.ts` to help you work with blockchain data in a type-safe way, making your mapping code more reliable and easier to write.

*   **GraphQL API Server**:
    *   When you run `npx sqd run`, it also starts a GraphQL server (usually on port 4350).
    *   This server reads data directly from your PostgreSQL database.
    *   It automatically provides a GraphQL API that matches the structure defined in your `schema.graphql`, allowing you (or other applications) to query the indexed data efficiently.

*   **Subsquid CLI (`npx sqd ...`)**:
    *   This is the command-line tool that ties everything together. You use it to:
        *   Start/stop the database (`up`, `down`).
        *   Generate database migrations (`migration:generate`).
        *   Apply migrations (`migration:apply`).
        *   Generate types from your chain (`typegen`).
        *   Build your code and run the processor and API server (`run`, `build`, `process`).

**How they interact (simplified flow):**
1.  `Processor` fetches raw block data from your node.
2.  `Processor` gives this data to your `Mapping Logic` (`main.ts`).
3.  `Mapping Logic` (using `Typegen` types) cleans, transforms, and structures the data according to your `Schema`.
4.  `Mapping Logic` saves this structured data into the `Database`.
5.  The `GraphQL API Server` reads from the `Database` and lets you query the data using GraphQL.
6.  The `Subsquid CLI` is used to manage all these steps.