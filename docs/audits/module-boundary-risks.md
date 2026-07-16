# Module Boundary Risks

- Avoid direct Prisma access in UI-heavy pages as modules are rebuilt.
- Keep ads out of listing/event/detail bodies; ads belong to reserved placements.
- Keep R2 media upload flow separate from the Windows web-service request path where possible.
- Keep contacts separate from friendships.
- Keep diagnostic logs separate from privileged audit logs.
- Keep secure-area protection away from non-sensitive gallery browsing.
