-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Answer_sessionId_order_idx" ON "Answer"("sessionId", "order");
