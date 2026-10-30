/**
 * Seeds exactly one thing: the first IT Support account, so someone can sign in to /it-support
 * at all. Purely additive — an upsert keyed by email, so running it again never duplicates or
 * deletes anything; it just confirms the account still exists (and updates the password if you
 * pass a new one).
 *
 * Email/password come from env vars so no real credential ever sits in source control:
 *   IT_SUPPORT_EMAIL     (default: it-support@abyexpense.local)
 *   IT_SUPPORT_PASSWORD  (default: a random one, printed once below — write it down)
 *   IT_SUPPORT_NAME      (default: IT Support)
 *
 *   npx ts-node prisma/seed.ts
 *   IT_SUPPORT_EMAIL=you@real.com IT_SUPPORT_PASSWORD='Choose-Your-Own!23' npx ts-node prisma/seed.ts
 */
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaService();

const EMAIL = (process.env.IT_SUPPORT_EMAIL ?? 'it-support@abyexpense.local').toLowerCase().trim();
const NAME = process.env.IT_SUPPORT_NAME ?? 'IT Support';
const providedPassword = process.env.IT_SUPPORT_PASSWORD;
const generatedPassword = !providedPassword ? crypto.randomBytes(12).toString('base64url') : null;
const PASSWORD = providedPassword ?? generatedPassword!;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.iTAdmin.upsert({
    where: { email: EMAIL },
    update: { passwordHash, name: NAME, isActive: true },
    create: { email: EMAIL, name: NAME, passwordHash },
  });

  console.log(`IT Support account ready: ${admin.email}`);
  if (generatedPassword) {
    console.log(`Generated password (shown once — write it down now): ${generatedPassword}`);
  } else {
    console.log('Password set from IT_SUPPORT_PASSWORD.');
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
