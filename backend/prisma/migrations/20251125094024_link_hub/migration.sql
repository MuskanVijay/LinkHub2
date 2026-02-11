/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "linkedin" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "notifications" BOOLEAN DEFAULT true,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "profilePic" TEXT,
ADD COLUMN     "timezone" TEXT DEFAULT 'Asia/Karachi',
ADD COLUMN     "twitter" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
