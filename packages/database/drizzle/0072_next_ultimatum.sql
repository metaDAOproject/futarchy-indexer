-- ALTER TABLE "v0_4_amm" DROP CONSTRAINT "v0_4_amm_latest_signature_applied_signatures_signature_fk";
--> statement-breakpoint
ALTER TABLE "v0_4_amm" ADD COLUMN "latest_seq_num_applied" bigint NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_amm" ADD CONSTRAINT "v0_4_amm_latest_seq_num_applied_signatures_sequence_num_fk" FOREIGN KEY ("latest_seq_num_applied") REFERENCES "signatures"("sequence_num") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "v0_4_amm" DROP COLUMN IF EXISTS "latest_signature_applied";