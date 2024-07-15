CREATE TABLE IF NOT EXISTS "user_performance" (
	"proposal_acct" varchar(44) NOT NULL,
	"user_acct" varchar(44) NOT NULL,
	"tokens_bought" numeric(40, 20),
	"tokens_sold" numeric(40, 20),
	"volume_bought" numeric(40, 20),
	"volume_sold" numeric(40, 20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_performance_proposal_acct_user_acct_pk" PRIMARY KEY("proposal_acct","user_acct")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_performance" ADD CONSTRAINT "user_performance_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_performance" ADD CONSTRAINT "user_performance_user_acct_users_user_acct_fk" FOREIGN KEY ("user_acct") REFERENCES "users"("user_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
