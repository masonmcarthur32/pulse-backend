import bcrypt from 'bcryptjs';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, refreshTokens } from '@/db/schema';
import { AppError } from '@/lib/http-error';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry
} from '@/lib/jwt';
import type { LoginInput, SignupInput } from '@/modules/auth/auth.schema';

const BCRYPT_COST = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueTokenPair(userId: string, role: 'owner' | 'accountant'): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiry()
  });
  return { accessToken, refreshToken };
}

export async function signup(input: SignupInput): Promise<TokenPair & { userId: string }> {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) {
    // Deliberately vague — do not confirm which emails are registered.
    throw AppError.conflict('Could not create account with those details.', 'SIGNUP_FAILED');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const [user] = await db
    .insert(users)
    .values({ email: input.email, passwordHash, role: 'owner' })
    .returning({ id: users.id, role: users.role });

  if (!user) throw new Error('User insert returned no row');

  const tokens = await issueTokenPair(user.id, user.role);
  return { ...tokens, userId: user.id };
}

const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';

export async function login(input: LoginInput): Promise<TokenPair & { userId: string }> {
  const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (!user) {
    // Hash a dummy password so a login for a nonexistent account takes
    // roughly the same time as one for a real account — this narrows
    // (does not eliminate) email-enumeration by response timing.
    await bcrypt.hash(input.password, BCRYPT_COST);
    throw AppError.unauthorized(GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized(GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  }

  const tokens = await issueTokenPair(user.id, user.role);
  return { ...tokens, userId: user.id };
}

export async function refresh(rawToken: string): Promise<TokenPair> {
  const tokenHash = hashToken(rawToken);
  const record = await db.query.refreshTokens.findFirst({
    where: and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt))
  });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw AppError.unauthorized('Session expired — please sign in again.', 'REFRESH_INVALID');
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, record.userId) });
  if (!user) {
    throw AppError.unauthorized('Session expired — please sign in again.', 'REFRESH_INVALID');
  }

  // Rotate: revoke the presented token before issuing a new one, so a
  // captured-and-replayed refresh token can be used at most once.
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, record.id));

  return issueTokenPair(user.id, user.role);
}

export async function logout(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}
