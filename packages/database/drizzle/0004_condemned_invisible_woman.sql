CREATE TABLE "content_revision_terms" (
	"revision_id" uuid NOT NULL,
	"taxonomy_term_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "content_revision_terms_revision_id_taxonomy_term_id_pk" PRIMARY KEY("revision_id","taxonomy_term_id")
);
--> statement-breakpoint
CREATE TABLE "content_type_taxonomies" (
	"content_type_id" uuid NOT NULL,
	"taxonomy_id" uuid NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"min_terms" integer DEFAULT 0 NOT NULL,
	"max_terms" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "content_type_taxonomies_content_type_id_taxonomy_id_pk" PRIMARY KEY("content_type_id","taxonomy_id")
);
--> statement-breakpoint
CREATE TABLE "taxonomies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scope_kind" text NOT NULL,
	"site_id" uuid,
	"is_hierarchical" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"taxonomy_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"parent_id" uuid,
	"depth" integer DEFAULT 0 NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_revision_terms" ADD CONSTRAINT "content_revision_terms_revision_id_content_entry_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_entry_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision_terms" ADD CONSTRAINT "content_revision_terms_taxonomy_term_id_taxonomy_terms_id_fk" FOREIGN KEY ("taxonomy_term_id") REFERENCES "public"."taxonomy_terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_type_taxonomies" ADD CONSTRAINT "content_type_taxonomies_content_type_id_content_types_id_fk" FOREIGN KEY ("content_type_id") REFERENCES "public"."content_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_type_taxonomies" ADD CONSTRAINT "content_type_taxonomies_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "taxonomy_terms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_revision_terms_revision_idx" ON "content_revision_terms" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "content_revision_terms_term_idx" ON "content_revision_terms" USING btree ("taxonomy_term_id");--> statement-breakpoint
CREATE INDEX "taxonomies_site_id_idx" ON "taxonomies" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomies_scope_site_key_idx" ON "taxonomies" USING btree ("scope_kind","site_id","key") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_terms_site_tax_key_unique_idx" ON "taxonomy_terms" USING btree ("site_id","taxonomy_id","key");--> statement-breakpoint
CREATE INDEX "taxonomy_terms_parent_id_idx" ON "taxonomy_terms" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "taxonomy_terms_tax_site_active_idx" ON "taxonomy_terms" USING btree ("taxonomy_id","site_id","is_active");--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "chk_term_no_self_parent" CHECK ("parent_id" <> "id");--> statement-breakpoint
ALTER TABLE "taxonomy_terms" ADD CONSTRAINT "chk_term_depth_cap" CHECK ("depth" >= 0 AND "depth" <= 5);--> statement-breakpoint
ALTER TABLE "content_type_taxonomies" ADD CONSTRAINT "chk_ct_tax_terms_range" CHECK ("min_terms" >= 0 AND ("max_terms" IS NULL OR "max_terms" >= "min_terms"));