CREATE TABLE IF NOT EXISTS "organizations" (
	"organization_id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar,
	"url" varchar,
	"description" text,
	"image_url" varchar,
	"creator_acct" varchar(44),
	"admin_accts" jsonb,
	"is_hide" boolean,
	"socials" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_unique" UNIQUE("name"),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_url_unique" UNIQUE("url")
	-- CONSTRAINT "id_name_url" UNIQUE("organization_id","url","name")
);
--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "organization_id" bigint;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "organization_id" bigint;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "colors" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dao_details" ADD CONSTRAINT "dao_details_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
