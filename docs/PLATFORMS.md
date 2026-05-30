# Platforms We Use

Theta-Space runs on `Next.js`, `React`, and `TypeScript`, which together make up the website people use. `Railway` is the platform that hosts the live app online, and `Docker` helps package it so it runs the same way in deployment as it does during testing. For login and account sessions, we use `NextAuth`, which is the part that signs people in and remembers who they are while they use the site. For email, we use `SMTP` with `Nodemailer` so the app can send things like password reset messages.

For data, the app uses `PostgreSQL` as its main database, with `Neon` hosting that database online. `Prisma` is the tool the app uses to read and write that data without having to manage raw database queries everywhere. For file uploads like images, the planned storage platform is `Cloudflare R2`, which acts like an online storage locker for user-uploaded files so they do not have to live on the app server itself.
