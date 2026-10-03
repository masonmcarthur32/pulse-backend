import bcrypt from 'bcryptjs';
import { db, pool } from '@/db/client';
import { users, businessProfiles } from '@/db/schema';

async function main() {
  const email = 'demo@business-os.test';
  const passwordHash = await bcrypt.hash('DemoPassword!123', 12);

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, role: 'owner' })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (user) {
    await db.insert(businessProfiles).values({
      userId: user.id,
      name: 'Only Coaching',
      description: 'Online fitness coaching — structured training and nutrition programs.',
      model: 'Service / coaching',
      idealCustomer: 'Busy professionals who want a structured, hands-off training plan.',
      quarterlyGoal: 'Grow monthly recurring coaching revenue to $15k',
      accountingSoftware: 'Xero'
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded demo user: ${email} / DemoPassword!123`);
  } else {
    // eslint-disable-next-line no-console
    console.log('Demo user already exists — skipped.');
  }

  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
