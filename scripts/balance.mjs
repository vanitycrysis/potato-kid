// `npm run balance [seeds]`: the balance simulator report (src/sim/balance-cli.ts), run
// through Vite so the TypeScript sim and content load exactly as the game loads them.
// Every scenario × seed runs in its own process, in parallel, then the medians are printed.
import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const { module } = await runnerImport('./src/sim/balance-cli.ts');

if (process.argv[2] === '--one') {
  // Child: one scenario on one seed, printed as JSON.
  process.stdout.write(JSON.stringify(module.runOne(Number(process.argv[3]), Number(process.argv[4]))));
} else {
  const arg = Number(process.argv[2] ?? 8);
  const seeds = Number.isFinite(arg) && arg > 0 ? arg : 8;
  const jobs = module.scenarios.flatMap((_, i) => Array.from({ length: seeds }, (_, s) => [i, s + 1]));
  const reports = module.scenarios.map(() => []);
  const self = fileURLToPath(import.meta.url);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [i, seed] = jobs[next++];
      const out = await new Promise((resolve, reject) =>
        execFile(process.execPath, [self, '--one', String(i), String(seed)], { maxBuffer: 1 << 26 }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
      );
      reports[i].push(JSON.parse(out));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs.length, availableParallelism() - 2)) }, worker));
  for (const r of reports) r.sort((a, b) => a.seed - b.seed);
  console.log(module.summarize(reports, seeds));
}
