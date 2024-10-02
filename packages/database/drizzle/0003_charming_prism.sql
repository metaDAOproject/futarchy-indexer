CREATE TABLE IF NOT EXISTS "v0_4_merges" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vault_addr" varchar(44) NOT NULL,
	"vault_seq_num" bigint,
	"signature" varchar(88) NOT NULL,
	"slot" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_splits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vault_addr" varchar(44) NOT NULL,
	"vault_seq_num" bigint,
	"signature" varchar(88) NOT NULL,
	"slot" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'v0_4_swaps'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "v0_4_swaps" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "v0_4_swaps" ADD COLUMN "id" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_swaps" ADD COLUMN "amm_seq_num" bigint NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_vault_index" ON "v0_4_merges" ("vault_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_signature_index" ON "v0_4_merges" ("signature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merge_seq_num_vault_index" ON "v0_4_merges" ("vault_seq_num","vault_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "split_vault_index" ON "v0_4_splits" ("vault_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "split_signature_index" ON "v0_4_splits" ("signature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "split_seq_num_vault_index" ON "v0_4_splits" ("vault_seq_num","vault_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "amm_index" ON "v0_4_swaps" ("amm_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signature_index" ON "v0_4_swaps" ("signature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seq_num_amm_index" ON "v0_4_swaps" ("amm_seq_num","amm_addr");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_merges" ADD CONSTRAINT "v0_4_merges_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("vault_addr") REFERENCES "v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_merges" ADD CONSTRAINT "v0_4_merges_signature_signatures_signature_fk" FOREIGN KEY ("signature") REFERENCES "signatures"("signature") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_merges" ADD CONSTRAINT "v0_4_merges_slot_signatures_slot_fk" FOREIGN KEY ("slot") REFERENCES "signatures"("slot") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_splits" ADD CONSTRAINT "v0_4_splits_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("vault_addr") REFERENCES "v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_splits" ADD CONSTRAINT "v0_4_splits_signature_signatures_signature_fk" FOREIGN KEY ("signature") REFERENCES "signatures"("signature") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_splits" ADD CONSTRAINT "v0_4_splits_slot_signatures_slot_fk" FOREIGN KEY ("slot") REFERENCES "signatures"("slot") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
