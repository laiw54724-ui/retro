#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXPECTED_COMMIT = '728a866ad59a54fd4082dbe000e1e62e50bd90e9';
const PRIMARY_URL = 'https://github.com/trapd00r/win95-winxp_icons';
const SECONDARY_URL = 'https://winclassic.github.io/resources';
const OUT_DIR = path.join(ROOT, 'apps/web/public/windows-icons');
const PACK_MARKER_NAME = '.retro-icon-pack.json';
const MANIFEST = path.join(ROOT, 'apps/web/src/lib/windowsIconManifest.ts');
const PROVENANCE = path.join(ROOT, 'docs/assets/windows-icons.provenance.json');
const THIRD_PARTY_ASSETS = path.join(ROOT, 'docs/THIRD_PARTY_ASSETS.md');
const STAGING_DIR = `${OUT_DIR}.__staging__`;
const BACKUP_DIR = `${OUT_DIR}.__backup__`;
const MANIFEST_TEMP = `${MANIFEST}.__tmp__`;
const PROVENANCE_TEMP = `${PROVENANCE}.__tmp__`;
const MANIFEST_BACKUP = `${MANIFEST}.__backup__`;
const PROVENANCE_BACKUP = `${PROVENANCE}.__backup__`;
const JOURNAL = path.join(path.dirname(OUT_DIR), 'windows-icons.__transaction__.json');
const JOURNAL_TEMP = `${JOURNAL}.__tmp__`;
const COMMIT_MARKER = path.join(path.dirname(OUT_DIR), 'windows-icons.__committed__');
const SUPPORTED = new Set(['.ico', '.png']);
const UNSUPPORTED = new Set(['.ani', '.icl']);

