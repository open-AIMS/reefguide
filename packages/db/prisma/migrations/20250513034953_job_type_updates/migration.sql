-- Custom migration to handle CRITERIA_POLYGONS removal
BEGIN;

-- Delete JobResults linked to Jobs with type CRITERIA_POLYGONS
DELETE FROM "JobResult" 
WHERE "job_id" IN (SELECT "id" FROM "Job" WHERE "type" = 'CRITERIA_POLYGONS');

-- Delete JobAssignments linked to Jobs with type CRITERIA_POLYGONS
DELETE FROM "JobAssignment" 
WHERE "job_id" IN (SELECT "id" FROM "Job" WHERE "type" = 'CRITERIA_POLYGONS');

-- Delete JobRequests linked to Jobs with type CRITERIA_POLYGONS
DELETE FROM "JobRequest" 
WHERE "type" = 'CRITERIA_POLYGONS';

-- Delete Jobs with type CRITERIA_POLYGONS
DELETE FROM "Job" 
WHERE "type" = 'CRITERIA_POLYGONS';

-- Now we can safely modify the enum
CREATE TYPE "JobType_new" AS ENUM ('TEST', 'SUITABILITY_ASSESSMENT');
ALTER TABLE "JobRequest" ALTER COLUMN "type" TYPE "JobType_new" USING ("type"::text::"JobType_new");
ALTER TABLE "Job" ALTER COLUMN "type" TYPE "JobType_new" USING ("type"::text::"JobType_new");
ALTER TYPE "JobType" RENAME TO "JobType_old";
ALTER TYPE "JobType_new" RENAME TO "JobType";
DROP TYPE "JobType_old";

COMMIT;