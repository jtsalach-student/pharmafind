-- AlterTable Prescription - Add missing columns
ALTER TABLE "Prescription" ADD COLUMN "quantity" INTEGER,
ADD COLUMN "unitPrice" DOUBLE PRECISION,
ADD COLUMN "deliveryFee" DOUBLE PRECISION,
ADD COLUMN "deliveryAddress" TEXT,
ADD COLUMN "phoneNumber" TEXT;
