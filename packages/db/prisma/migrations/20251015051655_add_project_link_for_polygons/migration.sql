-- AlterTable
ALTER TABLE "Polygon" ADD COLUMN     "project_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Polygon" ADD CONSTRAINT "Polygon_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
