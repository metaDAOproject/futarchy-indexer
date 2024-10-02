ALTER TABLE "v0_4_merges" DROP CONSTRAINT IF EXISTS "v0_4_merges_pkey";--> statement-breakpoint
ALTER TABLE "v0_4_splits" DROP CONSTRAINT IF EXISTS "v0_4_splits_pkey";--> statement-breakpoint
ALTER TABLE "v0_4_merges" ADD CONSTRAINT "v0_4_merges_vault_addr_vault_seq_num_pk" PRIMARY KEY("vault_addr","vault_seq_num");--> statement-breakpoint
ALTER TABLE "v0_4_splits" ADD CONSTRAINT "v0_4_splits_vault_addr_vault_seq_num_pk" PRIMARY KEY("vault_addr","vault_seq_num");--> statement-breakpoint
ALTER TABLE "v0_4_merges" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
ALTER TABLE "v0_4_splits" DROP COLUMN IF EXISTS "id";