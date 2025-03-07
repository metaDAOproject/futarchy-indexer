ALTER TABLE "proposal_details" ADD COLUMN "proposal_index" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_daos" ADD COLUMN "organization_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "v0_4_daos" ADD CONSTRAINT "v0_4_daos_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
