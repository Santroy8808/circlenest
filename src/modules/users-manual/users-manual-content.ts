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
  sections: UsersManualSection[];
};

export const usersManualDefinitions: UsersManualDefinition[] = [
  {
    term: "Free Tier",
    definition: "The basic Theta-Space membership level. It gives access to core social use: profile, stream, people, groups, pictures, messages, market browsing, and limited personal listings."
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
    definition: "A personal marketplace entry created by a member. Free Tier listings are limited and are not the same as a business storefront."
  },
  {
    term: "Auditor Directory",
    definition: "A browsing area for finding auditors. Free Tier members can browse the directory; creating an auditor profile is marked Coming Soon and is not a Free Tier function."
  },
  {
    term: "Storage",
    definition: "The amount of personal uploaded media your account can hold. Free Tier storage is currently 200 MB for gallery files, group uploads, and message images. Text posts do not count toward this file-storage limit."
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
  "Text-only posts do not count against the 200 MB personal file-storage limit.",
  "Public Stream posts from Communicate may have images compressed after 48 hours without a view, archived after 1 week, and permanently deleted after 3 months. These limits may change.",
  "Free Tier marketplace creation is limited to 3 listings per 14-day period.",
  "Each Free Tier marketplace listing can have up to 3 photos.",
  "Business profiles, storefronts, business identity switching, ads, Writers Corner, fundraiser creation, and business tools are not Free Tier functions.",
  "Events are not yet available for Free Tier use.",
  "Internal mail is currently hidden/unavailable; use Messages in Comm Center instead.",
  "Notification behavior is primarily being prepared for the mobile app, but visible web notifications and alerts can still be reviewed when present.",
  "Invite creation appears only when the account is eligible or an admin has granted that ability."
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
          "Use the top icon bar for fast access to Home, My Pics, People, Market, Search, and Comm Center.",
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
        purpose: "Read platform activity and focus on Latest, Friends, Groups, or Pics where available.",
        howToUse: ["Open Home.", "Use Stream filters to switch between available views.", "Open a post or picture to read the full discussion when needed."],
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
          caption: "Use filters to narrow the Stream to the type of activity you want to read.",
          callouts: ["Choose a filter.", "Read visible posts.", "Open discussions for details."]
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
          "Use available controls to set a picture as avatar or banner."
        ],
        limits: ["Free Tier personal file storage is 200 MB.", "Visibility can be changed only through available picture settings.", "If comments are disabled by visibility or settings, discussion controls may not appear."],
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
            answer: "Use Delete photo when it is shown. Deleting removes the picture from your gallery and may affect places where it was used."
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
    title: "Market, Jobs, and Auditor Directory",
    summary: "Browse marketplace listings, create limited personal listings, find jobs, and browse auditors.",
    features: [
      {
        title: "The Market",
        href: "/market",
        purpose: "Browse member listings and open listings for details and seller contact options.",
        howToUse: ["Open Market.", "Search or filter by category.", "Click a listing to open details.", "Use contact options shown on the listing."],
        limits: ["Listings are member-created and should be reviewed carefully.", "Contact details may be visible only according to listing settings.", "Business storefront features are not part of Free Tier."],
        faq: [
          {
            question: "How do I contact a seller?",
            answer: "Open the listing and use the contact or message seller options shown on that listing."
          },
          {
            question: "Are listings verified by Theta-Space?",
            answer: "Treat listings as member-created content. Use judgment before buying, selling, or sharing personal information."
          }
        ],
        visual: {
          title: "Market reference",
          caption: "The Market lists available member listings and lets you open details.",
          callouts: ["Search listings.", "Open a listing.", "Use contact options."]
        }
      },
      {
        title: "My Listings",
        href: "/market/my-listings",
        purpose: "Review and edit the listings you created.",
        howToUse: ["Open Market.", "Choose My Listings.", "Open or edit your listing.", "Update details, pictures, category, location, and contact information as needed."],
        limits: ["Free Tier can create 3 listings per 14-day period.", "Free Tier listings allow up to 3 photos per listing.", "Listing location should be city-level, not a private address."],
        faq: [
          {
            question: "How many listings can I create?",
            answer: "Free Tier can create 3 listings per 14-day period."
          },
          {
            question: "How many photos can one listing have?",
            answer: "Free Tier listings can have up to 3 photos."
          },
          {
            question: "Can I edit a listing later?",
            answer: "Yes. Use My Listings, then choose Edit for the listing you created."
          }
        ],
        visual: {
          title: "My Listings reference",
          caption: "My Listings separates your editable listings from the public market browsing view.",
          callouts: ["Open My Listings.", "Choose your listing.", "Edit details or photos."]
        }
      },
      {
        title: "Create Listing",
        href: "/market/create",
        purpose: "Create a personal Free Tier marketplace listing.",
        howToUse: ["Open Create Listing.", "Choose the correct category.", "Enter a clear title, description, price, city-level location, and contact options.", "Upload up to 3 photos.", "Submit and review the listing."],
        limits: ["Free Tier limit: 3 listings per 14-day period.", "Free Tier photo limit: 3 photos per listing.", "This is for personal member listings, not business storefronts."],
        faq: [
          {
            question: "Should I include my full address?",
            answer: "No. Use city-level location only. Share exact meeting or delivery details privately and carefully."
          },
          {
            question: "Can I make a business storefront from Free Tier?",
            answer: "No. Business storefronts and business identity features are not Free Tier functions."
          }
        ],
        visual: {
          title: "Create Listing reference",
          caption: "Create Listing is for limited personal marketplace entries.",
          callouts: ["Enter listing basics.", "Add up to 3 photos.", "Review before submitting."]
        }
      },
      {
        title: "Find a Job",
        href: "/jobs",
        purpose: "Browse available job-related listings or opportunities.",
        howToUse: ["Open Find a Job.", "Browse or search visible opportunities.", "Open a listing to read details and contact instructions."],
        limits: ["Only visible opportunities are shown.", "Employer or business posting tools may not be Free Tier functions.", "Do not share sensitive personal information until you trust the contact path."],
        faq: [
          {
            question: "Can I apply inside Theta-Space?",
            answer: "Use the contact or instructions shown on the job item. If no application path is shown, the item may only be informational."
          },
          {
            question: "Can I create job posts as Free Tier?",
            answer: "Use only the creation options shown to your account. Some posting tools may require future business or paid features."
          }
        ],
        visual: {
          title: "Jobs reference",
          caption: "Find a Job is for browsing visible job-related opportunities.",
          callouts: ["Browse jobs.", "Open details.", "Follow listed contact instructions."]
        }
      },
      {
        title: "Find an Auditor",
        href: "/auditors",
        purpose: "Browse the auditor directory and open auditor profiles.",
        howToUse: ["Open Find an Auditor.", "Search or filter available auditors.", "Open a profile to read details and contact information where shown."],
        limits: ["Creating an auditor profile is Coming Soon and is not a Free Tier function.", "Only visible auditor information is shown.", "Use judgment before contacting or arranging services."],
        faq: [
          {
            question: "Can I create an auditor profile?",
            answer: "No. Auditor profile creation is Coming Soon and is not currently a Free Tier function."
          },
          {
            question: "Can I browse auditors as Free Tier?",
            answer: "Yes, use Find an Auditor when it is visible."
          }
        ],
        visual: {
          title: "Auditor directory reference",
          caption: "The directory helps users browse auditors and open profiles.",
          callouts: ["Search auditors.", "Open profile.", "Use visible contact details."]
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
        howToUse: ["Open Settings.", "Use search if you know what you need.", "Choose Profile, Security, Rules, Subscription, Invites, Tutorial, or Users Manual."],
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
        title: "Subscription and Free Tier limits",
        href: "/settings/subscription",
        purpose: "Review your current membership and limits.",
        howToUse: ["Open Subscription from Settings.", "Review the current membership shown.", "Use the limits in this manual to understand current Free Tier use."],
        limits: ["Free Tier personal file storage: 200 MB.", "Free Tier marketplace: 3 listings per 14-day period.", "Free Tier listing photos: 3 per listing.", "Membership upgrade choices should not appear unless they are actually available."],
        faq: [
          {
            question: "What storage do I have?",
            answer: "Free Tier currently has 200 MB of personal file storage for Gallery, group uploads, and message images. Text-only posts do not count toward that file-storage limit."
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
        purpose: "Create or review invite codes only when your account is eligible.",
        howToUse: ["Open Invites from Settings if it is shown.", "Create or copy an invite only for an approved person.", "Track unused codes carefully."],
        limits: ["Theta-Space is invite-only.", "Not every Free Tier user can create invites.", "Invite creation depends on account eligibility or admin grant."],
        faq: [
          {
            question: "Why do I not see invite tools?",
            answer: "Your account may not have invite creation enabled. Admins can individually grant that ability."
          },
          {
            question: "Can I share an invite publicly?",
            answer: "No. Treat invites as private access paths for intended recipients."
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
        purpose: "Find guidance without leaving the site.",
        howToUse: ["Use Tutorial for guided arrows and walkthrough.", "Use Users Manual for detailed feature explanations and FAQ.", "Use feedback/help pages to report problems."],
        limits: ["The tutorial is a walkthrough; the manual is a reference.", "Manual links open live areas but do not grant extra permissions."],
        faq: [
          {
            question: "Should I use Tutorial or Users Manual?",
            answer: "Use Tutorial when you want to be walked through the screen. Use Users Manual when you want explanations, FAQs, and limits."
          },
          {
            question: "Does the manual unlock features?",
            answer: "No. It explains what your account can use and what the limits are."
          }
        ],
        visual: {
          title: "Help reference",
          caption: "Tutorial and Users Manual are both available from Settings.",
          callouts: ["Use Tutorial for guided steps.", "Use Manual for reference.", "Report issues through help/feedback."]
        }
      },
      {
        title: "Not available in Free Tier",
        href: "/settings/subscription",
        purpose: "Understand which visible or known areas are not part of Free Tier use right now.",
        howToUse: ["If an area is hidden, disabled, marked Coming Soon, or marked Not yet available, do not rely on it for Free Tier use.", "Use core features instead: Stream, People, Groups, My Pics, Messages, Market, Jobs browsing, Auditor directory, and Settings."],
        limits: [
          "Business Center, storefronts, business profiles, and business identity switching are not Free Tier functions.",
          "Ads and paid promotion tools are not Free Tier functions.",
          "Writers Corner is not Free Tier access.",
          "Fundraiser creation is not Free Tier access.",
          "Events are not yet available.",
          "Internal mail is currently hidden/unavailable.",
          "Auditor profile creation is Coming Soon."
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
    sections: usersManualSections
  };
}
