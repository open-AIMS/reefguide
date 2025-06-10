-- CreateEnum
CREATE TYPE "UserAction" AS ENUM ('LOGIN', 'LOGOUT', 'CHANGE_PASSWORD', 'UPDATED');

-- CreateTable
CREATE TABLE "UserLog" (
    "id" SERIAL NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "UserAction" NOT NULL,
    "metadata" JSONB,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "UserLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserLog" ADD CONSTRAINT "UserLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
