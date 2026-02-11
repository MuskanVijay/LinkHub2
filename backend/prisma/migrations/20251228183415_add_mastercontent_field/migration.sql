/*
  Warnings:

  - The `content` column on the `Draft` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `Otp` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Draft` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED');

-- DropForeignKey
ALTER TABLE "public"."Otp" DROP CONSTRAINT "Otp_userId_fkey";

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "analytics" JSONB,
ADD COLUMN     "masterContent" TEXT,
ADD COLUMN     "mediaUrls" TEXT[],
ADD COLUMN     "platformData" JSONB,
ADD COLUMN     "publishedId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "content",
ADD COLUMN     "content" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpires" TIMESTAMP(3);

-- DropTable
DROP TABLE "public"."Otp";
