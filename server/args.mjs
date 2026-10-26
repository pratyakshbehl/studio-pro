/**
 * Imported first by server.mjs, before anything reads process.env, so test runs
 * can point Studio at scratch folders:
 *   node server.mjs --port 4898 --data <dir> --media <dir> --backups <dir>
 */
const flags = { "--port": "PORT", "--data": "STUDIO_PRO_DATA", "--media": "STUDIO_PRO_MEDIA", "--backups": "STUDIO_PRO_BACKUPS" };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const env = flags[argv[i]];
  if (env && argv[i + 1]) process.env[env] = argv[++i];
}
