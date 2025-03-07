CREATE TABLE IF NOT EXISTS "v0_4_claims" (
	"claim_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"launch_addr" varchar(44) NOT NULL,
	"funder_addr" varchar(44) NOT NULL,
	"tokens_claimed" numeric(20, 0) NOT NULL,
	"funding_record_addr" varchar(44) NOT NULL,
	"slot" bigint NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "v0_4_funding_records" (
	"funding_record_addr" varchar(44) PRIMARY KEY NOT NULL,
	"launch_addr" varchar(44) NOT NULL,
	"funder_addr" varchar(44) NOT NULL,
	"committed_amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_claims" ADD CONSTRAINT "v0_4_claims_launch_addr_v0_4_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_4_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_claims" ADD CONSTRAINT "v0_4_claims_funding_record_addr_v0_4_funding_records_funding_record_addr_fk" FOREIGN KEY ("funding_record_addr") REFERENCES "public"."v0_4_funding_records"("funding_record_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_funding_records" ADD CONSTRAINT "v0_4_funding_records_launch_addr_v0_4_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_4_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
