-- CreateTable
CREATE TABLE "pre_approved_users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "UserRole"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" INTEGER,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "pre_approved_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pre_approved_users_email_key" ON "pre_approved_users"("email");

-- AddForeignKey
ALTER TABLE "pre_approved_users" ADD CONSTRAINT "pre_approved_users_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
