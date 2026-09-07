CREATE TABLE "content_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"content_type_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"translation_group_id" uuid NOT NULL,
	"entry_kind" text NOT NULL,
	"current_revision_id" uuid,
	"published_revision_id" uuid,
	"published_slug" text,
	"lifecycle_state" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_entry_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"title" text NOT NULL,
	"slug" text,
	"data" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"scope_kind" text NOT NULL,
	"site_id" uuid,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"data_schema" jsonb NOT NULL,
	"ui_schema" jsonb,
	"capabilities" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_content_type_id_content_types_id_fk" FOREIGN KEY ("content_type_id") REFERENCES "public"."content_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entry_revisions" ADD CONSTRAINT "content_entry_revisions_entry_id_content_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."content_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_entry_revisions" ADD CONSTRAINT "content_entry_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_types" ADD CONSTRAINT "content_types_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_entries_site_type_locale_idx" ON "content_entries" USING btree ("site_id","content_type_id","locale","lifecycle_state");--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_translation_locale_unique_idx" ON "content_entries" USING btree ("translation_group_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_single_unique_idx" ON "content_entries" USING btree ("site_id","content_type_id","locale") WHERE "entry_kind" = 'single';--> statement-breakpoint
CREATE UNIQUE INDEX "content_entries_published_slug_unique_idx" ON "content_entries" USING btree ("site_id","content_type_id","locale","published_slug") WHERE "published_slug" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "content_entry_revisions_entry_version_unique_idx" ON "content_entry_revisions" USING btree ("entry_id","version_number");--> statement-breakpoint
CREATE INDEX "content_entry_revisions_entry_created_idx" ON "content_entry_revisions" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "content_types_site_id_idx" ON "content_types" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_types_scope_site_key_idx" ON "content_types" USING btree ("scope_kind","site_id","key") NULLS NOT DISTINCT;