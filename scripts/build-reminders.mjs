import { build } from 'esbuild';
await build({
  stdin: {
    contents:
      "export { buildReminders } from './src/lib/reminder-jobs'; export { allowedPushEndpoint } from './src/lib/push-endpoint';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: 'supabase/functions/level01-reminders/jobs.js',
  minify: true,
});
