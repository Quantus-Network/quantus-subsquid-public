/**
 * Custom GraphQL resolvers:
 * - Privacy-preserving transfer queries using hash prefixes
 * - Wormhole deposit pool statistics for privacy score computation
 */

import { Arg, Field, InputType, Int, ObjectType, Query, Resolver } from "type-graphql";
import { EntityManager, Like, Or, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { Transfer, WormholeNullifier } from "../model";

/**
 * Input type for transfer prefix queries.
 */
@InputType()
export class TransfersByPrefixInput {
    /**
     * Hash prefixes for destination addresses (hex strings).
     * Transfers where toHash starts with any of these prefixes will be returned.
     */
    @Field(() => [String], { nullable: true })
    toHashPrefixes?: string[];

    /**
     * Hash prefixes for source addresses (hex strings).
     * Transfers where fromHash starts with any of these prefixes will be returned.
     */
    @Field(() => [String], { nullable: true })
    fromHashPrefixes?: string[];

    /**
     * Minimum block number (inclusive).
     */
    @Field(() => Int, { nullable: true })
    afterBlock?: number;

    /**
     * Maximum block number (inclusive).
     */
    @Field(() => Int, { nullable: true })
    beforeBlock?: number;

    /**
     * Minimum transfer amount (inclusive).
     */
    @Field(() => BigInt, { nullable: true })
    minAmount?: bigint;

    /**
     * Maximum transfer amount (inclusive).
     */
    @Field(() => BigInt, { nullable: true })
    maxAmount?: bigint;

    /**
     * Maximum number of results to return.
     * If more results match, an error is returned asking the client to use longer prefixes.
     * Default: 100, Max: 1000
     */
    @Field(() => Int, { nullable: true, defaultValue: 100 })
    limit?: number;

    /**
     * Offset for pagination.
     */
    @Field(() => Int, { nullable: true, defaultValue: 0 })
    offset?: number;
}

/**
 * Transfer result type including the hash fields.
 */
@ObjectType()
export class TransferWithHash {
    @Field()
    id!: string;

    @Field()
    blockId!: string;

    @Field(() => Int)
    blockHeight!: number;

    @Field()
    timestamp!: Date;

    @Field({ nullable: true })
    extrinsicHash?: string;

    @Field()
    fromId!: string;

    @Field()
    toId!: string;

    @Field(() => BigInt)
    amount!: bigint;

    @Field(() => BigInt)
    fee!: bigint;

    @Field()
    fromHash!: string;

    @Field()
    toHash!: string;

    @Field(() => BigInt)
    leafIndex!: bigint;

    @Field(() => BigInt)
    transferCount!: bigint;
}

/**
 * Result type for prefix queries.
 */
@ObjectType()
export class TransfersByPrefixResult {
    @Field(() => [TransferWithHash])
    transfers!: TransferWithHash[];
}

const MAX_LIMIT = 1000;

@Resolver()
export class TransferPrefixResolver {
    constructor(private tx: () => Promise<EntityManager>) {}

    /**
     * Query transfers by hash prefix for privacy-preserving lookups.
     *
     * The prefix is matched against blake3(raw_address_bytes).
     * Shorter prefixes = more privacy (more results returned as noise).
     * Longer prefixes = less privacy but fewer false positives.
     *
     * At least one of toHashPrefixes or fromHashPrefixes must be provided.
     * If the query matches more than `limit` results, an error is returned
     * asking the client to use longer prefixes.
     */
    @Query(() => TransfersByPrefixResult)
    async transfersByHashPrefix(@Arg("input") input: TransfersByPrefixInput): Promise<TransfersByPrefixResult> {
        const {
            toHashPrefixes,
            fromHashPrefixes,
            afterBlock,
            beforeBlock,
            minAmount,
            maxAmount,
            limit = 100,
            offset = 0,
        } = input;

        // Validate inputs
        if (!toHashPrefixes?.length && !fromHashPrefixes?.length) {
            throw new Error("At least one of toHashPrefixes or fromHashPrefixes must be provided");
        }

        if (limit > MAX_LIMIT) {
            throw new Error(`Limit cannot exceed ${MAX_LIMIT}`);
        }

        if (limit < 1) {
            throw new Error("Limit must be at least 1");
        }

        // Validate prefix format (should be hex)
        const allPrefixes = [...(toHashPrefixes || []), ...(fromHashPrefixes || [])];
        for (const prefix of allPrefixes) {
            if (!/^[0-9a-fA-F]+$/.test(prefix)) {
                throw new Error(`Invalid prefix format: "${prefix}". Prefixes must be hexadecimal strings.`);
            }
        }

        const manager = await this.tx();

        // Build query
        // We need to query with OR across all prefixes:
        // WHERE (toHash LIKE 'prefix1%' OR toHash LIKE 'prefix2%' OR fromHash LIKE 'prefix3%' ...)
        // AND additional filters

        const prefixConditions: FindOptionsWhere<Transfer>[] = [];

        if (toHashPrefixes?.length) {
            for (const prefix of toHashPrefixes) {
                prefixConditions.push({ toHash: Like(`${prefix.toLowerCase()}%`) });
            }
        }

        if (fromHashPrefixes?.length) {
            for (const prefix of fromHashPrefixes) {
                prefixConditions.push({ fromHash: Like(`${prefix.toLowerCase()}%`) });
            }
        }

        // Build the query with TypeORM
        const queryBuilder = manager
            .createQueryBuilder(Transfer, "transfer")
            .leftJoinAndSelect("transfer.block", "block")
            .leftJoinAndSelect("transfer.from", "fromAccount")
            .leftJoinAndSelect("transfer.to", "toAccount");

        // Add prefix conditions (OR)
        if (prefixConditions.length > 0) {
            const prefixWhere = prefixConditions
                .map((_, i) => {
                    if (i < (toHashPrefixes?.length || 0)) {
                        return `LOWER(transfer.toHash) LIKE :prefix${i}`;
                    } else {
                        return `LOWER(transfer.fromHash) LIKE :prefix${i}`;
                    }
                })
                .join(" OR ");

            const prefixParams: Record<string, string> = {};
            let idx = 0;
            for (const prefix of toHashPrefixes || []) {
                prefixParams[`prefix${idx}`] = `${prefix.toLowerCase()}%`;
                idx++;
            }
            for (const prefix of fromHashPrefixes || []) {
                prefixParams[`prefix${idx}`] = `${prefix.toLowerCase()}%`;
                idx++;
            }

            queryBuilder.where(`(${prefixWhere})`, prefixParams);
        }

        // Add additional filters
        if (afterBlock !== undefined) {
            queryBuilder.andWhere("block.height >= :afterBlock", { afterBlock });
        }

        if (beforeBlock !== undefined) {
            queryBuilder.andWhere("block.height <= :beforeBlock", { beforeBlock });
        }

        if (minAmount !== undefined) {
            queryBuilder.andWhere("transfer.amount >= :minAmount", { minAmount: minAmount.toString() });
        }

        if (maxAmount !== undefined) {
            queryBuilder.andWhere("transfer.amount <= :maxAmount", { maxAmount: maxAmount.toString() });
        }

        // Order by timestamp descending (most recent first)
        queryBuilder.orderBy("transfer.timestamp", "DESC");

        // Execute query with pagination
        const transfers = await queryBuilder.skip(offset).take(limit).getMany();

        // Map to result type
        const result: TransferWithHash[] = transfers.map((t) => ({
            id: t.id,
            blockId: t.block.id,
            blockHeight: t.block.height,
            timestamp: t.timestamp,
            extrinsicHash: t.extrinsic?.id || undefined,
            fromId: t.from.id,
            toId: t.to.id,
            amount: t.amount,
            fee: t.fee,
            fromHash: t.fromHash,
            toHash: t.toHash,
            leafIndex: t.leafIndex,
            transferCount: t.transferCount,
        }));

        return {
            transfers: result,
        };
    }
}

// Note: DepositPoolStats and WormholeNullifier are also exposed via auto-generated GraphQL schema.
// Nullifiers can be queried by prefix using the custom resolver below.

/**
 * Input type for nullifier prefix queries.
 * The wallet computes blake3(nullifier) and queries by prefix to check if
 * its deposits have been spent, without revealing the exact nullifier.
 */
@InputType()
export class NullifiersByPrefixInput {
    /** Blake3 hash prefixes to search for (hex strings) */
    @Field(() => [String])
    hashPrefixes!: string[];

    /** Minimum block number (inclusive) */
    @Field(() => Int, { nullable: true })
    afterBlock?: number;
}

@ObjectType()
export class NullifierResult {
    @Field(() => String)
    nullifier!: string;

    @Field(() => String)
    nullifierHash!: string;

    @Field(() => String)
    extrinsicHash!: string;

    @Field(() => Int)
    blockHeight!: number;

    @Field(() => Date)
    timestamp!: Date;
}

@ObjectType()
export class NullifiersByPrefixResponse {
    @Field(() => [NullifierResult])
    nullifiers!: NullifierResult[];

    @Field(() => Int)
    totalCount!: number;
}

@Resolver()
export class NullifierPrefixResolver {
    constructor(private tx: () => Promise<EntityManager>) {}

    /**
     * Query consumed nullifiers by blake3 hash prefix.
     *
     * The wallet computes blake3(nullifier) for each of its deposits
     * and queries by prefix (e.g., first 4-8 hex chars) to check if
     * they've been spent. This preserves privacy by not revealing
     * the exact nullifier to the indexer.
     */
    @Query(() => NullifiersByPrefixResponse)
    async nullifiersByPrefix(@Arg("input") input: NullifiersByPrefixInput): Promise<NullifiersByPrefixResponse> {
        const manager = await this.tx();
        const { hashPrefixes, afterBlock } = input;

        if (!hashPrefixes?.length) {
            throw new Error("At least one hash prefix must be provided");
        }

        let query = manager
            .createQueryBuilder(WormholeNullifier, "n")
            .leftJoinAndSelect("n.wormholeExtrinsic", "wext")
            .leftJoinAndSelect("wext.extrinsic", "ext")
            .leftJoinAndSelect("n.block", "block");

        // Add prefix conditions
        const prefixConditions = hashPrefixes.map((_, i) => `LOWER(n.nullifier_hash) LIKE :prefix${i}`).join(" OR ");
        const params: Record<string, string> = {};
        hashPrefixes.forEach((prefix, i) => {
            params[`prefix${i}`] = `${prefix.toLowerCase()}%`;
        });
        query.where(`(${prefixConditions})`, params);

        if (afterBlock !== undefined) {
            query.andWhere("block.height >= :afterBlock", { afterBlock });
        }

        query.orderBy("block.height", "DESC");

        const [results, totalCount] = await query.getManyAndCount();

        return {
            nullifiers: results.map((n: any) => ({
                nullifier: n.nullifier,
                nullifierHash: n.nullifierHash,
                extrinsicHash: n.wormholeExtrinsic?.extrinsic?.id ?? "",
                blockHeight: n.block?.height ?? 0,
                timestamp: n.timestamp,
            })),
            totalCount,
        };
    }
}
