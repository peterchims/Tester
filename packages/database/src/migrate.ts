import { closeDb, migrate } from './index.js';

migrate()
  .then(() => {
    console.log('[migrate] schema applied');
    return closeDb();
  })
  .catch((error) => {
    console.error('[migrate] failed', error);
    process.exit(1);
  });
