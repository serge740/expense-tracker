// Starts the WHOLE module tree (every module and provider, as the real server does) with a fake database, and fails
// if any module is missing, undefined or circular. It exists because two modules importing each other crashed the
// real server at start-up while every single-module test still passed. It touches no database.
//   npm run check:boot
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Any model, any method: resolves to nothing, so start-up jobs that look at the database simply find no work.
const model = new Proxy({}, { get: () => async () => [] });
const fakeDatabase = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'then') return undefined; // not a promise
    if (typeof prop === 'string' && prop.startsWith('$')) return async () => undefined;
    return model;
  },
});

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService).useValue(fakeDatabase)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  console.log('PASS  the whole app starts: every module is created and every route is registered');
  await app.close();
  process.exit(0);
}
main().catch(e => { console.error('FAIL  the app cannot start:\n' + (e?.message ?? e)); process.exit(1); });
