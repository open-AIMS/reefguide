-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'DATA_SPECIFICATION_UPDATE';

-- CreateTable
CREATE TABLE "regions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_title" TEXT NOT NULL,
    "display_subtitle" TEXT,
    "units" TEXT,
    "min_tooltip" TEXT,
    "max_tooltip" TEXT,
    "payload_prefix" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regional_criteria" (
    "id" SERIAL NOT NULL,
    "region_id" INTEGER NOT NULL,
    "criteria_id" INTEGER NOT NULL,
    "min_val" DOUBLE PRECISION NOT NULL,
    "max_val" DOUBLE PRECISION NOT NULL,
    "default_min_val" DOUBLE PRECISION NOT NULL,
    "default_max_val" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regional_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_name_key" ON "criteria"("name");

-- CreateIndex
CREATE UNIQUE INDEX "regional_criteria_region_id_criteria_id_key" ON "regional_criteria"("region_id", "criteria_id");

-- AddForeignKey
ALTER TABLE "regional_criteria" ADD CONSTRAINT "regional_criteria_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regional_criteria" ADD CONSTRAINT "regional_criteria_criteria_id_fkey" FOREIGN KEY ("criteria_id") REFERENCES "criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
