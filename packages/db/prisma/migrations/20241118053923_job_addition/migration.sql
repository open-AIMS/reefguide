-- CreateEnum
CREATE TYPE "StorageScheme" AS ENUM ('S3');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('CRITERIA_POLYGONS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateTable
CREATE TABLE "Job" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "hash" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "input_payload" JSONB NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAssignment" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "job_id" INTEGER NOT NULL,
    "ecs_task_arn" TEXT NOT NULL,
    "ecs_cluster_arn" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "storage_scheme" "StorageScheme" NOT NULL,
    "storage_uri" TEXT NOT NULL,
    "heartbeat_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "JobAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobResult" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_id" INTEGER NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "result_payload" JSONB,
    "storage_scheme" "StorageScheme" NOT NULL,
    "storage_uri" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "JobResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobResult_assignment_id_key" ON "JobResult"("assignment_id");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAssignment" ADD CONSTRAINT "JobAssignment_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobResult" ADD CONSTRAINT "JobResult_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobResult" ADD CONSTRAINT "JobResult_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "JobAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
