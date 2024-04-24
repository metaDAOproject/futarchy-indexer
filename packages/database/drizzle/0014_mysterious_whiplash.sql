ALTER TABLE "programs" ALTER COLUMN "version" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "dao_details" ADD COLUMN "slug" varchar;--> statement-breakpoint
ALTER TABLE "proposal_details" ADD COLUMN "slug" varchar;--> statement-breakpoint
ALTER TABLE "dao_details" ADD CONSTRAINT "dao_details_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "proposal_details" ADD CONSTRAINT "proposal_details_slug_unique" UNIQUE("slug");