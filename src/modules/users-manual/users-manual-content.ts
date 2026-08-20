export type UsersManualDefinition = {
  term: string;
  definition: string;
};

export type UsersManualFaq = {
  question: string;
  answer: string;
};

export type UsersManualFeature = {
  title: string;
  href: string;
  purpose: string;
  howToUse: string[];
  limits: string[];
  faq: UsersManualFaq[];
  visual: {
    title: string;
    caption: string;
    callouts: string[];
  };
};

export type UsersManualSection = {
  key: string;
  title: string;
  summary: string;
  features: UsersManualFeature[];
};

export type UsersManual = {
  definitions: UsersManualDefinition[];
  freeTierBasics: string[];
  contributorTierBasics: string[];
  sections: UsersManualSection[];
};

export const usersManualDefinitions: UsersManualDefinition[] = [
  {
    term: "Free Tier",
    definition: "The basic Theta-Space membership level. It includes marketplace browsing and limited listing creation, plus profile, stream, contacts, groups, pictures, and messages."
  },
  {
    term: "Contributor Tier",
    definition: "A community membership level with expanded storage and approved Contributor tools. Contributors use the same unified Marketplace for offers, wanted requests, jobs, rentals, services, goods, vehicles, and eligible auditor listings."
  },
  {
    term: "Stream",
    definition: "The main social feed where members read posts, create updates, react, comment, reply, and share."
  },
  {
    term: "Post",
    definition: "A public update placed on the Stream. A post may contain text, a link, and when available, a picture."
  },
  {
    term: "Comment",
    definition: "A response under a post or picture. Comments can continue the discussion without creating a separate post."
  },
  {
    term: "Reply",
    definition: "A response to a specific message or comment. Use it when the conversation needs to stay attached to one item."
  },
  {
    term: "Quote Reply",
    definition: "A reply that keeps the original message visible for context. Use it when a normal reply would be unclear."
  },
  {
    term: "Reaction",
    definition: "A quick response button, such as the triangle reaction, used to acknowledge a post, comment, picture, or message."
  },
  {
    term: "My Pics",
    definition: "Your personal gallery. This is where uploaded pictures can be viewed, tagged, commented on, and used as your avatar or banner."
  },
  {
    term: "Avatar",
    definition: "The profile picture shown beside your name in posts, messages, comments, and profile areas."
  },
  {
    term: "Banner",
    definition: "The larger profile header image shown on profile and gallery pages when selected."
  },
  {
    term: "Conduct Report",
    definition: "A request for the moderation team to review one eligible public or group interaction. A report is not proof that someone broke a rule."
  },
  {
    term: "Commendation",
    definition: "Positive recognition you send for one eligible interaction. Commendations received appear in the private Reports and Commendations area."
  },
  {
    term: "Dispute",
    definition: "A structured discussion about a conduct report. Required participants or an authorized moderator must explicitly resolve it; it does not close merely because time passed."
  },
  {
    term: "Visibility",
    definition: "The audience setting for a picture or item. Some uploads are public, some are members-only, and some can be private depending on where they are used."
  },
  {
    term: "Comm Center",
    definition: "The communication area for direct messages, group conversations, notifications, and alerts. Internal mail is not currently part of Free Tier use."
  },
  {
    term: "Friend",
    definition: "A normal social connection between two members."
  },
  {
    term: "Family",
    definition: "A relationship request that describes who the other person is to you, such as spouse, sibling, parent, child, or another family relationship."
  },
  {
    term: "Group",
    definition: "A shared member space for a topic or community. Groups can have members, discussion, and media depending on the group setup."
  },
  {
    term: "Market Listing",
    definition: "An offer or wanted request published in the unified Marketplace. A listing can describe goods, a vehicle, a rental, a service, a job, or an auditor practice."
  },
  {
    term: "Auditor Directory",
    definition: "A searchable reference directory for churches, advanced organizations, field auditors, and field groups. Directory records are separate from member-created Marketplace listings."
  },
  {
    term: "Storage",
    definition: "The amount of personal uploaded media your account can hold. Free Tier storage is currently 200 MB and Contributor storage is currently 2 GB for gallery files, group uploads, and message images. Text posts do not count toward this file-storage limit. If cancellation leaves an account over the Free limit, Theta-Space archives and compresses the oldest excess files. Small previews remain available, and the archived files can be prepared one at a time for viewing or requested as a ZIP download."
  },
  {
    term: "Stream retention",
    definition: "Normal Stream posts are active content, not permanent storage. Public Stream media may be re-encoded and resized after 48 hours without a view, moved out of the active Stream after 1 week, and permanently deleted after 3 months. These limits may change."
  },
  {
    term: "Invite-Only",
    definition: "Theta-Space is not open public registration. New members enter through an invite path. Some users may be individually allowed to create invites."
  }
];

export const freeTierBasics = [
  "Free Tier personal file storage is currently 200 MB for Gallery, group uploads, and message images.",
  "If a Contributor downgrade leaves more than 200 MB stored, Theta-Space archives and compresses the oldest excess files. Gallery keeps small previews; request one temporary full-file view at a time or a ZIP download from Subscription.",
  "Text-only posts do not count against the 200 MB personal file-storage limit.",
  "Public Stream posts from Communicate may have images compressed after 48 hours without a view, archived after 1 week, and permanently deleted after 3 months. These limits may change.",
  "Free Tier marketplace creation is limited to 3 new listings per 14-day period, including offers and wanted requests of every listing type.",
  "Each Free Tier marketplace listing can have up to 3 photos or videos.",
  "Marketplace publishing is free during the current rollout. A future fee system is reserved but is not active.",
  "Business profiles, storefronts, business identity switching, ads, Writers Corner, fundraiser creation, and business tools are not Free Tier functions.",
  "Events are not yet available for Free Tier use.",
  "Internal mail is currently hidden/unavailable; use Messages in Comm Center instead.",
  "Notification behavior is primarily being prepared for the mobile app, but visible web notifications and alerts can still be reviewed when present.",
  "Invite creation appears only when the account is eligible or an admin has granted that ability."
];

export const contributorTierBasics = [
  "Contributor accounts keep the core tools: Marketplace, Stream, Contacts, Groups, My Pics, Messages, and Settings.",
  "Contributor personal file storage is currently 2 GB. Cancelling changes the account to Free at the end of the paid period. If storage exceeds 200 MB then, Theta-Space archives and compresses the oldest excess files instead of silently deleting them.",
  "Contributor accounts can browse, create, edit, renew, and manage unified Marketplace listings and use Writers Corner manuscripts.",
  "Contributor accounts do not receive Business Center, storefront administration, business identity switching, Events, Fundraisers, or general ad creation.",
  "When a Contributor capability is unavailable, its menu item, page, upgrade prompt, and direct feature controls are hidden rather than shown as a gate.",
  "Use the current Subscription page and the visible menus as the source of truth for limits; a manual entry never grants access."
];

export const usersManualSections: UsersManualSection[] = [
  {
    key: "getting-started",
    title: "Getting Started",
    summary: "Orientation to the main controls: Home, top navigation, left control panel, search, theme, and basic account movement.",
    features: [
      {
        title: "Home and main navigation",
        href: "/home",
        purpose: "Use Home as the starting point for the Stream and daily site activity.",
        howToUse: [
          "Open Home to read the latest Stream activity.",
          "Use the top icon bar for fast access to Home, My Pics, Marketplace, Search, and Comm Center. Contacts and Groups are under Comm Center.",
          "Use Marketplace on the control panel for offers, wanted requests, goods, vehicles, rentals, services, jobs, and auditor listings.",
          "Use the left Control Panel for section menus and related actions.",
          "Use Logout from the Home section when you are done on a shared computer."
        ],
        limits: ["Some menu entries are hidden when they are not part of Free Tier.", "If a feature says Coming Soon or Not yet available, it is not ready for normal use."],
        faq: [
          {
            question: "Where should I start each time I log in?",
            answer: "Start at Home. It gives you the Stream and the fastest path to posting, reading, and moving to other areas."
          },
          {
            question: "Why do some tools not appear for me?",
            answer: "Free Tier only shows core user functions. Business, paid, and unfinished features are hidden or marked unavailable."
          }
        ],
        visual: {
          title: "Main navigation reference",
          caption: "Use top icons for fast movement and the Control Panel for detailed section links.",
          callouts: ["Top icons open primary areas.", "Control Panel shows section actions.", "Home returns you to the Stream."]
        }
      },
      {
        title: "Search",
        href: "/search",
        purpose: "Find people, content, listings, and available platform areas from one search area.",
        howToUse: ["Click the search icon or use the Search field.", "Type a name, keyword, listing term, or topic.", "Open the result that matches what you are looking for."],
        limits: ["Search only returns content you are allowed to view.", "Private content does not appear to people outside its audience."],
        faq: [
          {
            question: "Can I search private pictures or private conversations?",
            answer: "No. Search respects visibility. Content you cannot view should not appear in your results."
          },
          {
            question: "What should I search for?",
            answer: "Use names, usernames, topics, marketplace terms, group names, or profile information that the owner has made visible."
          }
        ],
        visual: {
          title: "Search reference",
          caption: "Search is available from the top navigation and the Home section.",
          callouts: ["Enter a clear keyword.", "Review matching areas.", "Open only the result you intended."]
        }
      },
      {
        title: "Light and dark mode",
        href: "/home",
        purpose: "Switch the site appearance for readability.",
        howToUse: ["Use the sun/moon theme control in the top bar.", "Choose the mode that is easiest to read in your environment."],
        limits: ["Theme changes affect your display only.", "If text is hard to read in either mode, report it through feedback."],
        faq: [
          {
            question: "Does theme mode change what other users see?",
            answer: "No. It only changes your own display."
          },
          {
            question: "What should I do if something is unreadable?",
            answer: "Use the feedback/help route and include the page name and whether you were in light or dark mode."
          }
        ],
        visual: {
          title: "Theme control reference",
          caption: "The theme control changes readability without changing your account or content.",
          callouts: ["Find the theme button in the top bar.", "Switch modes.", "Report unreadable areas."]
        }
      }
    ]
  },
  {
    key: "stream",
    title: "Stream, Posts, Comments, and Reactions",
    summary: "How to read the Stream, create a post, add pictures, react, comment, reply, quote reply, and share.",
    features: [
      {
        title: "Read and filter the Stream",
        href: "/home",
        purpose: "Read platform activity and focus on the Latest stream or posts shared with Friends.",
        howToUse: ["Open Home.", "Use the Stream filters to switch between Latest and Friends.", "Open a post or picture to read the full discussion when needed."],
        limits: ["Filters only show content you are allowed to view.", "Announcements may be pinned or highlighted by the platform."],
        faq: [
          {
            question: "What is Latest?",
            answer: "Latest is the current general Stream view, ordered by recent activity."
          },
          {
            question: "Can I hide an announcement?",
            answer: "If a dismiss option is shown, you can dismiss it from your own view. Platform-wide notices may still exist for other users."
          }
        ],
        visual: {
          title: "Stream filters reference",
          caption: "Use the available filters to narrow the Stream to the activity you want to read.",
          callouts: ["Choose Latest or Friends.", "Read visible posts.", "Open discussions for details."]
        }
      },
      {
        title: "Create a standard post",
        href: "/home",
        purpose: "Share a text update, link, or picture with the member Stream.",
        howToUse: [
          "Click Communicate or the post composer.",
          "Type your message in plain language.",
          "Attach a picture when the picture button is available.",
          "Submit the post and check that it appears in the Stream."
        ],
        limits: ["Do not post private information you do not want members to see.", "Pictures count toward your 200 MB Free Tier personal file storage.", "Text-only posts do not count toward personal file storage.", "Public Stream images may be compressed after 48 hours without a view; public Stream posts may be archived after 1 week and permanently deleted after 3 months.", "Uploaded pictures must use allowed visibility for the place where they are posted."],
        faq: [
          {
            question: "Are Stream posts public?",
            answer: "The main Stream is intended for member-facing public communication. Do not put private or sensitive information in a normal Stream post."
          },
          {
            question: "Can I post only a picture?",
            answer: "Yes, when the picture upload button is available. A short description is still recommended so people understand the picture."
          }
        ],
        visual: {
          title: "Post composer reference",
          caption: "The composer is where you create Stream updates.",
          callouts: ["Open Communicate.", "Type the message.", "Attach picture if needed."]
        }
      },
      {
        title: "React, comment, reply, quote reply, and share",
        href: "/home",
        purpose: "Interact with posts, pictures, comments, and discussions without creating unrelated new posts.",
        howToUse: [
          "Use a reaction for quick acknowledgement.",
          "Use Comment to respond to the post or picture.",
          "Use Reply for a specific comment or message.",
          "Use Quote Reply when your response needs the original text visible.",
          "Use Share when you want to send or reference the item through an available share path."
        ],
        limits: ["Comments and replies follow the visibility of the item they are attached to.", "If comments are disabled on a picture or item, you cannot add a comment there."],
        faq: [
          {
            question: "When should I reply instead of comment?",
            answer: "Reply when you are answering one specific person or one specific message. Comment when you are responding to the overall post."
          },
          {
            question: "When should I quote reply?",
            answer: "Use quote reply when the conversation has moved on and your reply would not make sense without showing the original message."
          }
        ],
        visual: {
          title: "Interaction controls reference",
          caption: "Reactions, comments, replies, quote replies, and shares keep discussion attached to the right item.",
          callouts: ["React quickly.", "Comment on the item.", "Reply or quote reply when context matters."]
        }
      }
    ]
  },
  {
    key: "profile-pictures",
    title: "Profile and Pictures",
    summary: "Edit your profile, manage My Pics, set avatar/banner images, control visibility, and understand storage.",
    features: [
      {
        title: "Profile",
        href: "/profile",
        purpose: "Show who you are to other members and provide a starting point for your activity.",
        howToUse: ["Open Profile from Settings or the top avatar.", "Review what other members can see.", "Use Edit Profile to update display name, bio, avatar, banner, and location."],
        limits: ["Only enter profile information you are comfortable sharing with the intended audience.", "Location should be city-level, not a private street address."],
        faq: [
          {
            question: "What is my avatar?",
            answer: "Your avatar is the small profile image shown next to your name across the site."
          },
          {
            question: "What is my banner?",
            answer: "Your banner is the larger header image shown on profile and gallery pages when selected."
          }
        ],
        visual: {
          title: "Profile reference",
          caption: "Your profile combines your identity, pictures, and public-facing information.",
          callouts: ["Check your display name.", "Review avatar and banner.", "Edit only what you want visible."]
        }
      },
      {
        title: "My Pics",
        href: "/profile/gallery",
        purpose: "Upload, view, tag, and manage your pictures.",
        howToUse: [
          "Open My Pics from Home, Settings, or the gallery icon.",
          "Upload pictures from the gallery upload page or from places that allow picture attachment.",
          "Open a picture to view the larger image and discussion.",
          "Use available controls to set that exact picture as your avatar or banner.",
          "To delete pictures, select one or more, confirm the warning, and enter the DELETE password. The pictures hide immediately while secure storage removal is verified.",
          "Watch Secure deletion for Deletion queued, Removing photos, or Action needed. If Action needed appears, review the explanation and use Retry with fresh DELETE-password confirmation."
        ],
        limits: ["Free Tier personal file storage is 200 MB.", "Visibility can be changed only through available picture settings.", "If comments are disabled by visibility or settings, discussion controls may not appear.", "System-managed pictures cannot be selected or deleted.", "A picture still used by a live post, message, listing, or other feature must be detached there before deletion can begin."],
        faq: [
          {
            question: "Can I change a picture after upload?",
            answer: "You can change supported settings such as tags, visibility, comments, avatar, or banner when those controls are shown."
          },
          {
            question: "Why should I tag a picture?",
            answer: "Tags help organize pictures and make them easier to understand later."
          },
          {
            question: "Can I delete a picture?",
            answer: "Yes. Select the picture, confirm the warning, and enter the DELETE password. It disappears from normal views immediately, but secure removal continues in the background until every stored copy is verified absent."
          },
          {
            question: "Why does deletion say Action needed?",
            answer: "Secure storage removal did not finish. Read the safe explanation, detach the picture from any feature still using it when requested, then choose Retry and confirm with the DELETE password again."
          },
          {
            question: "How do I know my avatar or banner changed?",
            answer: "The action reports success only after Theta-Space confirms that the exact selected My Pics image was applied to the exact avatar or banner field. A failed or mismatched response leaves your profile unchanged and shows an error."
          }
        ],
        visual: {
          title: "My Pics reference",
          caption: "The gallery is the main place to manage personal images.",
          callouts: ["Open a picture.", "Review visibility/comments.", "Set avatar or banner if desired."]
        }
      },
      {
        title: "Picture visibility and comments",
        href: "/profile/gallery",
        purpose: "Control who can view or discuss pictures where those options are available.",
        howToUse: ["Open the picture.", "Find Visibility and Comments settings.", "Choose the audience/comment option that matches the picture's purpose.", "Save the change if a save action is shown."],
        limits: ["Some upload purposes require a specific visibility.", "Moving between private and public use may depend on available storage and media controls.", "Visibility does not make inappropriate content acceptable."],
        faq: [
          {
            question: "What should be public?",
            answer: "Use public/member-visible settings only for pictures you are comfortable showing to the intended audience."
          },
          {
            question: "Can others comment on every picture?",
            answer: "No. Comments depend on the picture visibility and comment settings."
          }
        ],
        visual: {
          title: "Picture settings reference",
          caption: "Picture settings control audience, comments, and profile usage.",
          callouts: ["Open picture details.", "Choose visibility.", "Check comments."]
        }
      }
    ]
  },
  {
    key: "comm-center",
    title: "Comm Center, Messages, Notifications, and Alerts",
    summary: "Use direct messages and understand current communication limitations.",
    features: [
      {
        title: "Messages",
        href: "/messages",
        purpose: "Send direct or group messages where conversations are available.",
        howToUse: ["Open Comm Center.", "Choose an existing thread or start a message from an available contact path.", "Type the message.", "Use reactions, reply, quote reply, or picture attachment where available."],
        limits: ["Internal mail is not currently available.", "Message attachments may count toward storage or upload rules.", "Do not send private information to someone unless you trust the recipient."],
        faq: [
          {
            question: "What is the difference between Messages and Mail?",
            answer: "Messages are the current live communication feature. Mail is hidden/unavailable for now."
          },
          {
            question: "Can I react to a message?",
            answer: "Yes, use the message reaction controls when they are shown."
          },
          {
            question: "Can I reply to a specific message?",
            answer: "Yes, use Reply or Quote Reply when available to keep the conversation clear."
          }
        ],
        visual: {
          title: "Messages reference",
          caption: "Use Messages for current direct communication.",
          callouts: ["Pick a thread.", "Write the message.", "React, reply, or quote reply when needed."]
        }
      },
      {
        title: "Notifications and alerts",
        href: "/notifications",
        purpose: "Review visible notices about activity, alerts, or account-related signals.",
        howToUse: ["Open Notifications or Alerts from Comm Center.", "Read the notice.", "Open the linked item when one is provided.", "Mark read or clear items when controls are shown."],
        limits: ["Some notification behavior is primarily intended for the mobile app.", "Mail-related notifications should not appear while mail is unavailable."],
        faq: [
          {
            question: "Why do I see fewer notification controls on the web?",
            answer: "Notifications are being treated primarily as a mobile app feature, but important web notices can still appear."
          },
          {
            question: "What should I do with an alert?",
            answer: "Read it, open the linked item if needed, and clear it only when you understand it."
          }
        ],
        visual: {
          title: "Notifications reference",
          caption: "Notifications and alerts help you find activity that needs attention.",
          callouts: ["Open notice list.", "Read the item.", "Open or clear as needed."]
        }
      }
    ]
  },
  {
    key: "people-groups",
    title: "People, Connections, and Groups",
    summary: "Find people, manage friend/family relationships, browse groups, create groups, and participate in group spaces.",
    features: [
      {
        title: "People",
        href: "/people",
        purpose: "Find members and open profiles.",
        howToUse: ["Open People.", "Search or browse members.", "Open a profile.", "Use available buttons to request a connection or communicate."],
        limits: ["You can only see profiles and details made visible to you.", "Respect privacy and do not repeatedly request connections from someone who declines."],
        faq: [
          {
            question: "Can I see everyone's full profile?",
            answer: "No. You see what each user and the site allow you to see."
          },
          {
            question: "What if I cannot find someone?",
            answer: "Check spelling, username, or ask them for their profile link."
          }
        ],
        visual: {
          title: "People reference",
          caption: "People is the member directory and profile discovery area.",
          callouts: ["Search members.", "Open profile.", "Connect when appropriate."]
        }
      },
      {
        title: "Friends and family requests",
        href: "/friends",
        purpose: "Create and manage social relationships.",
        howToUse: [
          "Open a person's profile or Friends.",
          "Use Friend, Acquaintance, or Family request when available.",
          "For Family, choose who the person is to you, such as spouse, sibling, parent, child, or another relationship.",
          "Wait for the other person to accept."
        ],
        limits: ["A relationship request is not active until accepted.", "Family relationship labels should describe who they are to you.", "Blocked users cannot interact normally with you."],
        faq: [
          {
            question: "What does the family dropdown mean?",
            answer: "It means: Is this person your spouse, sibling, parent, child, or another family relation?"
          },
          {
            question: "Can I remove a connection?",
            answer: "Use the available relationship or blocking controls when shown."
          }
        ],
        visual: {
          title: "Connections reference",
          caption: "Connection requests help separate friends, acquaintances, and family.",
          callouts: ["Choose request type.", "Pick family relationship if needed.", "Wait for acceptance."]
        }
      },
      {
        title: "Groups",
        href: "/groups",
        purpose: "Join or create topic-based spaces for shared discussion and media.",
        howToUse: ["Open Groups.", "Browse available groups.", "Join a group when the option is shown.", "Create a group from Create Group if you need a new topic space.", "Use group forum/media areas when the group offers them."],
        limits: ["Group owners or moderators may control membership, posts, media, and discussion rules.", "Group pictures and posts must follow the group's purpose and site rules."],
        faq: [
          {
            question: "Can Free Tier users create groups?",
            answer: "Use Create Group when it is shown. If it is not shown or is blocked, group creation is not available to your account at that moment."
          },
          {
            question: "Can groups have pictures?",
            answer: "Groups can have media areas when available. Upload rules and visibility still apply."
          }
        ],
        visual: {
          title: "Groups reference",
          caption: "Groups organize discussion around shared topics.",
          callouts: ["Browse groups.", "Join or create.", "Use forum/media areas."]
        }
      }
    ]
  },
  {
    key: "market-auditors",
    title: "Marketplace",
    summary: "Find or publish offers and wanted requests for goods, vehicles, rentals, services, jobs, and auditor services from one searchable workspace.",
    features: [
      {
        title: "Browse the Marketplace",
        href: "/marketplace",
        purpose: "Search all current offers and wanted requests in one directory.",
        howToUse: ["Open Marketplace.", "Choose Offers, Wanted, or All.", "Choose a listing type or enter keywords.", "Filter by category, location, remote availability, or price.", "Choose newest, price, or relevance sorting, then open a card for complete details."],
        limits: ["Marketplace listings are intentionally created by account holders; church and auditor reference records remain in the separate Auditor Directory.", "Theta-Space does not inspect every item or process buyer-to-seller payments.", "Only information the publisher chose to show appears publicly."],
        faq: [
          {
            question: "What is the difference between Offer and Wanted?",
            answer: "Offer means the publisher has something available. Wanted means the publisher is looking for that item, place, service, job, or help."
          },
          {
            question: "How do I contact a publisher?",
            answer: "Open the listing and choose Message when it is available. Public email, phone, website, or contact instructions appear only when the publisher enabled them."
          },
          {
            question: "Does Theta-Space collect payment for an exchange?",
            answer: "No. Arrange payment or delivery directly and carefully. Do not send money or sensitive information until you have verified the other party and the listing."
          }
        ],
        visual: {
          title: "Marketplace reference",
          caption: "The Marketplace brings every listing type into one filterable directory.",
          callouts: ["Choose Offer or Wanted.", "Filter the results.", "Open a listing for full details."]
        }
      },
      {
        title: "Create an Offer or Wanted Request",
        href: "/marketplace/new",
        purpose: "Publish a complete listing using fields tailored to what you are offering or seeking.",
        howToUse: ["Choose Post a Listing.", "Select Offer or Wanted, then select Goods, Vehicle, Rental, Service, Job, or Auditor.", "Choose a category and complete the fields shown for that listing type.", "Add price and location details, then choose the publishing identity and contact methods.", "Drag photos into the upload area or choose files from your device.", "Save a draft or review and publish the listing."],
        limits: ["Free Tier can create 3 new listings per 14-day period and attach up to 3 photos or videos to each listing.", "The screen shows the actual media cap for the signed-in account.", "Exact addresses, phone numbers, email addresses, and websites remain private unless you explicitly show them.", "Jobs and rentals cannot include religious preferences. Regulated goods and auditor offers require the displayed attestations."],
        faq: [
          {
            question: "What details should I include?",
            answer: "Complete every field that would help the other person make a decision. Vehicle listings include details such as year, make, model, mileage, title, and condition; rentals include rent, deposit, rooms, term, amenities, and availability; jobs include pay, schedule, requirements, and application instructions."
          },
          {
            question: "Can I publish without finishing?",
            answer: "Use Save Draft. Drafts remain private until you publish them from My Listings."
          },
          {
            question: "Does publishing cost money?",
            answer: "No. Marketplace publishing is free during the current rollout. A future charging system may be enabled later, but it is not active now."
          }
        ],
        visual: {
          title: "Listing wizard reference",
          caption: "The wizard changes its fields to match the listing type you choose.",
          callouts: ["Choose intent and type.", "Complete relevant details.", "Review privacy and publish."]
        }
      },
      {
        title: "Manage My Listings",
        href: "/marketplace/manage",
        purpose: "Review the status and activity of every listing you published or saved as a draft.",
        howToUse: ["Open My Listings.", "Switch between current listings and all statuses.", "Use grid or compact view.", "Open Edit to change details or media.", "Pause, publish, reserve, fulfill, renew, or archive a listing with the matching action."],
        limits: ["Listings normally expire after the configured listing period and can be renewed.", "Directory records do not appear in My Listings because they are not marketplace posts.", "Archived listings do not appear in public search."],
        faq: [
          {
            question: "What should I do when an item is no longer available?",
            answer: "Mark it Reserved while an exchange is pending, Fulfilled when completed, or Archive it when it should no longer appear."
          },
          {
            question: "Can I edit a live listing?",
            answer: "Yes. Open My Listings, choose Edit, make the changes, and save."
          }
        ],
        visual: {
          title: "My Listings reference",
          caption: "My Listings combines editing, status control, renewal, and activity counts.",
          callouts: ["Filter by status.", "Edit or renew.", "Close completed listings."]
        }
      },
      {
        title: "Saved Listings and Searches",
        href: "/marketplace/saved",
        purpose: "Keep useful listings and repeat searches without rebuilding the same filters.",
        howToUse: ["Use Save on a listing you want to revisit.", "Use Save Search after choosing useful marketplace filters.", "Open Saved to switch between saved listings and saved searches.", "Run a saved search again, turn alerts on or off, or remove it."],
        limits: ["Saving requires a signed-in account.", "A saved listing can still expire, be fulfilled, or be removed by its publisher.", "Alerts contain listing information permitted by the listing visibility settings."],
        faq: [
          {
            question: "Will a saved search notify me?",
            answer: "Turn on alerts for that saved search. The marketplace worker checks for new matching listings and records which results have already been sent."
          }
        ],
        visual: {
          title: "Saved workspace reference",
          caption: "Saved keeps favorite listings and reusable searches together.",
          callouts: ["Save a listing.", "Save a filtered search.", "Control search alerts."]
        }
      },
      {
        title: "Marketplace Exchanges and Reviews",
        href: "/marketplace/interactions",
        purpose: "Track conversations that began from a listing and confirm completed exchanges.",
        howToUse: ["Choose Contact on a listing to begin an exchange and message the publisher.", "Open My Exchanges to return to the listing or conversation.", "After the exchange, each participant confirms completion independently.", "When both participants confirm, leave one factual review about that exchange."],
        limits: ["Delivered messages and payments are not the same as a completed exchange.", "A review becomes available only after both participants confirm completion.", "Reviews are tied to a real recorded exchange and cannot be created for your own listing."],
        faq: [
          {
            question: "Why can I not review yet?",
            answer: "Both participants must confirm that the exchange was completed before the review control appears."
          },
          {
            question: "What if the exchange was cancelled?",
            answer: "Cancel the exchange from My Exchanges. A cancelled exchange cannot be reviewed as completed."
          }
        ],
        visual: {
          title: "Exchange reference",
          caption: "My Exchanges links each listing conversation to its confirmation and review state.",
          callouts: ["Open the conversation.", "Confirm independently.", "Review after both confirm."]
        }
      },
      {
        title: "Auditor Directory and Legacy Archive",
        href: "/marketplace/legacy",
        purpose: "Understand the separation between directory reference records, member-created auditor offers, and listings from the earlier Market and Jobs tools.",
        howToUse: ["Open Find an Auditor to search churches, advanced organizations, field auditors, and field groups.", "Use the Auditing Marketplace filter only for offers or wanted requests intentionally posted by account holders.", "Open Legacy Listings when you need to view an older Market or Job entry.", "Create all new offers and wanted requests in Marketplace."],
        limits: ["Directory records are not marketplace listings and never appear in the marketplace grid by default.", "A church or auditor can create an account and intentionally publish its own listing.", "Member-created auditor offers require a qualification attestation.", "Legacy entries are read-only in the archive and are not silently discarded."],
        faq: [
          {
            question: "Why is an old listing not in My Listings?",
            answer: "Listings created before the unified Marketplace remain in Legacy Listings. The archive preserves them while all new publishing uses Marketplace."
          },
          {
            question: "Can I publish an auditor wanted request?",
            answer: "Yes. Choose Wanted and Auditor when you are seeking auditing services. Do not use the qualification attestation unless you are publishing an auditor offer."
          }
        ],
        visual: {
          title: "Directory and archive reference",
          caption: "The Auditor Directory handles reference searches; account-created offers belong in Marketplace; earlier Market and Job records remain in a read-only archive.",
          callouts: ["Search the Auditor Directory.", "Use Marketplace for account-created listings.", "Open Legacy Listings for history."]
        }
      }
    ]
  },
  {
    key: "writers-corner",
    title: "Writers Corner",
    summary: "Create and manage manuscript drafts when Writers Corner is included in your membership.",
    features: [
      {
        title: "Manuscripts",
        href: "/writers-corner",
        purpose: "Write longer-form manuscript drafts and organize them into chapters.",
        howToUse: ["Open Tools, then Writers Corner when it is visible.", "Choose Create manuscript.", "Enter a title, genre, and summary.", "Create chapters from the manuscript page and continue editing your draft."],
        limits: ["Writers Corner is available to Contributor accounts, not Free Tier.", "Storefront publishing is not currently available and should not appear.", "Use the visible account menus as the source of truth for current limits."],
        faq: [
          {
            question: "Why do I not see Writers Corner?",
            answer: "Writers Corner is a Contributor feature. If it is not in Tools, the current account is not eligible or the feature is not enabled."
          },
          {
            question: "Can I publish a manuscript to a storefront?",
            answer: "Storefront publishing is not currently available. Contributors should not see a disabled publish control."
          }
        ],
        visual: {
          title: "Writers Corner reference",
          caption: "Create a manuscript, then add chapters from its detail page.",
          callouts: ["Open Writers Corner.", "Create a manuscript.", "Add chapters and continue writing."]
        }
      }
    ]
  },
  {
    key: "settings-help",
    title: "Settings, Security, Help, and Limits",
    summary: "Manage settings, blocked users, subscription view, invite eligibility, tutorial/manual help, and understand what is not available in Free Tier.",
    features: [
      {
        title: "Settings",
        href: "/settings",
        purpose: "Open account and help areas from one place.",
        howToUse: ["Open Settings.", "Use search if you know what you need.", "Choose Profile, Security, Rules, Subscription, Invites, Tutorial, Users Manual, or Progression Path."],
        limits: ["Sensitive areas may require secure-area confirmation.", "Invite settings appear only when your account is eligible."],
        faq: [
          {
            question: "Why do some settings ask for secure access?",
            answer: "Security-sensitive settings require an extra confirmation step to protect your account."
          },
          {
            question: "Where do I restart the guided walkthrough?",
            answer: "Open Settings, then Tutorial."
          },
          {
            question: "Where do I reopen this manual?",
            answer: "Open Settings, then Users Manual."
          }
        ],
        visual: {
          title: "Settings reference",
          caption: "Settings is the central place for account preferences and help.",
          callouts: ["Search settings.", "Open a category.", "Use secure access when prompted."]
        }
      },
      {
        title: "Progression Path",
        href: "/settings/progression-path",
        purpose: "Explore the features moving toward the Free and Contributor milestones.",
        howToUse: ["Open Settings, then Progression Path.", "Drag the map to move across it.", "Use the zoom controls when you want a closer view.", "Select any feature or tier milestone to read its status and details.", "Use the tier and status filters to focus the map."],
        limits: ["The path describes current direction and may change as testing continues.", "A planned or in-progress point is not yet a promise of immediate availability."],
        faq: [
          {
            question: "What do the path statuses mean?",
            answer: "Available is usable now, Beta testing is being proven with members, In progress is actively being worked on, and Planned is intended for later work."
          },
          {
            question: "Can I interact with the map on a phone?",
            answer: "Yes. Drag to move through the path, use the zoom buttons, and select a point to read its details below the map."
          }
        ],
        visual: {
          title: "Progression Path reference",
          caption: "Feature points lead into the Free and Contributor tier milestones.",
          callouts: ["Filter the path.", "Drag and zoom the map.", "Select a point for details."]
        }
      },
      {
        title: "Security and blocked users",
        href: "/settings/security",
        purpose: "Protect your account and manage people you have blocked.",
        howToUse: ["Open Security through Settings.", "Review blocked users.", "Use unblock only when you are sure.", "Use password reset when you need to recover or change access."],
        limits: ["Security settings may require secure confirmation.", "Blocking affects interactions but does not erase past content."],
        faq: [
          {
            question: "What does blocking do?",
            answer: "Blocking limits interaction between you and the blocked user according to site rules."
          },
          {
            question: "Can I unblock someone?",
            answer: "Use the blocked users page when an unblock control is available."
          }
        ],
        visual: {
          title: "Security reference",
          caption: "Security settings protect account access and interactions.",
          callouts: ["Open secure settings.", "Review blocked users.", "Change only what you intend."]
        }
      },
      {
        title: "Reports and Commendations",
        href: "/settings/reports",
        purpose: "Review conduct reports connected to your account, commendations you received, disputes, and active communication restrictions.",
        howToUse: ["Open Settings, then Reports and Commendations.", "Open a report to read the evidence and status available to you.", "If you are the reported member, use the dispute option when you need to add your statement or eligible public/group context.", "When a dispute is ready to close, use the participant resolution control; a moderator may use an explicit recorded override when required."],
        limits: ["A report asks for review; it does not prove misconduct.", "Private messages, group direct messages, internal mail, drafts, and private gallery content are outside communication review.", "Reporter identity and confidential moderator notes are shown only where policy allows.", "A pairwise restriction limits direct interaction only between the named accounts and does not expose or inspect existing private messages."],
        faq: [
          {
            question: "What can I report or commend?",
            answer: "Use the action shown on eligible Stream posts or replies, group forum content, and group-picture comments. Review the exact item before submitting."
          },
          {
            question: "Does a dispute close automatically?",
            answer: "No. Required participants must mark it resolved, or an authorized moderator must use an explicit override with a recorded reason."
          },
          {
            question: "What is a pairwise communication restriction?",
            answer: "It temporarily blocks new direct conversations and directed interactions between two named accounts. It does not inspect or reveal their prior private messages."
          }
        ],
        visual: {
          title: "Safety records reference",
          caption: "Reports, commendations, disputes, and restrictions remain attached to the correct conduct record.",
          callouts: ["Open the exact record.", "Read evidence and status.", "Use dispute and resolution controls deliberately."]
        }
      },
      {
        title: "Subscription and Free Tier limits",
        href: "/settings/subscription",
        purpose: "Review your current membership and limits.",
        howToUse: ["Open Subscription from Settings.", "Review the current membership shown.", "If you choose Manage billing, read the cancellation warning and choose Continue to billing only when you are ready to review cancellation in Stripe.", "If a storage archive appears, request a ZIP file or prepare one archived file at a time for a temporary full-file view.", "Use the limits in this manual to understand current Free Tier use."],
        limits: ["Free Tier personal file storage: 200 MB.", "Free Tier marketplace: 3 listings per 14-day period.", "Free Tier listing photos: 3 per listing.", "Membership upgrade choices should not appear unless they are actually available."],
        faq: [
          {
            question: "What storage do I have?",
            answer: "Free Tier currently has 200 MB and Contributor currently has 2 GB of personal file storage for Gallery, group uploads, and message images. Text-only posts do not count toward that file-storage limit."
          },
          {
            question: "What happens to my files if I cancel Contributor?",
            answer: "Cancellation takes effect at the end of the paid billing period. If your files exceed the 200 MB Free limit then, Theta-Space archives and compresses the oldest excess files instead of silently deleting them. Gallery keeps small previews. In Subscription, you can prepare one full-file view at a time or request a ZIP download; Theta-Space sends a notification when that ZIP is ready. Account deletion is different and permanently removes account media."
          },
          {
            question: "Can I access business tools?",
            answer: "No. Free Tier should not have business tools, business identity switching, storefront tools, or ads."
          }
        ],
        visual: {
          title: "Subscription reference",
          caption: "Subscription shows the membership you currently have.",
          callouts: ["Open Subscription.", "Review current tier.", "Check limits."]
        }
      },
      {
        title: "Invites",
        href: "/settings/invite",
        purpose: "Create or review private one-time invite codes when an administrator has enabled invite tools for your account.",
        howToUse: ["Open Invites from Settings if it is shown.", "Use the single-invite form for one approved person.", "If Invite multiple is visible, paste a list in any common format; valid addresses are extracted and de-duplicated before queueing.", "Track queue status and unused codes carefully."],
        limits: ["Theta-Space is invite-only.", "Invite multiple is a separate administrator-granted capability.", "Bulk delivery is one email every 2 minutes, up to 250 addresses per batch and 300 addresses per UTC day.", "Each recipient receives a unique one-time code; existing active invite addresses are skipped."],
        faq: [
          {
            question: "Why do I not see invite tools?",
            answer: "Your account may not have invite creation enabled. Admins can individually grant that ability."
          },
          {
            question: "Can I share an invite publicly?",
            answer: "No. Treat invites as private access paths for intended recipients."
          },
          {
            question: "What does Invite multiple do?",
            answer: "It accepts a pasted list such as names with <email@example.com>, commas, spaces, or line breaks. The system extracts valid unique addresses, creates a separate one-time code for each, and sends them through a controlled queue. It does not send one shared code."
          },
          {
            question: "Why is a bulk invitation still queued?",
            answer: "Bulk mail is intentionally paced at one message every two minutes and capped at 300 per UTC day to protect recipients and the invite-only community."
          }
        ],
        visual: {
          title: "Invites reference",
          caption: "Invite tools appear only for eligible accounts.",
          callouts: ["Open invite settings.", "Create code if eligible.", "Share privately."]
        }
      },
      {
        title: "Help, Tutorial, and Users Manual",
        href: "/settings/users-manual",
        purpose: "Find guidance or contact the support queue without leaving the site.",
        howToUse: ["Use Tutorial for guided arrows and walkthrough.", "Use Users Manual for detailed feature explanations and FAQ.", "Use Feedback to ask for help, report a problem, or suggest an improvement."],
        limits: ["The tutorial is a walkthrough; the manual is a reference.", "Manual links open live areas but do not grant extra permissions."],
        faq: [
          {
            question: "Should I use Tutorial or Users Manual?",
            answer: "Use Tutorial when you want to be walked through the screen. Use Users Manual when you want explanations, FAQs, and limits."
          },
          {
            question: "Does the manual unlock features?",
            answer: "No. It explains what your account can use and what the limits are."
          },
          {
            question: "What can I send through Feedback?",
            answer: "Click the floating Feedback button, choose the closest Feedback Type, add a clear subject and description, and optionally capture the current Theta-Space tab. The form appears above the page without moving it. If an administrator responds, the response arrives as a normal Comm Center message."
          }
        ],
        visual: {
          title: "Help reference",
          caption: "Tutorial and Users Manual are both available from Settings.",
          callouts: ["Use Tutorial for guided steps.", "Use Manual for reference.", "Open Feedback for support or suggestions."]
        }
      },
      {
        title: "Not available in Free Tier",
        href: "/settings/subscription",
        purpose: "Understand which visible or known areas are not part of Free Tier use right now.",
        howToUse: ["If an area is hidden, disabled, marked Coming Soon, or marked Not yet available, do not rely on it for Free Tier use.", "Use core features instead: Marketplace, Stream, Contacts, Groups, My Pics, Messages, and Settings."],
        limits: [
          "Business Center, storefronts, business profiles, and business identity switching are not Free Tier functions.",
          "Ads and paid promotion tools are not Free Tier functions.",
          "Writers Corner is not Free Tier access.",
          "Fundraiser creation is not Free Tier access.",
          "Events are not yet available.",
          "Internal mail is currently hidden/unavailable."
        ],
        faq: [
          {
            question: "Why mention features I cannot use?",
            answer: "So you know the boundary of the Free Tier and do not spend time looking for tools that are intentionally unavailable."
          },
          {
            question: "Will these features become available later?",
            answer: "Some are planned, staged, or paid-tier features. Use the current menus and membership page as the source for what your account can use today."
          }
        ],
        visual: {
          title: "Free Tier boundary reference",
          caption: "Use core Free Tier tools now; unavailable tools should not be part of normal Free Tier workflow.",
          callouts: ["Use visible core tools.", "Avoid hidden paid tools.", "Check Settings for current tier."]
        }
      }
    ]
  }
];

export function buildUsersManual(): UsersManual {
  return {
    definitions: usersManualDefinitions,
    freeTierBasics,
    contributorTierBasics,
    sections: usersManualSections
  };
}
