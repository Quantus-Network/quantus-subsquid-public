# Setup Substrate Indexer

## Configuration Files

The config files are a bit all over the place, these are the most important.

`typegen.json` - define which blockchain data you want to capture (events, storage, etc)

`schema.graphql` - define what graphQL entities exist

`.env` - define the RPC endpoint to connect to

`processor.ts` - define the batch processing parameters for the substrate indexer

`main.ts` - block processing code which grabs blockchain data and dumps it into graphQL data

## When the config changes, generate new code

If you've changed `schema.graphql` or `typegen.json`, you'll likely need to regenerate code and update your database schema.

1.  **Stop any running squid processes** (e.g., `sqd process`, `sqd run`).

2.  **(Optional) Reset your database to clear old data:**
    *   To completely remove old data and start fresh with new containers:
        ```bash
        sqd down
        sqd up
        ```
    *   Alternatively, if your database container is running and you only want to clear the tables managed by the squid:
        ```bash
        sqd migration:clean
        ```

3.  **Generate TypeORM entity classes** (from `schema.graphql`):
    ```bash
    sqd codegen
    ```

4.  **Generate chain data access types** (from `typegen.json` and chain metadata):
    ```bash
    sqd typegen
    ```
    *(Remember: If you changed `typegen.json` to point to a local node or different spec versions, ensure you've run `npx squid-substrate-metadata-explorer ...` if needed). This updates the file localMeta.jsonl which is used by typegen.json to process
    the chain's metadata*

5.  **Generate a new database migration script:**
    ```bash
    sqd migration:generate YourMigrationName
    ```
    (Replace `YourMigrationName` with a descriptive name, e.g., `AddBalanceFieldsToAccount`).

6.  **Apply the database migrations:**
    ```bash
    sqd migration:apply
    ```

7.  **Change processor.ts and main.ts as needed**

For example to create new DB entries, process new events, etc.


After these steps, you can rebuild and restart your processor and GraphQL server (e.g., `sqd build`, then `sqd run` or `sqd process` & `sqd serve`).


