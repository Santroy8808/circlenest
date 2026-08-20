# Theta-Space iOS Native Client Package Plan

Status: planned  
Primary scope: Free and Contributor only  
Excluded from the first package: Professional, Auditor, Org, in-app purchases, and business creation tools

## Objective

Create a native Theta-Space iOS application for iPhone using SwiftUI. The iOS app will use the existing production website, PostgreSQL database, Cloudflare R2 storage, and `/api/mobile/*` backend. It will not create a second website or a second data platform.

The first distributable target is a signed TestFlight beta. App Store submission follows only after the beta is stable and the legal developer-account identity is settled.

## Proposed Package

- Repository: `C:\Repos\Theta-Space-net\ThetaSpaceIOS`
- Product name: `Theta-Space`
- Platform: iPhone first; iPad layout follows after iPhone beta
- UI: SwiftUI
- Networking: `URLSession` with typed `Codable` request and response models
- Authentication storage: iOS Keychain
- Media: Photos picker, camera where available, and the existing R2 upload-intent flow
- Environments: Development, Staging, Production
- Initial deployment target: iOS 17, reviewed after the tester-device audit
- Tentative bundle identifier: `net.thetaspace.app` (finalize with the Apple developer account)

## Testing Equipment

### Xcode Simulator

Xcode includes simulated iPhones. The simulator is appropriate for:

- screen sizes, rotation, and safe areas;
- light and dark themes;
- Dynamic Type and basic VoiceOver inspection;
- navigation, forms, lists, empty states, and error states;
- mock and live API responses;
- slow-network and offline UI behavior.

The simulator is not sufficient proof for:

- camera and real photo-library behavior;
- APNs push notifications;
- Keychain and device-credential lifecycle;
- background uploading and app termination;
- cellular-network transitions;
- physical keyboard behavior, performance, heat, or battery use.

### Physical iPhone

The available iPhone 14 or 15 will be the primary physical beta device. Record only:

- Model Name;
- iOS Version;
- available storage.

Do not place its serial number, IMEI, Apple Account password, or device passcode in repository documentation.

### Mac compatibility gate

Before creating the Xcode project, record from **Apple menu → About This Mac**:

- Mac model and year;
- processor (Intel or Apple silicon);
- installed macOS version;
- RAM;
- free disk space.

Compare that macOS version with Apple's current Xcode support table. Use this decision order:

1. Use the existing Mac if it supports a suitable current Xcode.
2. Upgrade the Mac through Apple's supported macOS upgrade path when possible.
3. Use the Mac for editing/device work and a hosted macOS CI runner for signed builds if practical.
4. Obtain or rent a supported Mac if the existing machine cannot run the required toolchain reliably.

Windows browser device emulation is useful for responsive website checks but is not an iOS app emulator and cannot produce the signed iOS package.

## Phase 0 — Accounts, Hardware, and Distribution Decision

- [ ] Audit the Mac specifications and supported Xcode version.
- [ ] Confirm the iPhone model and iOS version.
- [ ] Install Xcode and its iOS Simulator components.
- [ ] Sign into Xcode with a dedicated Apple Account.
- [ ] Decide individual versus organization Apple Developer enrollment.
- [ ] If enrolling as an organization, obtain the legal entity and D-U-N-S information first.
- [ ] Decide the final bundle identifier and App Store seller name.
- [ ] Create Development and Staging backend configurations.

Exit condition: Xcode builds a blank signed Theta-Space application in a simulator and on the physical iPhone.

## Phase 1 — Freeze and Document the Mobile API Contract

The Android Java implementation already consumes the required backend. Before duplicating that client behavior in Swift, define stable typed contracts for:

- `/api/mobile/login`, session refresh, logout, revocation, and password recovery;
- `/api/mobile/me` and membership capabilities;
- `/api/mobile/feed` posts, comments, reactions, replies, quote replies, shares, and cursors;
- `/api/mobile/gallery` upload intent, R2 upload, completion, visibility, and deletion;
- `/api/mobile/chat` threads and messages;
- people, connections, family requests, and friend requests;
- groups, group membership, and group moderation;
- Market browse, listing details, creation, editing, and media;
- profile and My Scientology data;
- notifications and alerts;
- Writers Corner and subscriptions;
- invites when individually administrator-granted.

Contract requirements:

- typed success and error envelopes;
- stable error codes plus human-readable messages;
- cursor pagination rules;
- UTC date format;
- upload-purpose and visibility combinations;
- Free and Contributor capabilities returned by the server;
- backward compatibility with the current Android application.

Exit condition: contract tests prove that Android, iOS, and the web backend agree on payloads and errors.

## Phase 2 — iOS Project Foundation

Create these initial areas without feature UI:

```text
ThetaSpaceIOS/
  App/
  Core/Authentication/
  Core/Networking/
  Core/Storage/
  Core/DesignSystem/
  Core/Models/
  Features/
  Resources/
  ThetaSpaceTests/
  ThetaSpaceUITests/
```

- [ ] Add Development, Staging, and Production configurations.
- [ ] Build a typed API client with cancellation, timeouts, and retry rules.
- [ ] Store tokens only in Keychain, never `UserDefaults` or source files.
- [ ] Add a shared Theta-Space light/dark design system.
- [ ] Implement structured redacted logging that never prints tokens or private message bodies.
- [ ] Add global loading, empty, offline, expired-session, and error states.
- [ ] Add remote image loading with bounded memory and disk caching.

Exit condition: the app can securely call `/api/mobile/me`, restore a session, and display a native authenticated shell.

## Phase 3 — Authentication and Account Safety

