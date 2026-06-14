# Production Smoke Tests

Use this after a production deploy.

## Before you start

- Be signed in with a normal user account.
- Confirm the app loads without a white screen.
- Keep the browser on the production site.

## 1) Login

- Open the login page.
- Sign in with a known working account.
- Confirm you land on the home feed.

## 2) Signup and invitations

- Open signup.
- Confirm an invitation code is required.
- Try a valid invitation code.
- Confirm the account can be created.
- Confirm the email verification notice appears.

## 3) Feed

- Open Home.
- Confirm posts render.
- Switch feed modes if your tier allows it.
- Confirm the stream still scrolls normally.

## 4) Posts and comments

- Create a text post.
- Open a post.
- Add a comment.
- Add a reply to the comment.
- Confirm the thread stays in the same page.

## 5) Messages

- Open Messages.
- Start a direct message.
- Send a message.
- Reply in the thread.
- Confirm the thread shows the new message in order.

## 6) Groups

- Open Groups.
- Create a group if your tier allows it.
- Join a group.
- Approve or deny a join request if you are a moderator.
- Remove a member if you are a moderator.

## 7) Events

- Open Events.
- Create an event if your tier allows it.
- Add invitees and moderators if allowed.
- Confirm invite-only events open correctly.

## 8) Bazaar

- Open Bazaar.
- Create a listing if your tier allows it.
- Confirm listings render correctly.

## 9) Jobs

- Open Hiring Board.
- Create a hiring post if your tier allows it.
- Confirm ads appear where expected.

## 10) Auditors

- Open Find an Auditor.
- Search and filter the list.
- Open an auditor profile.
- Confirm the listing renders correctly.

## 11) Uploads

- Open Gallery or group photos.
- Upload a photo.
- Confirm the image appears.
- Confirm the upload count or storage usage updates.

## 12) Admin

- Open Admin Portal if you are an admin.
- Confirm member tier controls load.
- Confirm moderation and audit pages load.

## 13) Tier gates

- Confirm Free users see locked controls.
- Confirm Contributor users can create events, Bazaar listings, and jobs.
- Confirm Pro users see ad-credit behavior.
- Confirm Admin stays separate from paid tiers.

## 14) Moderation gates

- Confirm only moderators/admins can approve, deny, kick, or assign where allowed.
- Confirm non-moderators cannot access those controls.

## If something fails

- Capture the page URL.
- Capture the visible error.
- Check the production logs.
- Stop and rollback only if the smoke failure is production-impacting.
