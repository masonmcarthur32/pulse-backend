import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { businessProfiles } from '@/db/schema';
import type { BusinessProfileInput } from '@/modules/profile/profile.schema';

export async function getProfile(userId: string) {
  return db.query.businessProfiles.findFirst({ where: eq(businessProfiles.userId, userId) });
}

export async function upsertProfile(userId: string, input: BusinessProfileInput) {
  const existing = await getProfile(userId);
  if (existing) {
    const [updated] = await db
      .update(businessProfiles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(businessProfiles.userId, userId))
      .returning();
    if (!updated) throw new Error('Business profile update returned no row');
    return updated;
  }
  const [created] = await db
    .insert(businessProfiles)
    .values({ userId, ...input })
    .returning();
  if (!created) throw new Error('Business profile insert returned no row');
  return created;
}
