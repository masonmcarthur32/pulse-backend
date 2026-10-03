CREATE TYPE "public"."client_status" AS ENUM('active', 'paused', 'churned');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'contacted', 'proposal_sent', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact" varchar(300) DEFAULT '',
	"plan" varchar(200) DEFAULT '',
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"monthly_value_cents" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"last_contact" timestamp with time zone,
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact" varchar(300) DEFAULT '',
	"source" varchar(200) DEFAULT '',
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"est_value_cents" integer DEFAULT 0 NOT NULL,
	"last_contact" timestamp with time zone,
	"follow_up_date" timestamp with time zone,
	"lost_reason" varchar(300) DEFAULT '',
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_user_idx" ON "clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_user_idx" ON "leads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage");