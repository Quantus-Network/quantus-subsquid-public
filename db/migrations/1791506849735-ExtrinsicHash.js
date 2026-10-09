module.exports = class ExtrinsicHash1791506849735 {
    name = 'ExtrinsicHash1791506849735'

    async up(db) {
        await db.query(`SET LOCAL statement_timeout = 0`)
        await db.query(`ALTER TABLE "extrinsic" ADD "hash" text`)
        await db.query(`UPDATE "extrinsic" SET "hash" = "id"`)
        await db.query(`ALTER TABLE "extrinsic" ALTER COLUMN "hash" SET NOT NULL`)
        await db.query(`CREATE INDEX "IDX_1f45de0713a55049009e8e8127" ON "extrinsic" ("hash") `)
    }

    async down(db) {
        await db.query(`DROP INDEX "public"."IDX_1f45de0713a55049009e8e8127"`)
        await db.query(`ALTER TABLE "extrinsic" DROP COLUMN "hash"`)
    }
}
