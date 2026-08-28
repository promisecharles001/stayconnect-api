import { Prisma } from '@prisma/client';

/**
 * The set of User columns that are safe to send to a client.
 *
 * Every endpoint that returns a user must select through this rather than
 * handing back a raw `prisma.user` row. A bare row carries `password` (the
 * bcrypt hash) and the password-reset token hash, and casting it to
 * UserResponseDto does NOT strip them — the cast is compile-time only, so
 * those columns went out over the wire on /auth/profile and, worse, for
 * every account at once on the admin GET /users list.
 *
 * Listing the safe columns explicitly (rather than deleting the unsafe
 * ones) means a sensitive column added to the schema later stays out of
 * responses by default.
 */
export const USER_SAFE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  roleId: true,
  status: true,
  emailVerified: true,
  emailVerifiedAt: true,
  phoneVerified: true,
  phoneVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  hostSince: true,
  hostBio: true,
  hostRating: true,
  hostReviewCount: true,
  visitorRating: true,
  visitorReviewCount: true,
  pushToken: true,
  role: true,
} satisfies Prisma.UserSelect;
