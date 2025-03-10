ALTER TABLE "v0_4_funds" DROP COLUMN IF EXISTS "fund_id";--> statement-breakpoint
ALTER TABLE "v0_4_funds" ADD COLUMN "funding_record_addr" varchar(44) NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_funds" ADD COLUMN "funding_record_seq_num" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_funds" ADD CONSTRAINT "v0_4_funds_funding_record_addr_funding_record_seq_num_pk" PRIMARY KEY("funding_record_addr","funding_record_seq_num");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_funds" ADD CONSTRAINT "v0_4_funds_funding_record_addr_v0_4_funding_records_funding_record_addr_fk" FOREIGN KEY ("funding_record_addr") REFERENCES "public"."v0_4_funding_records"("funding_record_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "v0_4_claims" DROP COLUMN IF EXISTS "claim_id";--> statement-breakpoint
ALTER TABLE "v0_4_refunds" DROP COLUMN IF EXISTS "refund_id";--> statement-breakpoint
ALTER TABLE "v0_4_claims" ADD PRIMARY KEY ("funding_record_addr");--> statement-breakpoint
ALTER TABLE "v0_4_refunds" ADD COLUMN "funding_record_addr" varchar(44) PRIMARY KEY NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_refunds" ADD CONSTRAINT "v0_4_refunds_funding_record_addr_v0_4_funding_records_funding_record_addr_fk" FOREIGN KEY ("funding_record_addr") REFERENCES "public"."v0_4_funding_records"("funding_record_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;