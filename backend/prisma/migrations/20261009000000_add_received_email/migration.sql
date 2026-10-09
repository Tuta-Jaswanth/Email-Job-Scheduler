-- CreateTable
CREATE TABLE "ReceivedEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReceivedEmail_userId_receivedAt_idx" ON "ReceivedEmail"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "ReceivedEmail_userId_isRead_idx" ON "ReceivedEmail"("userId", "isRead");

-- AddForeignKey
ALTER TABLE "ReceivedEmail" ADD CONSTRAINT "ReceivedEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
