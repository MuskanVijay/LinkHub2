-- DropForeignKey
ALTER TABLE "public"."Draft" DROP CONSTRAINT "Draft_userId_fkey";

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT,
    "accountName" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "profilePicture" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedPost" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "socialAccountId" INTEGER NOT NULL,
    "platformPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_userId_platform_accountName_key" ON "SocialConnection"("userId", "platform", "accountName");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedPost_draftId_socialAccountId_key" ON "PublishedPost"("draftId", "socialAccountId");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedPost" ADD CONSTRAINT "PublishedPost_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedPost" ADD CONSTRAINT "PublishedPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
