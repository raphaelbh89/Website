DROP INDEX IF EXISTS "content_types_scope_site_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "taxonomies_scope_site_key_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "content_entries_single_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "content_entries_published_slug_unique_idx";--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_content_entry_revisions_entry_id_id') THEN
    ALTER TABLE "content_entry_revisions" ADD CONSTRAINT "uq_content_entry_revisions_entry_id_id" UNIQUE("entry_id","id");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_content_entries_current_rev') THEN
    ALTER TABLE "content_entries" ADD CONSTRAINT "fk_content_entries_current_rev" FOREIGN KEY ("id","current_revision_id") REFERENCES "public"."content_entry_revisions"("entry_id","id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_content_entries_published_rev') THEN
    ALTER TABLE "content_entries" ADD CONSTRAINT "fk_content_entries_published_rev" FOREIGN KEY ("id","published_revision_id") REFERENCES "public"."content_entry_revisions"("entry_id","id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_entries_single_unique_idx" ON "content_entries" USING btree ("site_id","content_type_id","locale") WHERE entry_kind = 'single';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_entries_published_slug_unique_idx" ON "content_entries" USING btree ("site_id","content_type_id","locale","published_slug") WHERE published_slug IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_types_scope_site_key_idx') THEN
    ALTER TABLE "content_types" ADD CONSTRAINT "content_types_scope_site_key_idx" UNIQUE NULLS NOT DISTINCT("scope_kind","site_id","key");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taxonomies_scope_site_key_idx') THEN
    ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_scope_site_key_idx" UNIQUE NULLS NOT DISTINCT("scope_kind","site_id","key");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ct_tax_terms_range') THEN
    ALTER TABLE "content_type_taxonomies" ADD CONSTRAINT "chk_ct_tax_terms_range" CHECK ("min_terms" >= 0 AND ("max_terms" IS NULL OR "max_terms" >= "min_terms"));
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_term_no_self_parent') THEN
    ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "chk_term_no_self_parent" CHECK ("parent_id" <> "id");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_term_depth_cap') THEN
    ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "chk_term_depth_cap" CHECK ("depth" >= 0 AND "depth" <= 5);
  END IF;
END $$;
