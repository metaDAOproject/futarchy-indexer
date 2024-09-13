CREATE TABLE IF NOT EXISTS "v0_4_metric_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"dao_id" bigint,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"outcome_question_addr" varchar(44) NOT NULL,
	"metric_question_addr" varchar(44) NOT NULL,
	"outcome_vault_addr" varchar(44) NOT NULL,
	"metric_vault_addr" varchar(44) NOT NULL,
	"amm_addr" varchar(44) NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_dao_id_dao_details_dao_id_fk" FOREIGN KEY ("dao_id") REFERENCES "dao_details"("dao_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_outcome_question_addr_v0_4_questions_question_addr_fk" FOREIGN KEY ("outcome_question_addr") REFERENCES "v0_4_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_metric_question_addr_v0_4_questions_question_addr_fk" FOREIGN KEY ("metric_question_addr") REFERENCES "v0_4_questions"("question_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_outcome_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("outcome_vault_addr") REFERENCES "v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_metric_vault_addr_v0_4_conditional_vaults_conditional_vault_addr_fk" FOREIGN KEY ("metric_vault_addr") REFERENCES "v0_4_conditional_vaults"("conditional_vault_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_metric_decisions" ADD CONSTRAINT "v0_4_metric_decisions_amm_addr_v0_4_amms_amm_addr_fk" FOREIGN KEY ("amm_addr") REFERENCES "v0_4_amms"("amm_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
