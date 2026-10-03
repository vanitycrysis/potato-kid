// `npm run balance [seeds]`: the balance simulator report (src/sim/balance-cli.ts), run
// through Vite so the TypeScript sim and content load exactly as the game loads them.
import { runnerImport } from 'vite';

const seeds = Number(process.argv[2] ?? 8);
const { module } = await runnerImport('./src/sim/balance-cli.ts');
console.log(module.run(Number.isFinite(seeds) && seeds > 0 ? seeds : 8));
