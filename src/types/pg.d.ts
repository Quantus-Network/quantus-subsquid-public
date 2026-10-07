// pg 8.16 ships no TypeScript types. This covers the pool used by the supply server.
declare module "pg" {
    export interface PoolConfig {
        max?: number;
        connectionString?: string;
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
        ssl?:
            | boolean
            | {
                  ca?: string;
                  cert?: string;
                  key?: string;
                  rejectUnauthorized?: boolean;
              };
    }

    export class Pool {
        constructor(config?: PoolConfig);
        query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ value?: unknown }> }>;
        on(event: "error", listener: (error: Error) => void): void;
    }
}