- [ ] Login and validation.
- [ ] Forgot/reset password entry.
- [ ] Device-token registration and refresh.
- [ ] Persistent login across launches.
- [ ] Token-expiration refresh and safe forced logout.
- [ ] Logout and server-side device revocation.
- [ ] Face ID/Touch ID unlock as an optional local convenience, never a replacement for the server token.
- [ ] Terms acceptance state and dedicated Terms page.

Physical-device proof is mandatory for Keychain persistence, device revocation, biometric fallback, reinstall behavior, and expired credentials.

## Phase 4 — Free Tier Native Beta

Build and prove one feature module at a time in this order:

1. Home Stream: chronological public posts, text and photo composition, comments, reactions, replies, quote replies, and sharing.
2. Profiles and My Pics: profile view/edit, gallery, upload, visibility, comments, avatar, and banner.
3. People: browse, search, profile view, friend/family requests, and blocking.
4. Groups: browse, join, create, post, media upload, and creator moderation.
5. Comm Center: thread list, direct chat, reactions, replies, quote replies, and image messages.
6. Market: browse, search, listing details, one active personal listing, editing, and up to three listing photos.
7. Notifications and alerts supported by the current tier.
8. Settings: profile, security, subscription display, Tutorial, Users Manual, Feedback Center, and Progression Path.

Free Tier restrictions must come from backend capabilities. Hidden features remain absent rather than opening an unavailable screen.

Exit condition: a Free account can complete the same supported end-to-end tasks on iPhone as on the website without exposing Contributor creation tools.

## Phase 5 — Contributor Native Beta

- [ ] Writers Corner manuscripts and chapters.
- [ ] Reader subscriptions and chapter notifications.
- [ ] Contributor storage and Market limits.
- [ ] Contributor Stream controls that are actually operational.
- [ ] Contributor-only support requests.
- [ ] Tier-aware navigation with no Professional, Auditor, Org, or business-creation leakage.

Do not add purchase controls in the first package. Existing Contributor accounts may use Contributor features; enrollment or purchase is handled separately until Apple's payment requirements are implemented.

Exit condition: Contributor-specific regression testing passes without changing Free Tier behavior.

## Phase 6 — Native iOS Capabilities

- [ ] APNs registration and backend push-token storage.
- [ ] Push notification deep links to posts, messages, and supported alerts.
- [ ] Universal Links for Theta-Space URLs.
- [ ] Native share sheet.
- [ ] Background-safe image uploads with visible progress and recovery.
- [ ] Local draft preservation for posts and messages.
- [ ] Camera and photo-library permission explanations.

Exit condition: every capability is proven on the physical iPhone, including denial and recovery paths.

## Phase 7 — Visual, Accessibility, and Reliability QA

Simulator matrix:

- smallest supported iPhone screen;
- iPhone 14/15 standard-size simulator;
- large/Max-size iPhone;
- current and oldest supported iOS simulator runtimes where Xcode provides them.

For every feature verify:

- portrait and landscape where supported;
- keyboard avoidance and submit-button visibility;
- safe areas, Dynamic Island, home indicator, and navigation bars;
- light and dark themes;
- Dynamic Type through accessibility sizes;
- VoiceOver labels and logical focus order;
- Reduce Motion and increased contrast;
- no clipped borders, text, controls, menus, sheets, or alerts;
- loading, empty, offline, timeout, revoked, forbidden, and server-error states;
- slow connection, dropped connection, app backgrounding, and relaunch;
- no visible developer errors or raw XML/storage responses.

Required automated checks:

- Swift compiler warnings treated seriously;
- Swift unit tests for models, API parsing, membership policy, and retries;
- mocked networking tests using `URLProtocol`;
- API contract tests against Staging;
- XCUITest smoke flows for login, Stream, upload, message, group, Market, and logout;
- memory and responsiveness inspection with Instruments.

## Phase 8 — Signing and TestFlight

- [ ] Create App ID, certificates, and automatic signing configuration.
- [ ] Add the physical iPhone through Xcode for development testing.
- [ ] Create App Store Connect application record.
- [ ] Prepare icon, screenshots, privacy disclosures, support URL, privacy-policy URL, and review notes.
- [ ] Provide Apple with a working review account for the invite-only application.
- [ ] Archive and upload the first internal TestFlight build.
- [ ] Complete external TestFlight beta review when ready.
- [ ] Run staged testing: owner device, small internal group, then invited external testers.

## Phase 9 — App Store Readiness

- [ ] Resolve the Contributor purchase method before exposing purchase UI.
- [ ] Complete account deletion and data-management review requirements.
- [ ] Verify privacy nutrition labels against actual collection and SDK behavior.
- [ ] Confirm all production URLs and support contacts.
- [ ] Remove test accounts, test endpoints, placeholder content, and debug logging from the release configuration.
- [ ] Submit only after TestFlight crash, upload, session, and notification results are stable.

## Release Gates

An iOS package is not ready when it merely launches. Each beta build must pass:

1. compile and unit tests;
2. simulator screen-size matrix;
3. physical-device authentication and upload tests;
4. server permission and tier enforcement;
5. light/dark and accessibility review;
6. session restore, offline, and revoked-device recovery;
7. TestFlight installation and upgrade from the prior build;
8. documented known limitations and rollback instructions.

## Immediate Next Actions

1. Collect the non-sensitive Mac and iPhone specifications.
2. Determine whether the Mac supports an appropriate Xcode version.
3. Decide Apple Developer individual versus organization enrollment.
4. Create `ThetaSpaceIOS` and prove a blank SwiftUI application in Simulator and on the iPhone.
5. Start the mobile API contract inventory before implementing feature screens.
