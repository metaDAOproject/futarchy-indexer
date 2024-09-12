CREATE TABLE IF NOT EXISTS "v0_4_questions" (
	"question_addr" varchar(44) PRIMARY KEY NOT NULL,
	"is_resolved" boolean NOT NULL,
	"oracle_addr" varchar(44) NOT NULL,
	"num_outcomes" smallint NOT NULL,
	"payout_numerators" jsonb NOT NULL,
	"payout_denominator" bigint NOT NULL,
	"question_id" jsonb NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_swaps" (
	"signature" varchar(88) PRIMARY KEY NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"swap_type" varchar NOT NULL,
	"amm_addr" varchar(44) NOT NULL,
	"user" varchar(44) NOT NULL,
	"input_amount" bigint NOT NULL,
	"output_amount" bigint NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
