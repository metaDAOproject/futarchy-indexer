DROP INDEX IF EXISTS "created_at_index";--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'signatures'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

ALTER TABLE "signatures" DROP CONSTRAINT "signatures_pkey";--> statement-breakpoint
-- ALTER TABLE "signatures" DROP PRIMARY KEY;
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signature_queried_addr_pk" PRIMARY KEY("signature","queried_addr");--> statement-breakpoint
ALTER TABLE "signatures" ADD COLUMN "sequence_num" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequence_num_index" ON "signatures" ("sequence_num");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queried_addr_index" ON "signatures" ("queried_addr");