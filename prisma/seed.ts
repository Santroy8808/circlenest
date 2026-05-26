import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const themeSeeds = [
  ["drakudai", "Drakudai", "#0b0b0d", "#d4af37"],
  ["classic-blue", "Classic Blue", "#eff6ff", "#2563eb"],
  ["dark-mode", "Dark Mode", "#0f172a", "#38bdf8"],
  ["neon", "Neon", "#0b1020", "#22d3ee"],
  ["minimal", "Minimal", "#f8fafc", "#0f172a"],
  ["forest", "Forest", "#ecfdf5", "#15803d"],
  ["ocean", "Ocean", "#f0f9ff", "#0284c7"],
  ["sunset", "Sunset", "#fff7ed", "#ea580c"],
  ["cyber", "Cyber", "#111827", "#a855f7"],
  ["pastel", "Pastel", "#fdf2f8", "#ec4899"],
  ["professional", "Professional", "#f8fafc", "#334155"],
  ["retro-web", "Retro Web", "#fffbeb", "#d97706"],
  ["high-contrast", "High Contrast", "#ffffff", "#000000"],
] as const;

const fakeUsers = [
  ["ava", "Ava Lane", "Seattle, WA", "Design, Music, Technology", "Single", "Building tiny products and big playlists."],
  ["milo", "Milo Grant", "Austin, TX", "Gaming, Startups, Coffee", "In a relationship", "Frontend tinkerer and espresso collector."],
  ["jules", "Jules Carter", "Denver, CO", "Photography, Hiking, Community", "Single", "Weekend trail photos and weekday code."],
  ["noah", "Noah Reed", "Portland, OR", "Technology, Film, UX", "Married", "Shipping useful things for real people."],
  ["rhea", "Rhea Bloom", "Chicago, IL", "Writing, Wellness, Tech", "Single", "Notes on product, people, and calm systems."],
  ["kai", "Kai Mercer", "San Diego, CA", "Surf, Music, Product", "Single", "Sunrise surf then sprint planning."],
  ["zoe", "Zoe Fields", "Nashville, TN", "Music, Marketing, Events", "Single", "I plan community nights and playlist drops."],
  ["liam", "Liam Fox", "Miami, FL", "Fitness, Tech, Travel", "Single", "Builder, runner, and occasional drone pilot."],
  ["nina", "Nina Holt", "Boston, MA", "Books, Design Systems, Coffee", "Complicated", "Design systems by day, mystery novels by night."],
  ["omar", "Omar Voss", "Phoenix, AZ", "Security, Linux, DIY", "Single", "I automate boring stuff and fix old bikes."],
  ["priya", "Priya Nair", "San Jose, CA", "AI, Product, Education", "Single", "Teaching, prototyping, repeating."],
  ["ethan", "Ethan Cole", "New York, NY", "Finance, Tech, Food", "Single", "Data nerd with a dumpling habit."],
  ["maya", "Maya Lin", "Los Angeles, CA", "Art, Creator Economy, Video", "Single", "Making visual stories and product explainers."],
  ["trent", "Trent Vale", "Dallas, TX", "Startups, Sales, Golf", "Married", "Partnerships, pipelines, and putting practice."],
  ["sora", "Sora Kim", "San Francisco, CA", "Mobile, UX, Minimalism", "Single", "Crafting smooth mobile moments."],
  ["ivy", "Ivy Chen", "Las Vegas, NV", "Food, Community, Tech", "Single", "I organize popups and test side projects."],
  ["leo", "Leo Park", "Atlanta, GA", "DevOps, Cloud, Soccer", "Single", "Infra calm, deploy fast."],
  ["alma", "Alma Cruz", "Brooklyn, NY", "Fashion, Culture, Podcasts", "Single", "Culture notes and city discoveries."],
] as const;

const topicPool = ["Technology", "Community", "Design", "Music", "Photography", "Startups", "Wellness", "Gaming"];

