-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('GLOBAL', 'CLUB', 'HOSTEL', 'SPORT', 'FACILITY');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CorrectionAction" AS ENUM ('ADD', 'REMOVE');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('VERIFIED', 'MANUAL');

-- CreateEnum
CREATE TYPE "InventoryTxType" AS ENUM ('INITIAL', 'RESTOCK', 'ISSUE', 'RETURN', 'DAMAGE_REPORT', 'REPAIR', 'LOSS', 'WRITE_OFF', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('MAINTENANCE', 'OPERATIONS', 'SECURITY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "DataStatus" AS ENUM ('VERIFIED', 'PENDING_VERIFICATION', 'EXPIRED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "InstitutionalKind" AS ENUM ('PERSONNEL', 'OFFICE_BEARER', 'FACILITY', 'SPORT');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('CREATE_ONLY', 'UPSERT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEWED', 'COMMITTED', 'ROLLED_BACK', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportAction" AS ENUM ('CREATE', 'UPDATE', 'UNCHANGED', 'SKIP', 'ERROR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComplaintCategory" ADD VALUE 'SECURITY';
ALTER TYPE "ComplaintCategory" ADD VALUE 'MAINTENANCE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TournamentStatus" ADD VALUE 'PROPOSED';
ALTER TYPE "TournamentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "method" "AttendanceMethod" NOT NULL DEFAULT 'VERIFIED',
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL,
ALTER COLUMN "accuracyM" DROP NOT NULL,
ALTER COLUMN "distanceM" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "checkedInById" TEXT,
ADD COLUMN     "rescheduleCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "escalated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedById" TEXT,
ADD COLUMN     "escalationNote" TEXT,
ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Facility" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "registeredById" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewNote" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "scopeType" "ScopeType" NOT NULL DEFAULT 'GLOBAL',
    "scopeId" TEXT NOT NULL DEFAULT '',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "reason" TEXT,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role" "Role" NOT NULL,
    "permission" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","permission")
);

-- CreateTable
CREATE TABLE "PermissionDefinition" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionDefinition_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "CorrectionAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" "InventoryTxType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "availableDelta" INTEGER NOT NULL DEFAULT 0,
    "damagedDelta" INTEGER NOT NULL DEFAULT 0,
    "totalDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceAvailable" INTEGER NOT NULL,
    "balanceDamaged" INTEGER NOT NULL,
    "balanceTotal" INTEGER NOT NULL,
    "issueId" TEXT,
    "requestId" TEXT,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "clubId" TEXT,
    "equipmentId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "neededBy" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintAttachment" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "clubId" TEXT,
    "audienceRoles" "Role"[],
    "authorId" TEXT NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "TaskKind" NOT NULL DEFAULT 'OPERATIONS',
    "facilityId" TEXT,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueAt" TIMESTAMP(3),
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "docsUsed" INTEGER NOT NULL DEFAULT 0,
    "docsWithheld" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionalRecord" (
    "id" TEXT NOT NULL,
    "kind" "InstitutionalKind" NOT NULL,
    "externalKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "roleHint" "Role",
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sport" TEXT,
    "hostel" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "sourceUrl" TEXT,
    "sourceDocument" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "validUntil" TIMESTAMP(3),
    "dataStatus" "DataStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "importBatchId" TEXT,
    "linkedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "kind" "InstitutionalKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceDocument" TEXT,
    "mode" "ImportMode" NOT NULL DEFAULT 'CREATE_ONLY',
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "action" "ImportAction" NOT NULL,
    "recordId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "message" TEXT,

    CONSTRAINT "ImportBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoleAssignment_userId_status_idx" ON "RoleAssignment"("userId", "status");

-- CreateIndex
CREATE INDEX "RoleAssignment_role_status_idx" ON "RoleAssignment"("role", "status");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_sessionId_idx" ON "AttendanceCorrection"("sessionId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_equipmentId_createdAt_idx" ON "InventoryTransaction"("equipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "EquipmentRequest_status_createdAt_idx" ON "EquipmentRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "Announcement_status_createdAt_idx" ON "Announcement"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalTask_assigneeId_status_idx" ON "OperationalTask"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "InstitutionalRecord_kind_dataStatus_idx" ON "InstitutionalRecord"("kind", "dataStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalRecord_kind_externalKey_key" ON "InstitutionalRecord"("kind", "externalKey");

-- CreateIndex
CREATE INDEX "ImportBatchItem_batchId_idx" ON "ImportBatchItem"("batchId");

-- CreateIndex
CREATE INDEX "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRequest" ADD CONSTRAINT "EquipmentRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTask" ADD CONSTRAINT "OperationalTask_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTask" ADD CONSTRAINT "OperationalTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTask" ADD CONSTRAINT "OperationalTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalRecord" ADD CONSTRAINT "InstitutionalRecord_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatchItem" ADD CONSTRAINT "ImportBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------- data backfill (non-destructive)
-- Every existing user keeps exactly the role they had, now expressed as a RoleAssignment.
-- CLUB_MEMBER becomes STUDENT globally + one CLUB-scoped CLUB_MEMBER assignment per ACTIVE membership.
-- HOSTEL_SECRETARY takes the user's recorded hostel as its scope (empty scope = no hostel powers until an admin sets it).
-- SPORT_COORDINATOR has no recorded sport, so its scope is empty until an admin sets it.
INSERT INTO "RoleAssignment" ("id", "userId", "role", "scopeType", "scopeId", "status", "validFrom", "reason", "createdAt", "updatedAt")
SELECT 'ra_' || md5(u."id" || ':' || u."role"::text), u."id",
       CASE WHEN u."role" = 'CLUB_MEMBER' THEN 'STUDENT'::"Role" ELSE u."role" END,
       CASE u."role" WHEN 'HOSTEL_SECRETARY' THEN 'HOSTEL'::"ScopeType" WHEN 'SPORT_COORDINATOR' THEN 'SPORT'::"ScopeType" ELSE 'GLOBAL'::"ScopeType" END,
       CASE WHEN u."role" = 'HOSTEL_SECRETARY' THEN COALESCE(u."hostel", '') ELSE '' END,
       'ACTIVE', u."createdAt", 'Migrated from single-role model', NOW(), NOW()
FROM "User" u;

INSERT INTO "RoleAssignment" ("id", "userId", "role", "scopeType", "scopeId", "status", "validFrom", "reason", "createdAt", "updatedAt")
SELECT 'ra_' || md5(m."id" || ':club'), m."userId", 'CLUB_MEMBER', 'CLUB', m."clubId", 'ACTIVE', m."joinedAt",
       'Migrated from active club membership', NOW(), NOW()
FROM "ClubMembership" m
WHERE m."status" = 'ACTIVE';

-- Opening stock balance for every existing item, so the ledger reconciles with current quantities.
INSERT INTO "InventoryTransaction" ("id", "equipmentId", "type", "quantity", "availableDelta", "damagedDelta", "totalDelta",
  "balanceAvailable", "balanceDamaged", "balanceTotal", "actorId", "note", "createdAt")
SELECT 'itx_' || md5(e."id" || ':opening'), e."id", 'INITIAL', e."totalQty", e."availableQty", e."damagedQty", e."totalQty",
       e."availableQty", e."damagedQty", e."totalQty", a."id", 'Opening balance at ledger introduction', NOW()
FROM "Equipment" e
CROSS JOIN LATERAL (SELECT "id" FROM "User" ORDER BY ("role" = 'ADMIN') DESC, "createdAt" ASC LIMIT 1) a;
