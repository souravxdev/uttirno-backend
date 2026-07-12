-- AlterTable
ALTER TABLE "Question" ADD COLUMN "stemHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Question_stemHash_key" ON "Question"("stemHash");
