// Usage: npm run check-env [-- --production]    (reads .env.local if present). Prints status only, never values.
import { readFileSync, existsSync } from 'node:fs';
import { checkConfig } from '../lib/config.js';
for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const production = process.argv.includes('--production');
const { ok, report, problems, warnings } = checkConfig(process.env, production ? { production: true } : {});
for (const [k, v] of Object.entries(report)) console.log(`${k}: ${v}`);
if (warnings.length) console.log('\nWarnings:\n - ' + warnings.join('\n - '));
console.log(ok ? '\nConfiguration OK' : '\nProblems:\n - ' + problems.join('\n - '));
process.exit(ok ? 0 : 1);
