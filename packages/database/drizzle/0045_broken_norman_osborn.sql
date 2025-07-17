ALTER TABLE "v0_5_conditional_vaults" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "v0_5_conditional_vaults" CASCADE;--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "v0_5_launches" ALTER COLUMN "squads_multisig_vault" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_5_launches" ALTER COLUMN "squads_multisig" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_5_launches" ALTER COLUMN "monthly_spending_limit_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_5_launches" ALTER COLUMN "committed_amount" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_merges" ADD CONSTRAINT "v0_5_merges_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("vault_addr") REFERENCES "public"."v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_metric_decisions" ADD CONSTRAINT "v0_5_metric_decisions_outcome_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("outcome_vault_addr") REFERENCES "public"."v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_5_metric_decisions" ADD CONSTRAINT "v0_5_metric_decisions_metric_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("metric_vault_addr") REFERENCES "public"."v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
