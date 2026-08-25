/**
 * Shared Prisma selects for relations that point at a User.
 *
 * A bare `include: { tech: true }` returns the whole row — passwordHash,
 * hourlyCost, commissionPct — straight out to the client. Nothing outside the
 * auth module needs those, so relations always name their fields through one of
 * these instead.
 */
export const PUBLIC_USER_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    avatarUrl: true,
} as const;

/** Same, minus the role — for places that only need to name the person. */
export const USER_NAME_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
} as const;
