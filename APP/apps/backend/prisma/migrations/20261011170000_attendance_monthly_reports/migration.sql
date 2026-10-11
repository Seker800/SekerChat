CREATE TABLE "AttendanceMonthlyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "AttendanceMonthlyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceMonthlyReport_userId_month_key" ON "AttendanceMonthlyReport"("userId", "month");
ALTER TABLE "AttendanceMonthlyReport" ADD CONSTRAINT "AttendanceMonthlyReport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