function arg(name) {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`));
  return value?.slice(name.length + 3);
}

function fail(message) { console.error(`icons: ${message}`); process.exitCode = 1; }
function codeUnitCompare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function titleLabel(value) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function relSlug(relativePath) {
  const slug = relativePath.toLowerCase().replace(/\\/g, '/').replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `icon-${sha256(Buffer.from(relativePath)).slice(0, 12)}`;
}
function json(value) { return JSON.stringify(value, null, 2) + '\n'; }
function packMarker(fileCount) {
  return json({
    schemaVersion: 1,
    source: PRIMARY_URL,
    commit: EXPECTED_COMMIT,
    fileCount,
    license: 'NOASSERTION',
  });
}
async function walk(directory, base = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => codeUnitCompare(a.name, b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full, base));
    else if (entry.isFile()) result.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return result.sort(codeUnitCompare);
}
async function hashFile(file) {
  const data = await fs.readFile(file);
  return { sha256: sha256(data), bytes: data.length };
}
async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}
async function remove(file) { await fs.rm(file, { recursive: true, force: true }); }
async function fsyncParent(file) {
  try { const handle = await fs.open(path.dirname(file), 'r'); await handle.sync(); await handle.close(); }
  catch { /* Best effort: directory fsync is unsupported on some platforms (notably Windows). */ }
}
async function durableExclusiveWrite(file, contents) {
  const handle = await fs.open(file, 'wx');
  try { await handle.writeFile(contents); await handle.sync(); }
  finally { await handle.close(); }
  await fsyncParent(file);
}
async function durableJournalWrite(journal) {
  await remove(JOURNAL_TEMP);
  await durableExclusiveWrite(JOURNAL_TEMP, JSON.stringify(journal, null, 2) + '\n');
  await fs.rename(JOURNAL_TEMP, JOURNAL);
  await fsyncParent(JOURNAL);
}
async function cleanupCommitted(journal) {
  const errors = [];
  for (const item of journal.targets) {
    try { await remove(item.backup); } catch (error) { errors.push(`${item.backup}: ${error.message}`); }
  }
  for (const file of [STAGING_DIR, MANIFEST_TEMP, PROVENANCE_TEMP, JOURNAL_TEMP]) {
    try { await remove(file); } catch (error) { errors.push(`${file}: ${error.message}`); }
  }
  if (errors.length) throw new Error(`committed cleanup failed; recovery paths: ${errors.join('; ')}`);
  try { await remove(JOURNAL); await fsyncParent(JOURNAL); } catch (error) { throw new Error(`committed cleanup failed; recovery paths: ${JOURNAL}: ${error.message}`); }
  try { await remove(COMMIT_MARKER); await fsyncParent(COMMIT_MARKER); } catch (error) { throw new Error(`committed cleanup failed; recovery paths: ${COMMIT_MARKER}: ${error.message}`); }
}
async function recoverTransaction() {
  const journalExists = await exists(JOURNAL);
  const markerExists = await exists(COMMIT_MARKER);
  if (!journalExists && !markerExists) {
    await cleanStaleTransactionArtifacts();
    return;
  }
  if (!journalExists && markerExists) {
    try {
      await cleanStaleTransactionArtifacts();
      await remove(COMMIT_MARKER);
      await fsyncParent(COMMIT_MARKER);
    } catch (error) { throw new Error(`committed cleanup failed; recovery paths: ${error.message}`); }
    return;
  }
  let journal;
  try { journal = JSON.parse(await fs.readFile(JOURNAL, 'utf8')); }
  catch (error) { throw new Error(`cannot read transaction journal ${JOURNAL}: ${error.message}`); }
  if (markerExists) { await cleanupCommitted(journal); return; }
  const recoveryErrors = [];
  for (const item of [...journal.targets].reverse()) {
    try {
      const targetExists = await exists(item.target);
      const backupExists = await exists(item.backup);
      if (item.hadOriginal && backupExists) {
        if (targetExists) await remove(item.target);
        await fs.rename(item.backup, item.target);
      } else if (!item.hadOriginal && targetExists) {
        await remove(item.target);
      }
    } catch (error) { recoveryErrors.push(`${item.target}: ${error.message}`); }
  }
  if (recoveryErrors.length) throw new Error(`transaction recovery failed; recovery paths retained: ${recoveryErrors.join('; ')}`);
  for (const file of [STAGING_DIR, BACKUP_DIR, MANIFEST_TEMP, PROVENANCE_TEMP, MANIFEST_BACKUP, PROVENANCE_BACKUP, JOURNAL, JOURNAL_TEMP]) await remove(file);
}
async function cleanStaleTransactionArtifacts() {
  for (const file of [STAGING_DIR, BACKUP_DIR, MANIFEST_TEMP, PROVENANCE_TEMP, MANIFEST_BACKUP, PROVENANCE_BACKUP, JOURNAL_TEMP]) await remove(file);
}
function tsManifest(records, curated) {
  const lines = [
    '// Generated by scripts/import-windows-icons.mjs; do not edit manually.',
    'export interface WindowsIconRecord {',
    '  key: string;',
    '  label: string;',
    '  path: string;',
    '  upstreamPath: string;',
    '}',
    '',
    `export const WINDOWS_ICON_SOURCE = ${JSON.stringify(PRIMARY_URL)} as const;`,
    `export const WINDOWS_ICON_RECORDS: readonly WindowsIconRecord[] = ${JSON.stringify(records, null, 2)};`,
    `export const CURATED_WINDOWS_ICON_KEYS: readonly string[] = ${JSON.stringify(curated, null, 2)};`,
    '',
  ];
  return lines.join('\n');
}
async function collect(source) {
  let commit;
  try { commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { throw new Error(`source is not a git checkout: ${source}`); }
  if (commit !== EXPECTED_COMMIT) throw new Error(`source commit ${commit} does not match required ${EXPECTED_COMMIT}`);
  const all = await walk(source);
  const supported = all.filter((item) => SUPPORTED.has(path.extname(item).toLowerCase()));
  const unsupported = all.filter((item) => UNSUPPORTED.has(path.extname(item).toLowerCase()));
  const records = [];
  const inputs = [];
  const keyCounts = new Map();
  const usedKeys = new Set();
  for (const upstreamPath of supported) {
    const baseKey = relSlug(upstreamPath);
    let count = keyCounts.get(baseKey) ?? 0;
    let key;
    do { count += 1; key = count === 1 ? baseKey : `${baseKey}-${count}`; } while (usedKeys.has(key));
    keyCounts.set(baseKey, count);
    usedKeys.add(key);
    const ext = path.extname(upstreamPath).toLowerCase();
    const outputName = `${key}${ext}`;
    const inputPath = path.join(source, upstreamPath);
    const outputPath = path.join(OUT_DIR, outputName);
    const info = await hashFile(inputPath);
    records.push({ key, label: titleLabel(path.basename(upstreamPath, path.extname(upstreamPath))), path: `/windows-icons/${outputName}`, upstreamPath });
    inputs.push({ path: upstreamPath, ...info });
  }
  const curated = records.filter((record) => /computer|desktop|folder|document|camera|image|music|network|mail|user/i.test(`${record.key} ${record.upstreamPath}`)).slice(0, 48).map((record) => record.key);
  const unsupportedInventory = [];
  for (const upstreamPath of unsupported) unsupportedInventory.push({ path: upstreamPath, extension: path.extname(upstreamPath).toLowerCase(), ...(await hashFile(path.join(source, upstreamPath))) });
  return { commit, all, supported, unsupported, records, curated, inputs, unsupportedInventory };
}
async function build(source) {
  const data = await collect(source);
  const outputs = [];
  for (const record of data.records) {
    const destination = path.join(OUT_DIR, path.basename(record.path));
    const info = await hashFile(path.join(source, record.upstreamPath));
    outputs.push({ path: path.relative(ROOT, destination).split(path.sep).join('/'), ...info });
  }
  const provenance = {
    schemaVersion: 1,
    generator: { path: 'scripts/import-windows-icons.mjs', version: '1.0.0' },
    source: { url: PRIMARY_URL, commit: data.commit, license: 'NOASSERTION' },
    secondaryReference: SECONDARY_URL,
    rights: 'Imported from the pinned upstream repository for local product use; upstream license is not asserted here. Review upstream terms before redistribution.',
    supportedExtensions: [...SUPPORTED].sort(),
    unsupportedInventory: data.unsupportedInventory,
    inputs: data.inputs,
    outputs,
  };
  return { data, manifest: tsManifest(data.records, data.curated), provenance: json(provenance), marker: packMarker(data.records.length) };
}
async function run() {
  await recoverTransaction();
  await cleanStaleTransactionArtifacts();
  const source = arg('source');
  const check = process.argv.includes('--check');
  if (!source || !path.isAbsolute(source)) throw new Error('--source must be an absolute path; run `pnpm icons:audit -- --source=/absolute/path/to/win95-winxp_icons`');
  const built = await build(path.resolve(source));
  if (built.data.supported.length !== 1193 || built.data.unsupported.length !== 7) throw new Error(`unexpected inventory: ${built.data.supported.length} supported, ${built.data.unsupported.length} unsupported`);
  if (check) {
    let assetPolicy;
    try { assetPolicy = await fs.readFile(THIRD_PARTY_ASSETS, 'utf8'); }
    catch (error) { throw new Error(`missing asset licensing policy: ${path.relative(ROOT, THIRD_PARTY_ASSETS)} (${error.message})`); }
    const heading = '## Windows 95–XP icons';
    const headingStart = assetPolicy.indexOf(heading);
    if (headingStart < 0) throw new Error(`asset licensing policy is incomplete (${path.relative(ROOT, THIRD_PARTY_ASSETS)}); missing section ${heading}`);
    const sectionStart = headingStart + heading.length;
    const following = assetPolicy.slice(sectionStart);
    const nextSection = following.search(/^## /m);
    const iconSection = following.slice(0, nextSection < 0 ? following.length : nextSection);
    const policyLines = iconSection.split(/\r?\n/).map((line) => line.trim());
    const exactPolicyLines = [
      `- Primary source: ${PRIMARY_URL}`,
      `- Pinned source commit: ${EXPECTED_COMMIT}`,
    ];
    const missingPolicyRequirements = exactPolicyLines.filter((line) => !policyLines.includes(line));
    const licenseLine = policyLines.find((line) => line.startsWith('- License status:'));
    if (!licenseLine || !licenseLine.startsWith('- License status: NOASSERTION;')) missingPolicyRequirements.push('license status NOASSERTION;');
    if (missingPolicyRequirements.length) {
      throw new Error(`asset licensing policy is incomplete (${path.relative(ROOT, THIRD_PARTY_ASSETS)}); missing exact lines: ${missingPolicyRequirements.join(', ')}`);
    }
    const [manifest, provenance] = await Promise.all([fs.readFile(MANIFEST, 'utf8'), fs.readFile(PROVENANCE, 'utf8')]);
    if (manifest !== built.manifest) throw new Error(`generated manifest differs: ${path.relative(ROOT, MANIFEST)}`);
    if (provenance !== built.provenance) throw new Error(`generated provenance differs: ${path.relative(ROOT, PROVENANCE)}`);
    const provenanceData = JSON.parse(provenance);
    let outputEntries;
    try { outputEntries = await fs.readdir(OUT_DIR, { withFileTypes: true }); }
    catch { throw new Error(`missing output directory: ${path.relative(ROOT, OUT_DIR)}`); }
    const expectedFiles = new Set([...built.data.records.map((record) => path.basename(record.path)), PACK_MARKER_NAME]);
    const actualFiles = new Set(outputEntries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    const extraFiles = outputEntries.filter((entry) => !entry.isFile() || !expectedFiles.has(entry.name)).map((entry) => entry.name).sort(codeUnitCompare);
    const missingFiles = [...expectedFiles].filter((name) => !actualFiles.has(name)).sort(codeUnitCompare);
    if (extraFiles.length || missingFiles.length) throw new Error(`output inventory mismatch: extra=[${extraFiles.join(', ')}] missing=[${missingFiles.join(', ')}]`);
    if (await fs.readFile(path.join(OUT_DIR, PACK_MARKER_NAME), 'utf8') !== built.marker) throw new Error(`pack marker differs: ${PACK_MARKER_NAME}`);
    for (const record of built.data.records) {
      const actual = await hashFile(path.join(OUT_DIR, path.basename(record.path)));
      const expected = provenanceData.outputs.find((item) => item.path === path.relative(ROOT, path.join(OUT_DIR, path.basename(record.path))).split(path.sep).join('/'));
      if (!expected || actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw new Error(`output hash mismatch: ${record.path}`);
    }
    console.log(`icons: audit ok (${built.data.records.length} imported, ${built.data.unsupported.length} unsupported)`);
    return;
  }
  await fs.mkdir(STAGING_DIR, { recursive: true });
  try {
    for (const record of built.data.records) await fs.copyFile(path.join(source, record.upstreamPath), path.join(STAGING_DIR, path.basename(record.path)));
    await durableExclusiveWrite(path.join(STAGING_DIR, PACK_MARKER_NAME), built.marker);
    for (const record of built.data.records) {
      const staged = await hashFile(path.join(STAGING_DIR, path.basename(record.path)));
      const input = await hashFile(path.join(source, record.upstreamPath));
      if (staged.sha256 !== input.sha256 || staged.bytes !== input.bytes) throw new Error(`staging hash mismatch: ${record.path}`);
    }
    await durableExclusiveWrite(MANIFEST_TEMP, built.manifest);
    await durableExclusiveWrite(PROVENANCE_TEMP, built.provenance);
    const targets = [
      { target: OUT_DIR, staging: STAGING_DIR, backup: BACKUP_DIR },
      { target: MANIFEST, staging: MANIFEST_TEMP, backup: MANIFEST_BACKUP },
      { target: PROVENANCE, staging: PROVENANCE_TEMP, backup: PROVENANCE_BACKUP },
    ];
    const journal = { schemaVersion: 1, targets: [] };
    for (const item of targets) journal.targets.push({ ...item, hadOriginal: await exists(item.target) });
    await durableJournalWrite(journal);
    for (const item of journal.targets) {
      if (await exists(item.backup)) await remove(item.backup);
      if (item.hadOriginal) await fs.rename(item.target, item.backup);
    }
    for (const item of journal.targets) await fs.rename(item.staging, item.target);
    await durableExclusiveWrite(COMMIT_MARKER, 'committed\n');
    await cleanupCommitted(journal);
  } catch (error) {
    try { await recoverTransaction(); }
    catch (recoveryError) { throw new Error(`${error.message}; ${recoveryError.message}`); }
    throw error;
  }
  console.log(`icons: imported ${built.data.records.length}; unsupported ${built.data.unsupported.length}`);
}
run().catch((error) => fail(error.message));
