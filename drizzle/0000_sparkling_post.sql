CREATE TYPE "public"."scout_account_tier" AS ENUM('general', 'pilot');--> statement-breakpoint
CREATE TYPE "public"."scout_area_kind" AS ENUM('building', 'greenhouse', 'flowering_room', 'propagation_room', 'growing_bay', 'other');--> statement-breakpoint
CREATE TYPE "public"."scout_device_status" AS ENUM('working', 'needs_attention', 'down');--> statement-breakpoint
CREATE TYPE "public"."scout_membership_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."scout_pest_event_status" AS ENUM('active', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."scout_plant_health" AS ENUM('normal', 'phytotoxicity_observed', 'other_concern');--> statement-breakpoint
CREATE TYPE "public"."scout_severity" AS ENUM('low', 'moderate', 'high', 'severe');--> statement-breakpoint
CREATE TYPE "public"."scout_shape_type" AS ENUM('rect', 'polygon', 'circle', 'line', 'label');--> statement-breakpoint
CREATE TYPE "public"."scout_staff_role" AS ENUM('staff');--> statement-breakpoint
CREATE TYPE "public"."scout_treatment_type" AS ENUM('pesticide', 'biological', 'spectral_light');--> statement-breakpoint
CREATE TABLE "scout_facility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_facility_area" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "scout_area_kind" DEFAULT 'other' NOT NULL,
	"crop_type" text,
	"notes" text,
	"background_image_url" text,
	"background_scale" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_facility_map_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_area_id" uuid NOT NULL,
	"shape_type" "scout_shape_type" NOT NULL,
	"geometry" jsonb NOT NULL,
	"style" jsonb,
	"label" text,
	"metadata" jsonb,
	"z_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "scout_membership_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_observation_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid,
	"pest_event_id" uuid,
	"blob_url" text NOT NULL,
	"caption" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_tier" "scout_account_tier" DEFAULT 'general' NOT NULL,
	"pilot_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_pest_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"facility_area_id" uuid,
	"map_object_id" uuid,
	"x" numeric,
	"y" numeric,
	"pest_species" text NOT NULL,
	"severity" "scout_severity" DEFAULT 'moderate' NOT NULL,
	"status" "scout_pest_event_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scout_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"facility_area_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sample_size" integer,
	"pest_count" integer,
	"device_status" "scout_device_status",
	"plant_health_flag" "scout_plant_health",
	"weather_notes" text,
	"other_treatments_notes" text,
	"notes" text,
	"satisfaction_rating" integer,
	"promoted_pest_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "scout_staff_role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scout_staff_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "scout_treatment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"pest_event_id" uuid,
	"type" "scout_treatment_type" NOT NULL,
	"product" text,
	"target_pest" text,
	"operator_user_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "scout_account" (
	"userId" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "scout_account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
ALTER TABLE "scout_account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	CONSTRAINT "scout_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "scout_user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "scout_verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "scout_verification_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_facility" ADD CONSTRAINT "scout_facility_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_facility_area" ADD CONSTRAINT "scout_facility_area_facility_id_scout_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."scout_facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_facility_map_object" ADD CONSTRAINT "scout_facility_map_object_facility_area_id_scout_facility_area_id_fk" FOREIGN KEY ("facility_area_id") REFERENCES "public"."scout_facility_area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_membership" ADD CONSTRAINT "scout_membership_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_observation_photo" ADD CONSTRAINT "scout_observation_photo_observation_id_scout_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."scout_observation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_observation_photo" ADD CONSTRAINT "scout_observation_photo_pest_event_id_scout_pest_event_id_fk" FOREIGN KEY ("pest_event_id") REFERENCES "public"."scout_pest_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_pest_event" ADD CONSTRAINT "scout_pest_event_facility_id_scout_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."scout_facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_pest_event" ADD CONSTRAINT "scout_pest_event_facility_area_id_scout_facility_area_id_fk" FOREIGN KEY ("facility_area_id") REFERENCES "public"."scout_facility_area"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_pest_event" ADD CONSTRAINT "scout_pest_event_map_object_id_scout_facility_map_object_id_fk" FOREIGN KEY ("map_object_id") REFERENCES "public"."scout_facility_map_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_observation" ADD CONSTRAINT "scout_observation_organization_id_scout_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."scout_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_observation" ADD CONSTRAINT "scout_observation_facility_area_id_scout_facility_area_id_fk" FOREIGN KEY ("facility_area_id") REFERENCES "public"."scout_facility_area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_observation" ADD CONSTRAINT "scout_observation_promoted_pest_event_id_scout_pest_event_id_fk" FOREIGN KEY ("promoted_pest_event_id") REFERENCES "public"."scout_pest_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD CONSTRAINT "scout_treatment_facility_id_scout_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."scout_facility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_treatment" ADD CONSTRAINT "scout_treatment_pest_event_id_scout_pest_event_id_fk" FOREIGN KEY ("pest_event_id") REFERENCES "public"."scout_pest_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_account" ADD CONSTRAINT "scout_account_userId_scout_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."scout_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_session" ADD CONSTRAINT "scout_session_userId_scout_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."scout_user"("id") ON DELETE cascade ON UPDATE no action;