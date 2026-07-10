-- CreateEnum
CREATE TYPE "MembershipTier" AS ENUM ('FREE', 'CONTRIBUTOR', 'PROFESSIONAL', 'AUDITOR', 'ORG');

-- CreateEnum
CREATE TYPE "MembershipSubscriptionStatus" AS ENUM ('NONE', 'INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "StripeIntegrationMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "StripeCheckoutKind" AS ENUM ('SUBSCRIPTION', 'CREDIT_PURCHASE');

-- CreateEnum
CREATE TYPE "PromotionAccessScope" AS ENUM ('GLOBAL', 'USER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "ModuleHealthStatus" AS ENUM ('healthy', 'degraded', 'offline', 'unknown');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PRIVATE', 'MEMBERS', 'PUBLIC');

-- CreateEnum
CREATE TYPE "MediaCollectionType" AS ENUM ('ALBUM', 'TAG', 'SYSTEM_DATE');

-- CreateEnum
CREATE TYPE "FeedVisibility" AS ENUM ('MEMBERS', 'FRIENDS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FeedReactionType" AS ENUM ('LIKE', 'LOVE', 'CARE', 'HAHA', 'WOW', 'SAD', 'ANGRY');

-- CreateEnum
CREATE TYPE "SocialRelationshipType" AS ENUM ('FRIEND', 'FAMILY', 'CONTACT', 'FOLLOW', 'BLOCK', 'MUTE');

-- CreateEnum
CREATE TYPE "FamilyRelationshipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELED');

-- CreateEnum
CREATE TYPE "FriendRelationshipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ChatThreadType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatAttachmentKind" AS ENUM ('IMAGE', 'FILE');

-- CreateEnum
CREATE TYPE "MailDeliveryKind" AS ENUM ('DIRECT', 'MASS_INTERNAL', 'INQUIRY');

-- CreateEnum
CREATE TYPE "MailRecipientType" AS ENUM ('TO', 'CC', 'BCC');

-- CreateEnum
CREATE TYPE "MailAttachmentKind" AS ENUM ('IMAGE', 'FILE');

-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "GroupJoinPolicy" AS ENUM ('OPEN', 'APPROVAL');

-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('MEMBER', 'MODERATOR', 'OWNER');

-- CreateEnum
CREATE TYPE "GroupJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GroupForumReactionType" AS ENUM ('LIKE', 'LOVE', 'CARE', 'HAHA', 'WOW', 'SAD', 'ANGRY');

-- CreateEnum
CREATE TYPE "GroupAssetKind" AS ENUM ('PHOTO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PUBLISHED', 'CANCELED', 'ENDED');

-- CreateEnum
CREATE TYPE "EventModeratorRole" AS ENUM ('OWNER', 'MODERATOR');

-- CreateEnum
CREATE TYPE "EventInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED');

-- CreateEnum
CREATE TYPE "EventRsvpStatus" AS ENUM ('GOING', 'MAYBE', 'DECLINED');

-- CreateEnum
CREATE TYPE "BusinessProfileKind" AS ENUM ('BUSINESS', 'ORG');

-- CreateEnum
CREATE TYPE "MarketListingCategory" AS ENUM ('BOOKS_MATERIALS', 'COURSE_SUPPLIES', 'AUDITING_SUPPLIES', 'E_METERS', 'FURNITURE_EQUIPMENT', 'SERVICES', 'BUSINESS_SERVICES', 'EVENTS_SUPPLIES', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('ADMINISTRATION', 'TECHNICAL', 'SALES', 'DELIVERY', 'AUDITING', 'TRAINING', 'CREATIVE', 'PROFESSIONAL_SERVICES', 'OTHER');

-- CreateEnum
CREATE TYPE "JobEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "JobListingStatus" AS ENUM ('ACTIVE', 'FILLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BusinessInquiryStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('RIGHT_STREAM', 'BUSINESS_SPOTLIGHT', 'RESERVED_STREAM');

-- CreateEnum
CREATE TYPE "AdDestinationKind" AS ENUM ('STOREFRONT', 'MARKET_LISTING', 'BUSINESS_ARTICLE', 'EXTERNAL_URL');

-- CreateEnum
CREATE TYPE "AdDeliveryEventType" AS ENUM ('IMPRESSION', 'CLICK');

-- CreateEnum
CREATE TYPE "InterestCategory" AS ENUM ('AUDITING', 'TRAINING', 'EVENTS', 'MARKET', 'JOBS', 'BUSINESS', 'WRITERS', 'FUNDRAISERS', 'GROUPS', 'FAMILY_COMMUNITY', 'TECH', 'COURSE_SUPPLIES');

-- CreateEnum
CREATE TYPE "PlatformActivityEventType" AS ENUM ('PAGE_VIEW', 'HEARTBEAT', 'NAVIGATION', 'ACTION', 'SEARCH', 'AD_INTERACTION', 'SESSION_START', 'SESSION_END');

-- CreateEnum
CREATE TYPE "PlatformCostSubject" AS ENUM ('MARKET_PRODUCT_LISTING', 'MARKET_PRODUCT_EXTRA_LISTING', 'MARKET_PRODUCT_RENEW', 'MARKET_PRODUCT_BOOST', 'MARKET_SERVICE_POST', 'MARKET_SERVICE_BOOST', 'MONTHLY_SPECIAL', 'MAIN_STREAM_PROMOTED_POST', 'MAIL_SPONSORED_INTERNAL', 'AD_RIGHT_BILLBOARD_SMALL', 'AD_RIGHT_BILLBOARD_MEDIUM', 'AD_RIGHT_BILLBOARD_LARGE', 'AD_BUSINESS_SPOTLIGHT', 'AD_RESERVED_STREAM', 'POST_BOOST', 'EVENT_BOOST', 'STOREFRONT_SPOTLIGHT');

-- CreateEnum
CREATE TYPE "FundraiserCategory" AS ENUM ('COMMUNITY_PROJECT', 'EVENT_SUPPORT', 'MATERIALS_SUPPLIES', 'EMERGENCY_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "FundraiserStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FundContributionStatus" AS ENUM ('PLEDGED', 'PROCESSOR_PENDING', 'PROCESSOR_CONFIRMED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FundLedgerEntryType" AS ENUM ('PROCESSOR_CONFIRMED_CONTRIBUTION', 'PROCESSOR_REFUND', 'WITHDRAWAL_BATCH_CAPTURE');

-- CreateEnum
CREATE TYPE "ManuscriptVisibility" AS ENUM ('PRIVATE', 'MEMBERS');

-- CreateEnum
CREATE TYPE "AuthSecurityEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'SIGNUP_CREATED', 'EMAIL_VERIFICATION_REQUESTED', 'EMAIL_VERIFIED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'SESSION_REVOKED', 'TWO_FACTOR_READY');

-- CreateEnum
CREATE TYPE "FeedbackTicketStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeedbackTicketSeverity" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PRIVATE', 'MEMBERS', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ScientologyVisibility" AS ENUM ('PRIVATE', 'MEMBERS');

-- CreateEnum
CREATE TYPE "ScientologyClassification" AS ENUM ('PUBLIC', 'STAFF', 'SEA_ORG', 'AUDITOR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "emailVerified" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "lastPasswordChangedAt" TIMESTAMP(3),
    "sessionsRevokedAt" TIMESTAMP(3),
    "onboardingCompletedAt" TIMESTAMP(3),
    "profileOnboardingSkippedAt" TIMESTAMP(3),
    "scientologyOnboardingSkippedAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "goodStandingDeniedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "tagline" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "location" TEXT,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'MEMBERS',
    "theme" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScientologyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classification" "ScientologyClassification" NOT NULL DEFAULT 'PUBLIC',
    "orgName" TEXT,
    "lastServiceName" TEXT,
    "lastServiceAt" TIMESTAMP(3),
    "iasMembershipLast6" TEXT,
    "trainingLevel" TEXT,
    "processingStatus" TEXT,
    "courseCompletions" JSONB,
    "introServices" JSONB,
    "technicalCourses" JSONB,
    "specialistCourses" JSONB,
    "additionalProcessing" JSONB,
    "goodStandingAttested" BOOLEAN NOT NULL DEFAULT false,
    "goodStandingUpdatedAt" TIMESTAMP(3),
    "educationNotes" TEXT,
    "visibility" "ScientologyVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScientologyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScientologyCommendation" (
    "id" TEXT NOT NULL,
    "scientologyProfileId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "title" TEXT,
    "isFlattenedPdf" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScientologyCommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL DEFAULT 'FREE',
    "inviteEligibleAt" TIMESTAMP(3),
    "storageLimitBytes" BIGINT NOT NULL DEFAULT 104857600,
    "platformCredits" INTEGER NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" "MembershipSubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
    "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipTierUpgradeEligibility" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipTierUpgradeEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPromotionGrant" (
    "id" TEXT NOT NULL,
    "scope" "PromotionAccessScope" NOT NULL DEFAULT 'USER',
    "userId" TEXT,
    "sourceTier" "MembershipTier" NOT NULL DEFAULT 'FREE',
    "targetTier" "MembershipTier" NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPromotionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeAccountInviteCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codePreview" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "assignedUserId" TEXT,
    "generatedByUserId" TEXT,
    "usedByUserId" TEXT,
    "emailedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeAccountInviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlanRule" (
    "id" TEXT NOT NULL,
    "tier" "MembershipTier" NOT NULL,
    "displayName" TEXT NOT NULL,
    "standardPriceCents" INTEGER NOT NULL,
    "stripePriceId" TEXT,
    "founderPriceCents" INTEGER,
    "founderMemberCap" INTEGER,
    "founderWindowDays" INTEGER,
    "monthlyCreditBudget" INTEGER NOT NULL DEFAULT 0,
    "populationCreditTiers" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlanRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeIntegrationConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mode" "StripeIntegrationMode" NOT NULL DEFAULT 'TEST',
    "publishableKey" TEXT,
    "secretKey" TEXT,
    "webhookSecret" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "subscriptionCheckoutEnabled" BOOLEAN NOT NULL DEFAULT true,
    "creditCheckoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeCreditPackage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "creditAmount" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "stripePriceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeCreditPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeCheckoutFulfillment" (
    "id" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "StripeCheckoutKind" NOT NULL,
    "creditPackageKey" TEXT,
    "creditsGranted" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeCheckoutFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdExperienceRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "value" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdExperienceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticLog" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "module" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "requestId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'info',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformActivityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionKey" TEXT,
    "eventType" "PlatformActivityEventType" NOT NULL,
    "route" TEXT,
    "module" TEXT,
    "action" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApplicationUsageMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mobileActivityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "desktopActivityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedStreamOrganicUnits" INTEGER NOT NULL DEFAULT 0,
    "reservedStreamAdImpressions" INTEGER NOT NULL DEFAULT 0,
    "reservedStreamOrganicUnitsAtLastAd" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "lastMobileSeenAt" TIMESTAMP(3),
    "lastDesktopSeenAt" TIMESTAMP(3),
    "lastReservedStreamAdAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApplicationUsageMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "InterestCategory" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'self',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleHealthCheck" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "status" "ModuleHealthStatus" NOT NULL DEFAULT 'unknown',
    "message" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ModuleHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actionKey" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicAnnouncement" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audienceKind" TEXT NOT NULL,
    "audienceValue" TEXT,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "chatDeliveryCount" INTEGER NOT NULL DEFAULT 0,
    "mailDeliveryCount" INTEGER NOT NULL DEFAULT 0,
    "popupDeliveryCount" INTEGER NOT NULL DEFAULT 0,
    "globalPostDeliveryCount" INTEGER NOT NULL DEFAULT 0,
    "personalEmailQueuedCount" INTEGER NOT NULL DEFAULT 0,
    "feedPostId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "originalName" TEXT,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryAssetComment" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryAssetComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCollection" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "type" "MediaCollectionType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaCollectionAsset" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCollectionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "FeedVisibility" NOT NULL DEFAULT 'MEMBERS',
    "mediaAssetId" TEXT,
    "isAdminAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "pinnedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPostDismissal" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPostDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "body" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FeedReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedCommentReaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FeedReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialRelationship" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "type" "SocialRelationshipType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyRelationshipRequest" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "relationshipLabel" TEXT NOT NULL,
    "reciprocalLabel" TEXT NOT NULL,
    "status" "FamilyRelationshipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "alertId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyRelationshipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendRelationshipRequest" (
    "id" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "status" "FriendRelationshipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "alertId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendRelationshipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "type" "ChatThreadType" NOT NULL,
    "title" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT,
    "mutedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "kind" "ChatAttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "storageKey" TEXT,
    "publicUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedChatThread" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "EncryptedChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedChatParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderDeviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedChatEnvelope" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "recipientDeviceId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "EncryptedChatEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailThread" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "deliveryKind" "MailDeliveryKind" NOT NULL DEFAULT 'DIRECT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "MailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailRecipient" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MailRecipientType" NOT NULL DEFAULT 'TO',
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "kind" "MailAttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "storageKey" TEXT,
    "publicUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailContact" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "contactUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "notes" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "allowMassMail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSenderOptOut" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailSenderOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailPolicyConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "contributorMassRecipientCap" INTEGER NOT NULL DEFAULT 1,
    "professionalMassRecipientCap" INTEGER NOT NULL DEFAULT 25,
    "auditorMassRecipientCap" INTEGER NOT NULL DEFAULT 1,
    "adminMassRecipientCap" INTEGER NOT NULL DEFAULT 100,
    "massMailCostPerRecipientCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailPolicyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "visibility" "GroupVisibility" NOT NULL DEFAULT 'PUBLIC',
    "joinPolicy" "GroupJoinPolicy" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "storageLimitBytes" BIGINT NOT NULL DEFAULT 41943040,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "isProvider" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupJoinRequest" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "status" "GroupJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupUserPin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupUserPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupForumThread" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "allowPhotoReplies" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "endedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupForumThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupForumPost" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "parentPostId" TEXT,
    "body" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupForumPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupForumThreadReaction" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GroupForumReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupForumThreadReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupForumPostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GroupForumReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupForumPostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAsset" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "uploaderUserId" TEXT NOT NULL,
    "kind" "GroupAssetKind" NOT NULL,
    "headline" TEXT,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAssetComment" (
    "id" TEXT NOT NULL,
    "groupAssetId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupAssetComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "locationName" TEXT,
    "address" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventModerator" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EventModeratorRole" NOT NULL DEFAULT 'MODERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventModerator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInvitation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "inviteeUserId" TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "status" "EventInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "externalName" TEXT,
    "externalEmail" TEXT,
    "confirmationSentAt" TIMESTAMP(3),
    "status" "EventRsvpStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "MarketListingCategory" NOT NULL,
    "location" TEXT,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "MarketListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListingPhoto" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "employerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT,
    "summary" TEXT,
    "description" TEXT NOT NULL,
    "category" "JobCategory" NOT NULL,
    "employmentType" "JobEmploymentType" NOT NULL,
    "location" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "compensation" TEXT,
    "contactEmail" TEXT,
    "contactInstructions" TEXT,
    "status" "JobListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "practiceName" TEXT NOT NULL,
    "location" TEXT,
    "willingToTravel" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT,
    "offerings" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "profileKind" "BusinessProfileKind" NOT NULL DEFAULT 'BUSINESS',
    "slug" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactPersonName" TEXT,
    "tagline" TEXT,
    "description" TEXT,
    "location" TEXT,
    "publicEmail" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "heroImageUrl" TEXT,
    "galleryImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blogEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicStorefrontEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailLinkingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessInquiry" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "mailThreadId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT,
    "message" TEXT NOT NULL,
    "status" "BusinessInquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessArticle" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "coverMediaAssetId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCostRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" "PlatformCostSubject" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "creditCost" INTEGER NOT NULL,
    "durationDays" INTEGER,
    "includedUnits" INTEGER,
    "unitLabel" TEXT NOT NULL DEFAULT 'package',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCostRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "businessProfileId" TEXT,
    "marketListingId" TEXT,
    "businessArticleId" TEXT,
    "subscriberTargetManuscriptId" TEXT,
    "imageMediaAssetId" TEXT,
    "externalImageUrl" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "destinationUrl" TEXT,
    "destinationKind" "AdDestinationKind" NOT NULL DEFAULT 'STOREFRONT',
    "placement" "AdPlacement" NOT NULL DEFAULT 'RIGHT_STREAM',
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "targetLocation" TEXT,
    "totalBudgetCredits" INTEGER NOT NULL,
    "dailyBudgetCredits" INTEGER,
    "spentCredits" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignInterestTarget" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "category" "InterestCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaignInterestTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdDisplayScheduleRun" (
    "id" TEXT NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "scheduleDate" TIMESTAMP(3) NOT NULL,
    "scheduledFrom" TIMESTAMP(3) NOT NULL,
    "scheduledUntil" TIMESTAMP(3) NOT NULL,
    "slotSeconds" INTEGER NOT NULL DEFAULT 30,
    "slotCount" INTEGER NOT NULL DEFAULT 0,
    "campaignCount" INTEGER NOT NULL DEFAULT 0,
    "forced" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdDisplayScheduleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdDisplayScheduleSlot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "displaySeconds" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdDisplayScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdDeliveryLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "viewerUserId" TEXT,
    "placement" "AdPlacement" NOT NULL,
    "eventType" "AdDeliveryEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundraiserCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT NOT NULL,
    "category" "FundraiserCategory" NOT NULL,
    "goalAmountCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "FundraiserStatus" NOT NULL DEFAULT 'ACTIVE',
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundraiserCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundContributionIntent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contributorUserId" TEXT,
    "contributorName" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "FundContributionStatus" NOT NULL DEFAULT 'PLEDGED',
    "processorProvider" TEXT,
    "processorReference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundContributionIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundLedgerEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "entryType" "FundLedgerEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterManuscript" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "genre" TEXT,
    "summary" TEXT,
    "visibility" "ManuscriptVisibility" NOT NULL DEFAULT 'MEMBERS',
    "publishToStorefront" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriterManuscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterManuscriptSubscription" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriterManuscriptSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterChapter" (
    "id" TEXT NOT NULL,
    "manuscriptId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "autosavedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriterChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "AuthSecurityEventType" NOT NULL,
    "identifier" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "method" TEXT,
    "secretHash" TEXT,
    "recoveryCodes" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackTicket" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterEmail" TEXT,
    "pageUrl" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "FeedbackTicketSeverity" NOT NULL DEFAULT 'normal',
    "status" "FeedbackTicketStatus" NOT NULL DEFAULT 'OPEN',
    "userAgent" TEXT,
    "diagnostics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackTicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPolicyOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPolicyOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "UserDevice_deviceId_idx" ON "UserDevice"("deviceId");

-- CreateIndex
CREATE INDEX "UserDevice_userId_revokedAt_lastSeenAt_idx" ON "UserDevice"("userId", "revokedAt", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_deviceId_key" ON "UserDevice"("userId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScientologyProfile_userId_key" ON "ScientologyProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScientologyCommendation_mediaAssetId_key" ON "ScientologyCommendation"("mediaAssetId");

-- CreateIndex
CREATE INDEX "ScientologyCommendation_scientologyProfileId_createdAt_idx" ON "ScientologyCommendation"("scientologyProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_stripeSubscriptionId_key" ON "Membership"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Membership_stripeCustomerId_idx" ON "Membership"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Membership_subscriptionStatus_updatedAt_idx" ON "Membership"("subscriptionStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "MembershipTierUpgradeEligibility_tier_active_expiresAt_idx" ON "MembershipTierUpgradeEligibility"("tier", "active", "expiresAt");

-- CreateIndex
CREATE INDEX "MembershipTierUpgradeEligibility_createdByUserId_createdAt_idx" ON "MembershipTierUpgradeEligibility"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipTierUpgradeEligibility_userId_tier_key" ON "MembershipTierUpgradeEligibility"("userId", "tier");

-- CreateIndex
CREATE INDEX "MembershipPromotionGrant_scope_sourceTier_targetTier_active_idx" ON "MembershipPromotionGrant"("scope", "sourceTier", "targetTier", "active", "startsAt", "expiresAt");

-- CreateIndex
CREATE INDEX "MembershipPromotionGrant_userId_active_startsAt_expiresAt_idx" ON "MembershipPromotionGrant"("userId", "active", "startsAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FreeAccountInviteCode_codeHash_key" ON "FreeAccountInviteCode"("codeHash");

-- CreateIndex
CREATE INDEX "FreeAccountInviteCode_recipientEmail_expiresAt_idx" ON "FreeAccountInviteCode"("recipientEmail", "expiresAt");

-- CreateIndex
CREATE INDEX "FreeAccountInviteCode_assignedUserId_expiresAt_idx" ON "FreeAccountInviteCode"("assignedUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "FreeAccountInviteCode_usedAt_expiresAt_idx" ON "FreeAccountInviteCode"("usedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "FreeAccountInviteCode_generatedByUserId_createdAt_idx" ON "FreeAccountInviteCode"("generatedByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlanRule_tier_key" ON "SubscriptionPlanRule"("tier");

-- CreateIndex
CREATE INDEX "StripeIntegrationConfig_updatedByUserId_updatedAt_idx" ON "StripeIntegrationConfig"("updatedByUserId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCreditPackage_key_key" ON "StripeCreditPackage"("key");

-- CreateIndex
CREATE INDEX "StripeCreditPackage_active_sortOrder_idx" ON "StripeCreditPackage"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCheckoutFulfillment_stripeCheckoutSessionId_key" ON "StripeCheckoutFulfillment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "StripeCheckoutFulfillment_userId_createdAt_idx" ON "StripeCheckoutFulfillment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdExperienceRule_key_key" ON "AdExperienceRule"("key");

-- CreateIndex
CREATE INDEX "DiagnosticLog_module_createdAt_idx" ON "DiagnosticLog"("module", "createdAt");

-- CreateIndex
CREATE INDEX "DiagnosticLog_level_createdAt_idx" ON "DiagnosticLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_action_createdAt_idx" ON "AuditLog"("module", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformActivityEvent_userId_createdAt_idx" ON "PlatformActivityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformActivityEvent_eventType_createdAt_idx" ON "PlatformActivityEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformActivityEvent_route_createdAt_idx" ON "PlatformActivityEvent"("route", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformActivityEvent_module_action_createdAt_idx" ON "PlatformActivityEvent"("module", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserApplicationUsageMetric_userId_key" ON "UserApplicationUsageMetric"("userId");

-- CreateIndex
CREATE INDEX "UserApplicationUsageMetric_lastSeenAt_idx" ON "UserApplicationUsageMetric"("lastSeenAt");

-- CreateIndex
CREATE INDEX "UserApplicationUsageMetric_lastMobileSeenAt_idx" ON "UserApplicationUsageMetric"("lastMobileSeenAt");

-- CreateIndex
CREATE INDEX "UserApplicationUsageMetric_lastDesktopSeenAt_idx" ON "UserApplicationUsageMetric"("lastDesktopSeenAt");

-- CreateIndex
CREATE INDEX "UserInterest_category_idx" ON "UserInterest"("category");

-- CreateIndex
CREATE UNIQUE INDEX "UserInterest_userId_category_key" ON "UserInterest"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleHealthCheck_module_key" ON "ModuleHealthCheck"("module");

-- CreateIndex
CREATE INDEX "AdminAction_actionKey_createdAt_idx" ON "AdminAction"("actionKey", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_actorUserId_createdAt_idx" ON "AdminAction"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicAnnouncement_createdByUserId_createdAt_idx" ON "PublicAnnouncement"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicAnnouncement_audienceKind_createdAt_idx" ON "PublicAnnouncement"("audienceKind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerUserId_createdAt_idx" ON "MediaAsset"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryAssetComment_mediaAssetId_deletedAt_createdAt_idx" ON "GalleryAssetComment"("mediaAssetId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryAssetComment_authorUserId_createdAt_idx" ON "GalleryAssetComment"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaCollection_ownerUserId_type_name_idx" ON "MediaCollection"("ownerUserId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MediaCollection_ownerUserId_type_slug_key" ON "MediaCollection"("ownerUserId", "type", "slug");

-- CreateIndex
CREATE INDEX "MediaCollectionAsset_mediaAssetId_assignedAt_idx" ON "MediaCollectionAsset"("mediaAssetId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaCollectionAsset_collectionId_mediaAssetId_key" ON "MediaCollectionAsset"("collectionId", "mediaAssetId");

-- CreateIndex
CREATE INDEX "FeedPost_visibility_createdAt_idx" ON "FeedPost"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "FeedPost_isAdminAnnouncement_pinnedUntil_createdAt_idx" ON "FeedPost"("isAdminAnnouncement", "pinnedUntil", "createdAt");

-- CreateIndex
CREATE INDEX "FeedPost_authorUserId_createdAt_idx" ON "FeedPost"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedPostDismissal_userId_createdAt_idx" ON "FeedPostDismissal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPostDismissal_postId_userId_key" ON "FeedPostDismissal"("postId", "userId");

-- CreateIndex
CREATE INDEX "FeedComment_postId_createdAt_idx" ON "FeedComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedComment_authorUserId_createdAt_idx" ON "FeedComment"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedComment_parentCommentId_createdAt_idx" ON "FeedComment"("parentCommentId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedPostReaction_postId_type_idx" ON "FeedPostReaction"("postId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPostReaction_postId_userId_key" ON "FeedPostReaction"("postId", "userId");

-- CreateIndex
CREATE INDEX "FeedCommentReaction_commentId_type_idx" ON "FeedCommentReaction"("commentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FeedCommentReaction_commentId_userId_key" ON "FeedCommentReaction"("commentId", "userId");

-- CreateIndex
CREATE INDEX "SocialRelationship_fromUserId_type_createdAt_idx" ON "SocialRelationship"("fromUserId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "SocialRelationship_toUserId_type_createdAt_idx" ON "SocialRelationship"("toUserId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialRelationship_fromUserId_toUserId_type_key" ON "SocialRelationship"("fromUserId", "toUserId", "type");

-- CreateIndex
CREATE INDEX "FamilyRelationshipRequest_requesterUserId_status_createdAt_idx" ON "FamilyRelationshipRequest"("requesterUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FamilyRelationshipRequest_targetUserId_status_createdAt_idx" ON "FamilyRelationshipRequest"("targetUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FamilyRelationshipRequest_alertId_idx" ON "FamilyRelationshipRequest"("alertId");

-- CreateIndex
CREATE INDEX "FriendRelationshipRequest_requesterUserId_status_createdAt_idx" ON "FriendRelationshipRequest"("requesterUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FriendRelationshipRequest_targetUserId_status_createdAt_idx" ON "FriendRelationshipRequest"("targetUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FriendRelationshipRequest_alertId_idx" ON "FriendRelationshipRequest"("alertId");

-- CreateIndex
CREATE INDEX "ChatThread_type_lastMessageAt_idx" ON "ChatThread"("type", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatThread_createdByUserId_createdAt_idx" ON "ChatThread"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatParticipant_userId_archivedAt_createdAt_idx" ON "ChatParticipant"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatParticipant_threadId_userId_key" ON "ChatParticipant"("threadId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_senderUserId_createdAt_idx" ON "ChatMessage"("senderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAttachment_messageId_createdAt_idx" ON "ChatAttachment"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatAttachment_mediaAssetId_idx" ON "ChatAttachment"("mediaAssetId");

-- CreateIndex
CREATE INDEX "EncryptedChatThread_lastMessageAt_idx" ON "EncryptedChatThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "EncryptedChatParticipant_userId_createdAt_idx" ON "EncryptedChatParticipant"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatParticipant_threadId_userId_key" ON "EncryptedChatParticipant"("threadId", "userId");

-- CreateIndex
CREATE INDEX "EncryptedChatMessage_threadId_createdAt_idx" ON "EncryptedChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatMessage_senderUserId_createdAt_idx" ON "EncryptedChatMessage"("senderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatEnvelope_recipientDeviceId_createdAt_idx" ON "EncryptedChatEnvelope"("recipientDeviceId", "createdAt");

-- CreateIndex
CREATE INDEX "EncryptedChatEnvelope_recipientUserId_readAt_createdAt_idx" ON "EncryptedChatEnvelope"("recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedChatEnvelope_messageId_recipientDeviceId_key" ON "EncryptedChatEnvelope"("messageId", "recipientDeviceId");

-- CreateIndex
CREATE INDEX "MailThread_deliveryKind_lastMessageAt_idx" ON "MailThread"("deliveryKind", "lastMessageAt");

-- CreateIndex
CREATE INDEX "MailThread_createdByUserId_createdAt_idx" ON "MailThread"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MailMessage_threadId_createdAt_idx" ON "MailMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "MailMessage_senderUserId_createdAt_idx" ON "MailMessage"("senderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MailRecipient_userId_readAt_createdAt_idx" ON "MailRecipient"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "MailRecipient_userId_archivedAt_createdAt_idx" ON "MailRecipient"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailRecipient_messageId_userId_type_key" ON "MailRecipient"("messageId", "userId", "type");

-- CreateIndex
CREATE INDEX "MailAttachment_messageId_createdAt_idx" ON "MailAttachment"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "MailAttachment_mediaAssetId_idx" ON "MailAttachment"("mediaAssetId");

-- CreateIndex
CREATE INDEX "MailContact_ownerUserId_createdAt_idx" ON "MailContact"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailContact_ownerUserId_contactUserId_key" ON "MailContact"("ownerUserId", "contactUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MailPreference_userId_key" ON "MailPreference"("userId");

-- CreateIndex
CREATE INDEX "MailSenderOptOut_senderUserId_createdAt_idx" ON "MailSenderOptOut"("senderUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailSenderOptOut_ownerUserId_senderUserId_key" ON "MailSenderOptOut"("ownerUserId", "senderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE INDEX "Group_visibility_archivedAt_createdAt_idx" ON "Group"("visibility", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Group_createdByUserId_createdAt_idx" ON "Group"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupMember_userId_role_createdAt_idx" ON "GroupMember"("userId", "role", "createdAt");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_role_idx" ON "GroupMember"("groupId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "GroupJoinRequest_requesterUserId_createdAt_idx" ON "GroupJoinRequest"("requesterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupJoinRequest_groupId_status_createdAt_idx" ON "GroupJoinRequest"("groupId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GroupUserPin_userId_sortOrder_pinnedAt_idx" ON "GroupUserPin"("userId", "sortOrder", "pinnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupUserPin_userId_groupId_key" ON "GroupUserPin"("userId", "groupId");

-- CreateIndex
CREATE INDEX "GroupForumThread_groupId_deletedAt_pinnedAt_updatedAt_idx" ON "GroupForumThread"("groupId", "deletedAt", "pinnedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "GroupForumThread_authorUserId_createdAt_idx" ON "GroupForumThread"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupForumPost_threadId_createdAt_idx" ON "GroupForumPost"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupForumPost_authorUserId_createdAt_idx" ON "GroupForumPost"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupForumPost_parentPostId_createdAt_idx" ON "GroupForumPost"("parentPostId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupForumThreadReaction_threadId_type_idx" ON "GroupForumThreadReaction"("threadId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GroupForumThreadReaction_threadId_userId_key" ON "GroupForumThreadReaction"("threadId", "userId");

-- CreateIndex
CREATE INDEX "GroupForumPostReaction_postId_type_idx" ON "GroupForumPostReaction"("postId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GroupForumPostReaction_postId_userId_key" ON "GroupForumPostReaction"("postId", "userId");

-- CreateIndex
CREATE INDEX "GroupAsset_groupId_kind_createdAt_idx" ON "GroupAsset"("groupId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "GroupAsset_uploaderUserId_createdAt_idx" ON "GroupAsset"("uploaderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupAssetComment_groupAssetId_createdAt_idx" ON "GroupAssetComment"("groupAssetId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupAssetComment_authorUserId_createdAt_idx" ON "GroupAssetComment"("authorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_createdByUserId_startsAt_idx" ON "Event"("createdByUserId", "startsAt");

-- CreateIndex
CREATE INDEX "EventModerator_userId_role_createdAt_idx" ON "EventModerator"("userId", "role", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventModerator_eventId_userId_key" ON "EventModerator"("eventId", "userId");

-- CreateIndex
CREATE INDEX "EventInvitation_inviteeUserId_status_createdAt_idx" ON "EventInvitation"("inviteeUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventInvitation_eventId_status_createdAt_idx" ON "EventInvitation"("eventId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventInvitation_eventId_inviteeUserId_key" ON "EventInvitation"("eventId", "inviteeUserId");

-- CreateIndex
CREATE INDEX "EventRsvp_userId_status_createdAt_idx" ON "EventRsvp"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventRsvp_externalEmail_idx" ON "EventRsvp"("externalEmail");

-- CreateIndex
CREATE INDEX "EventRsvp_eventId_status_idx" ON "EventRsvp"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_eventId_userId_key" ON "EventRsvp"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_eventId_externalEmail_key" ON "EventRsvp"("eventId", "externalEmail");

-- CreateIndex
CREATE UNIQUE INDEX "MarketListing_slug_key" ON "MarketListing"("slug");

-- CreateIndex
CREATE INDEX "MarketListing_status_category_createdAt_idx" ON "MarketListing"("status", "category", "createdAt");

-- CreateIndex
CREATE INDEX "MarketListing_sellerUserId_createdAt_idx" ON "MarketListing"("sellerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketListing_expiresAt_idx" ON "MarketListing"("expiresAt");

-- CreateIndex
CREATE INDEX "MarketListingPhoto_mediaAssetId_createdAt_idx" ON "MarketListingPhoto"("mediaAssetId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketListingPhoto_listingId_sortOrder_idx" ON "MarketListingPhoto"("listingId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MarketListingPhoto_listingId_mediaAssetId_key" ON "MarketListingPhoto"("listingId", "mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "JobListing_slug_key" ON "JobListing"("slug");

-- CreateIndex
CREATE INDEX "JobListing_status_category_createdAt_idx" ON "JobListing"("status", "category", "createdAt");

-- CreateIndex
CREATE INDEX "JobListing_employerUserId_createdAt_idx" ON "JobListing"("employerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditorProfile_userId_key" ON "AuditorProfile"("userId");

-- CreateIndex
CREATE INDEX "AuditorProfile_active_createdAt_idx" ON "AuditorProfile"("active", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_ownerUserId_key" ON "BusinessProfile"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_slug_key" ON "BusinessProfile"("slug");

-- CreateIndex
CREATE INDEX "BusinessProfile_publicStorefrontEnabled_updatedAt_idx" ON "BusinessProfile"("publicStorefrontEnabled", "updatedAt");

-- CreateIndex
CREATE INDEX "BusinessInquiry_businessProfileId_status_createdAt_idx" ON "BusinessInquiry"("businessProfileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessInquiry_mailThreadId_idx" ON "BusinessInquiry"("mailThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessArticle_slug_key" ON "BusinessArticle"("slug");

-- CreateIndex
CREATE INDEX "BusinessArticle_ownerUserId_createdAt_idx" ON "BusinessArticle"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessArticle_businessProfileId_published_createdAt_idx" ON "BusinessArticle"("businessProfileId", "published", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCostRule_key_key" ON "PlatformCostRule"("key");

-- CreateIndex
CREATE INDEX "PlatformCostRule_subject_active_sortOrder_idx" ON "PlatformCostRule"("subject", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "PlatformCostRule_updatedByUserId_updatedAt_idx" ON "PlatformCostRule"("updatedByUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "AdCampaign_status_placement_createdAt_idx" ON "AdCampaign"("status", "placement", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_ownerUserId_createdAt_idx" ON "AdCampaign"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_businessProfileId_createdAt_idx" ON "AdCampaign"("businessProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_marketListingId_createdAt_idx" ON "AdCampaign"("marketListingId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_businessArticleId_createdAt_idx" ON "AdCampaign"("businessArticleId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_subscriberTargetManuscriptId_createdAt_idx" ON "AdCampaign"("subscriberTargetManuscriptId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCampaign_imageMediaAssetId_idx" ON "AdCampaign"("imageMediaAssetId");

-- CreateIndex
CREATE INDEX "AdCampaignInterestTarget_category_idx" ON "AdCampaignInterestTarget"("category");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignInterestTarget_campaignId_category_key" ON "AdCampaignInterestTarget"("campaignId", "category");

-- CreateIndex
CREATE INDEX "AdDisplayScheduleRun_placement_scheduleDate_createdAt_idx" ON "AdDisplayScheduleRun"("placement", "scheduleDate", "createdAt");

-- CreateIndex
CREATE INDEX "AdDisplayScheduleRun_createdAt_idx" ON "AdDisplayScheduleRun"("createdAt");

-- CreateIndex
CREATE INDEX "AdDisplayScheduleSlot_placement_startsAt_endsAt_idx" ON "AdDisplayScheduleSlot"("placement", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AdDisplayScheduleSlot_campaignId_startsAt_idx" ON "AdDisplayScheduleSlot"("campaignId", "startsAt");

-- CreateIndex
CREATE INDEX "AdDisplayScheduleSlot_runId_sequence_idx" ON "AdDisplayScheduleSlot"("runId", "sequence");

-- CreateIndex
CREATE INDEX "AdCreditLedgerEntry_userId_createdAt_idx" ON "AdCreditLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdCreditLedgerEntry_sourceType_sourceId_idx" ON "AdCreditLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AdDeliveryLog_campaignId_eventType_createdAt_idx" ON "AdDeliveryLog"("campaignId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AdDeliveryLog_viewerUserId_createdAt_idx" ON "AdDeliveryLog"("viewerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdDeliveryLog_placement_createdAt_idx" ON "AdDeliveryLog"("placement", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundraiserCampaign_slug_key" ON "FundraiserCampaign"("slug");

-- CreateIndex
CREATE INDEX "FundraiserCampaign_status_category_createdAt_idx" ON "FundraiserCampaign"("status", "category", "createdAt");

-- CreateIndex
CREATE INDEX "FundraiserCampaign_creatorUserId_createdAt_idx" ON "FundraiserCampaign"("creatorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FundContributionIntent_campaignId_status_createdAt_idx" ON "FundContributionIntent"("campaignId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FundContributionIntent_contributorUserId_createdAt_idx" ON "FundContributionIntent"("contributorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FundLedgerEntry_campaignId_createdAt_idx" ON "FundLedgerEntry"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "FundLedgerEntry_sourceType_sourceId_idx" ON "FundLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WriterManuscript_slug_key" ON "WriterManuscript"("slug");

-- CreateIndex
CREATE INDEX "WriterManuscript_authorUserId_updatedAt_idx" ON "WriterManuscript"("authorUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "WriterManuscript_authorUserId_publishToStorefront_updatedAt_idx" ON "WriterManuscript"("authorUserId", "publishToStorefront", "updatedAt");

-- CreateIndex
CREATE INDEX "WriterManuscript_visibility_updatedAt_idx" ON "WriterManuscript"("visibility", "updatedAt");

-- CreateIndex
CREATE INDEX "WriterManuscriptSubscription_userId_updatedAt_idx" ON "WriterManuscriptSubscription"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "WriterManuscriptSubscription_manuscriptId_notify_idx" ON "WriterManuscriptSubscription"("manuscriptId", "notify");

-- CreateIndex
CREATE UNIQUE INDEX "WriterManuscriptSubscription_manuscriptId_userId_key" ON "WriterManuscriptSubscription"("manuscriptId", "userId");

-- CreateIndex
CREATE INDEX "WriterChapter_manuscriptId_sortOrder_idx" ON "WriterChapter"("manuscriptId", "sortOrder");

-- CreateIndex
CREATE INDEX "WriterChapter_publishedAt_updatedAt_idx" ON "WriterChapter"("publishedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_userId_readAt_createdAt_idx" ON "Alert"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuthSecurityEvent_type_createdAt_idx" ON "AuthSecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AuthSecurityEvent_userId_createdAt_idx" ON "AuthSecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthSecurityEvent_identifier_createdAt_idx" ON "AuthSecurityEvent"("identifier", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_email_expiresAt_idx" ON "EmailVerificationToken"("email", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorConfig_userId_key" ON "TwoFactorConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackTicket_publicId_key" ON "FeedbackTicket"("publicId");

-- CreateIndex
CREATE INDEX "FeedbackTicket_status_createdAt_idx" ON "FeedbackTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackTicket_reporterUserId_createdAt_idx" ON "FeedbackTicket"("reporterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackTicketEvent_ticketId_createdAt_idx" ON "FeedbackTicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "MembershipPolicyOverride_featureKey_allowed_idx" ON "MembershipPolicyOverride"("featureKey", "allowed");

-- CreateIndex
CREATE INDEX "MembershipPolicyOverride_userId_expiresAt_idx" ON "MembershipPolicyOverride"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPolicyOverride_userId_featureKey_key" ON "MembershipPolicyOverride"("userId", "featureKey");

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScientologyProfile" ADD CONSTRAINT "ScientologyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScientologyCommendation" ADD CONSTRAINT "ScientologyCommendation_scientologyProfileId_fkey" FOREIGN KEY ("scientologyProfileId") REFERENCES "ScientologyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScientologyCommendation" ADD CONSTRAINT "ScientologyCommendation_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTierUpgradeEligibility" ADD CONSTRAINT "MembershipTierUpgradeEligibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTierUpgradeEligibility" ADD CONSTRAINT "MembershipTierUpgradeEligibility_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPromotionGrant" ADD CONSTRAINT "MembershipPromotionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPromotionGrant" ADD CONSTRAINT "MembershipPromotionGrant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeAccountInviteCode" ADD CONSTRAINT "FreeAccountInviteCode_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeAccountInviteCode" ADD CONSTRAINT "FreeAccountInviteCode_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreeAccountInviteCode" ADD CONSTRAINT "FreeAccountInviteCode_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticLog" ADD CONSTRAINT "DiagnosticLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformActivityEvent" ADD CONSTRAINT "PlatformActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApplicationUsageMetric" ADD CONSTRAINT "UserApplicationUsageMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterest" ADD CONSTRAINT "UserInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryAssetComment" ADD CONSTRAINT "GalleryAssetComment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryAssetComment" ADD CONSTRAINT "GalleryAssetComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCollection" ADD CONSTRAINT "MediaCollection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCollectionAsset" ADD CONSTRAINT "MediaCollectionAsset_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MediaCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaCollectionAsset" ADD CONSTRAINT "MediaCollectionAsset_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostDismissal" ADD CONSTRAINT "FeedPostDismissal_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostDismissal" ADD CONSTRAINT "FeedPostDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "FeedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostReaction" ADD CONSTRAINT "FeedPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostReaction" ADD CONSTRAINT "FeedPostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCommentReaction" ADD CONSTRAINT "FeedCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCommentReaction" ADD CONSTRAINT "FeedCommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRelationship" ADD CONSTRAINT "SocialRelationship_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyRelationshipRequest" ADD CONSTRAINT "FamilyRelationshipRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyRelationshipRequest" ADD CONSTRAINT "FamilyRelationshipRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRelationshipRequest" ADD CONSTRAINT "FriendRelationshipRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRelationshipRequest" ADD CONSTRAINT "FriendRelationshipRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatParticipant" ADD CONSTRAINT "EncryptedChatParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EncryptedChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatParticipant" ADD CONSTRAINT "EncryptedChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatMessage" ADD CONSTRAINT "EncryptedChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EncryptedChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatMessage" ADD CONSTRAINT "EncryptedChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatMessage" ADD CONSTRAINT "EncryptedChatMessage_senderDeviceId_fkey" FOREIGN KEY ("senderDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatEnvelope" ADD CONSTRAINT "EncryptedChatEnvelope_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EncryptedChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatEnvelope" ADD CONSTRAINT "EncryptedChatEnvelope_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedChatEnvelope" ADD CONSTRAINT "EncryptedChatEnvelope_recipientDeviceId_fkey" FOREIGN KEY ("recipientDeviceId") REFERENCES "UserDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailThread" ADD CONSTRAINT "MailThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRecipient" ADD CONSTRAINT "MailRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRecipient" ADD CONSTRAINT "MailRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttachment" ADD CONSTRAINT "MailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttachment" ADD CONSTRAINT "MailAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailContact" ADD CONSTRAINT "MailContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailContact" ADD CONSTRAINT "MailContact_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailPreference" ADD CONSTRAINT "MailPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSenderOptOut" ADD CONSTRAINT "MailSenderOptOut_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSenderOptOut" ADD CONSTRAINT "MailSenderOptOut_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupUserPin" ADD CONSTRAINT "GroupUserPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupUserPin" ADD CONSTRAINT "GroupUserPin_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumThread" ADD CONSTRAINT "GroupForumThread_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumThread" ADD CONSTRAINT "GroupForumThread_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumThread" ADD CONSTRAINT "GroupForumThread_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumThread" ADD CONSTRAINT "GroupForumThread_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumPost" ADD CONSTRAINT "GroupForumPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "GroupForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumPost" ADD CONSTRAINT "GroupForumPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumPost" ADD CONSTRAINT "GroupForumPost_parentPostId_fkey" FOREIGN KEY ("parentPostId") REFERENCES "GroupForumPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumPost" ADD CONSTRAINT "GroupForumPost_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumThreadReaction" ADD CONSTRAINT "GroupForumThreadReaction_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "GroupForumThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumThreadReaction" ADD CONSTRAINT "GroupForumThreadReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumPostReaction" ADD CONSTRAINT "GroupForumPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GroupForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupForumPostReaction" ADD CONSTRAINT "GroupForumPostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAsset" ADD CONSTRAINT "GroupAsset_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAsset" ADD CONSTRAINT "GroupAsset_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAsset" ADD CONSTRAINT "GroupAsset_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAssetComment" ADD CONSTRAINT "GroupAssetComment_groupAssetId_fkey" FOREIGN KEY ("groupAssetId") REFERENCES "GroupAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAssetComment" ADD CONSTRAINT "GroupAssetComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventModerator" ADD CONSTRAINT "EventModerator_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventModerator" ADD CONSTRAINT "EventModerator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvitation" ADD CONSTRAINT "EventInvitation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvitation" ADD CONSTRAINT "EventInvitation_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventInvitation" ADD CONSTRAINT "EventInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListingPhoto" ADD CONSTRAINT "MarketListingPhoto_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListingPhoto" ADD CONSTRAINT "MarketListingPhoto_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobListing" ADD CONSTRAINT "JobListing_employerUserId_fkey" FOREIGN KEY ("employerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorProfile" ADD CONSTRAINT "AuditorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessInquiry" ADD CONSTRAINT "BusinessInquiry_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessArticle" ADD CONSTRAINT "BusinessArticle_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessArticle" ADD CONSTRAINT "BusinessArticle_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessArticle" ADD CONSTRAINT "BusinessArticle_coverMediaAssetId_fkey" FOREIGN KEY ("coverMediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCostRule" ADD CONSTRAINT "PlatformCostRule_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "BusinessProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_marketListingId_fkey" FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_businessArticleId_fkey" FOREIGN KEY ("businessArticleId") REFERENCES "BusinessArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_subscriberTargetManuscriptId_fkey" FOREIGN KEY ("subscriberTargetManuscriptId") REFERENCES "WriterManuscript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_imageMediaAssetId_fkey" FOREIGN KEY ("imageMediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignInterestTarget" ADD CONSTRAINT "AdCampaignInterestTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDisplayScheduleSlot" ADD CONSTRAINT "AdDisplayScheduleSlot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AdDisplayScheduleRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDisplayScheduleSlot" ADD CONSTRAINT "AdDisplayScheduleSlot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreditLedgerEntry" ADD CONSTRAINT "AdCreditLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDeliveryLog" ADD CONSTRAINT "AdDeliveryLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDeliveryLog" ADD CONSTRAINT "AdDeliveryLog_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraiserCampaign" ADD CONSTRAINT "FundraiserCampaign_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundContributionIntent" ADD CONSTRAINT "FundContributionIntent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FundraiserCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundContributionIntent" ADD CONSTRAINT "FundContributionIntent_contributorUserId_fkey" FOREIGN KEY ("contributorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundLedgerEntry" ADD CONSTRAINT "FundLedgerEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FundraiserCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterManuscript" ADD CONSTRAINT "WriterManuscript_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterManuscriptSubscription" ADD CONSTRAINT "WriterManuscriptSubscription_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "WriterManuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterManuscriptSubscription" ADD CONSTRAINT "WriterManuscriptSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriterChapter" ADD CONSTRAINT "WriterChapter_manuscriptId_fkey" FOREIGN KEY ("manuscriptId") REFERENCES "WriterManuscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSecurityEvent" ADD CONSTRAINT "AuthSecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorConfig" ADD CONSTRAINT "TwoFactorConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTicket" ADD CONSTRAINT "FeedbackTicket_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTicketEvent" ADD CONSTRAINT "FeedbackTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "FeedbackTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPolicyOverride" ADD CONSTRAINT "MembershipPolicyOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPolicyOverride" ADD CONSTRAINT "MembershipPolicyOverride_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