async function resetDb() {
  await prisma.reaction.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.messageThread.deleteMany();
  await prisma.post.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.friendRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.photoAlbum.deleteMany();
  await prisma.followedTopic.deleteMany();
  await prisma.mutedTopic.deleteMany();
  await prisma.mutedUser.deleteMany();
  await prisma.userFeedPreference.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.theme.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  const defaultPasswordHash = await hash("password123", 10);
  await resetDb();

  for (const [key, name, background, accentColor] of themeSeeds) {
    await prisma.theme.create({
      data: {
        key,
        name,
        background,
        accentColor,
        cardStyle: "rounded-soft",
        headerStyle: "solid",
        buttonStyle: "pill",
        fontPairing: "sans/serif",
        patternAsset: `/themes/patterns/${key}.svg`,
      },
    });
  }

  const themes = await prisma.theme.findMany({ orderBy: { name: "asc" } });

  const users = [] as Array<{ id: string; username: string }>;
  for (let i = 0; i < fakeUsers.length; i++) {
    const [username, displayName, location, interests, relationshipStatus, bio] = fakeUsers[i];
    const theme = themes[i % themes.length];
    const mode = ["CHRONOLOGICAL", "FRIENDS_FIRST", "INTEREST_BASED", "QUIET", "DISCOVERY"][i % 5];

    const user = await prisma.user.create({
      data: {
        email: `${username}@circlenest.dev`,
        username,
        passwordHash: defaultPasswordHash,
        profile: {
          create: {
            displayName,
            bio,
            location,
            interests,
            relationshipStatus,
            avatarUrl: `/uploads/seed/avatar-${(i % 8) + 1}.jpg`,
            bannerUrl: `/uploads/seed/banner-${(i % 6) + 1}.jpg`,
            themeId: theme.id,
          },
        },
        feedPreference: {
          create: {
            mode,
            hiddenPostIds: JSON.stringify([]),
            topicWeights: JSON.stringify({ Technology: 1, Community: 1 }),
          },
        },
      },
      select: { id: true, username: true },
    });
    users.push(user);
  }

  const userIdByUsername = new Map(users.map((u) => [u.username, u.id]));

  const friendshipsByUsername: Array<[string, string]> = [
    ["ava", "milo"], ["ava", "jules"], ["ava", "rhea"], ["ava", "priya"],
    ["milo", "noah"], ["milo", "kai"], ["milo", "trent"],
    ["jules", "rhea"], ["jules", "zoe"], ["jules", "maya"],
    ["noah", "omar"], ["noah", "leo"], ["noah", "sora"],
    ["rhea", "nina"], ["rhea", "ivy"], ["rhea", "alma"],
    ["priya", "ethan"], ["priya", "sora"], ["priya", "leo"],
    ["kai", "liam"], ["zoe", "alma"], ["trent", "ethan"],
    ["maya", "ivy"], ["omar", "leo"], ["nina", "sora"],
  ];

  for (const [a, b] of friendshipsByUsername) {
    const aId = userIdByUsername.get(a);
    const bId = userIdByUsername.get(b);
    if (!aId || !bId) continue;
    const [userAId, userBId] = [aId, bId].sort();
    await prisma.friendship.create({ data: { userAId, userBId } });
  }

  const requestPairs: Array<[string, string]> = [
    ["alma", "ava"],
    ["leo", "rhea"],
    ["ivy", "milo"],
    ["zoe", "priya"],
    ["kai", "nina"],
  ];

  for (const [sender, receiver] of requestPairs) {
    await prisma.friendRequest.create({
      data: {
        senderId: userIdByUsername.get(sender)!,
        receiverId: userIdByUsername.get(receiver)!,
        status: "PENDING",
      },
    });
  }

  const groups = await Promise.all([
    prisma.group.create({
      data: {
        name: "CircleNest Creators",
        description: "Designers, builders, and storytellers sharing work-in-progress.",
        ownerId: userIdByUsername.get("ava")!,
        visibility: "PUBLIC",
      },
    }),
    prisma.group.create({
      data: {
        name: "Neighborhood Tech",
        description: "Local meetups, hack nights, and community help threads.",
        ownerId: userIdByUsername.get("noah")!,
        visibility: "PUBLIC",
      },
    }),
    prisma.group.create({
      data: {
        name: "Quiet Mode Club",
        description: "Low-noise updates, journaling, and calmer social spaces.",
        ownerId: userIdByUsername.get("rhea")!,
        visibility: "PRIVATE",
      },
    }),
    prisma.group.create({
      data: {
        name: "Photo Walk Weekly",
        description: "Share street and trail shots every Friday.",
        ownerId: userIdByUsername.get("jules")!,
        visibility: "PUBLIC",
      },
    }),
  ]);

  for (const group of groups) {
    for (let i = 0; i < users.length; i++) {
      if ((i + group.name.length) % 3 !== 0) {
        await prisma.groupMember.create({
          data: {
            groupId: group.id,
            userId: users[i].id,
          },
        });
      }
    }
  }

  const postTemplates = [
    "Morning build check-in: shipped a small UX fix and it made a huge difference.",
    "Anyone else trying Quiet Mode this week? My feed feels much calmer.",
    "Photo dump from today's walk. Light was perfect.",
    "Looking for feedback on a profile theme combo.",
    "Group meetup tonight at 7 - bring one project you're proud of.",
    "Trying a no-doomscroll challenge and it is honestly helping.",
    "What's your favorite tiny productivity habit right now?",
    "Hot take: chronological feed should be default everywhere.",
  ];

  const posts: Array<{ id: string; authorId: string; topic: string | null }> = [];
  for (let i = 0; i < users.length; i++) {
    for (let p = 0; p < 3; p++) {
      const topic = topicPool[(i + p) % topicPool.length];
      const group = (i + p) % 2 === 0 ? groups[(i + p) % groups.length] : null;
      const created = await prisma.post.create({
        data: {
          authorId: users[i].id,
          content: `${postTemplates[(i + p) % postTemplates.length]} #${i + 1}-${p + 1}`,
          topic,
          imageUrl: (i + p) % 4 === 0 ? `/uploads/seed/post-${((i + p) % 10) + 1}.jpg` : null,
          groupId: group?.id ?? null,
        },
        select: { id: true, authorId: true, topic: true },
      });
      posts.push(created);
    }
  }

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const c1 = users[(i + 2) % users.length];
    const c2 = users[(i + 5) % users.length];

    await prisma.comment.create({
      data: {
        postId: post.id,
        authorId: c1.id,
        content: "Love this update. Super clear and relatable.",
      },
    });

    if (i % 2 === 0) {
      await prisma.comment.create({
        data: {
          postId: post.id,
          authorId: c2.id,
          content: "Same here, this is exactly what I needed to read today.",
        },
      });
    }

    const reactors = [users[(i + 1) % users.length], users[(i + 3) % users.length], users[(i + 7) % users.length]];
    const reactionTypes = ["LIKE", "LOVE", "CLAP"];
    for (let r = 0; r < reactors.length; r++) {
      await prisma.reaction.create({
        data: {
          postId: post.id,
          userId: reactors[r].id,
          type: reactionTypes[r],
        },
      });
    }
  }

  for (let i = 0; i < users.length; i++) {
    const topics = [topicPool[i % topicPool.length], topicPool[(i + 2) % topicPool.length], topicPool[(i + 4) % topicPool.length]];
    for (const topic of topics) {
      await prisma.followedTopic.create({ data: { userId: users[i].id, topic } });
    }
  }

  const dmPairs: Array<[string, string]> = [
    ["ava", "milo"],
    ["ava", "priya"],
    ["jules", "maya"],
    ["noah", "leo"],
    ["rhea", "nina"],
    ["kai", "liam"],
  ];

  for (const [a, b] of dmPairs) {
    const aId = userIdByUsername.get(a)!;
    const bId = userIdByUsername.get(b)!;
    const thread = await prisma.messageThread.create({ data: { userAId: aId, userBId: bId } });

    await prisma.message.createMany({
      data: [
        { threadId: thread.id, senderId: aId, body: `Hey ${b}, want to sync on the group post tomorrow?` },
        { threadId: thread.id, senderId: bId, body: `Yes, let's do it. I can draft a quick outline.` },
        { threadId: thread.id, senderId: aId, body: "Perfect. I'll share it in the feed after lunch." },
      ],
    });
  }

  for (let i = 0; i < users.length; i++) {
    const album = await prisma.photoAlbum.create({
      data: {
        userId: users[i].id,
        title: `${users[i].username}'s Highlights`,
      },
    });

    await prisma.photo.createMany({
      data: [
        { albumId: album.id, url: `/uploads/seed/gallery-${(i % 8) + 1}.jpg`, caption: "Weekend snapshot" },
        { albumId: album.id, url: `/uploads/seed/gallery-${((i + 2) % 8) + 1}.jpg`, caption: "Community meetup" },
      ],
    });
  }

  for (const user of users) {
    await prisma.notification.createMany({
      data: [
        { userId: user.id, type: "FRIEND_REQUEST", body: "You have a new friend request." },
        { userId: user.id, type: "NEW_COMMENT", body: "Someone commented on your post." },
        { userId: user.id, type: "NEW_REACTION", body: "Your post got a new reaction." },
        { userId: user.id, type: "NEW_MESSAGE", body: "You received a new message." },
        { userId: user.id, type: "GROUP_ACTIVITY", body: "New activity in one of your groups." },
      ],
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
