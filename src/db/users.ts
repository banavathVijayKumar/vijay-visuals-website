import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

const SUPER_ADMIN_EMAILS = new Set(['vk66278@gmail.com']);

export async function getOrCreateUser(uid: string, email: string, name = '') {
  try {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const isSuperAdmin = SUPER_ADMIN_EMAILS.has(normalizedEmail);
    const displayName = name.trim() || normalizedEmail.split('@')[0] || 'Member';

    const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (existing.length > 0) {
      const current = existing[0];
      const nextRole = isSuperAdmin ? 'super_admin' : current.role;
      const updated = await db
        .update(users)
        .set({
          email: normalizedEmail || current.email,
          name: current.name || displayName,
          role: nextRole,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, uid))
        .returning();
      return updated[0];
    }

    const inserted = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        name: displayName,
        role: isSuperAdmin ? 'super_admin' : 'customer',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database user synchronization failed:', error);
    throw new Error('Unable to synchronize user profile right now.', { cause: error });
  }
}
