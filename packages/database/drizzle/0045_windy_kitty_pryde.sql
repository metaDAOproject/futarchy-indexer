DROP INDEX IF EXISTS "v05_swaps_amm_index";--> statement-breakpoint
DROP INDEX IF EXISTS "v05_swaps_signature_index";--> statement-breakpoint
DROP INDEX IF EXISTS "v05_swaps_seq_num_amm_index";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_swaps_amm_index" ON "v0_5_swaps" USING btree ("amm_addr");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_swaps_signature_index" ON "v0_5_swaps" USING btree ("signature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "v0_5_swaps_seq_num_amm_index" ON "v0_5_swaps" USING btree ("amm_seq_num","amm_addr");