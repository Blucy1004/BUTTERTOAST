import { packager } from '@electron/packager';
import { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options as F, FuseState } from '@electron/fuses';
import { getRawHeader, listPackage, extractFile } from '@electron/asar';
import { NtExecutable, NtExecutableResource } from 'resedit';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const require=createRequire(import.meta.url),electronPackage=require('electron/package.json');
assert.equal(electronPackage.version,pkg.devDependencies.electron,'Install the locked Electron version before packaging');
const electronChecksums=require('electron/checksums.json');
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'buttertoast-package-'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  // Explicit payload: never package tests, developer dependencies, profiles or credentials.
  await fs.cp(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({
    name: pkg.name, author: 'ButterToast project', productName: 'ButterToast', version: pkg.version,
    description: pkg.description, main: 'dist/main.js'
  }, null, 2) + '\n');
  const files = new Map();
  async function collect(directory, base = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = path.posix.join(base, entry.name);
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file, relative);
      else {
        assert(entry.isFile(), `Unexpected payload entry ${relative}`);
        assert(relative === 'package.json' || relative === 'dist/starfield.png' || ['dist/fonts/PretendardVariable.woff2','dist/fonts/OFL-Pretendard.txt'].includes(relative) || /^dist\/[a-zA-Z0-9_./-]+\.(js|html|css)$/.test(relative) || /^dist\/guidance\/(SYSTEM|ACTIONS|HANDOFF|RECOVERY)\.md$/.test(relative), `Unexpected payload ${relative}`);
        files.set(relative, await fs.readFile(file));
      }
    }
  }
  await collect(stage);
  const [output] = await packager({
    dir: stage, out: path.join(root, 'artifacts', 'windows'), name: 'ButterToast',
    executableName: 'ButterToast', platform: 'win32', arch: 'x64',
    electronVersion: pkg.devDependencies.electron, appVersion: pkg.version,
    download: { cacheRoot: path.join(root, 'artifacts', '.electron-cache'),checksums:electronChecksums },
    asar: true, prune: false, overwrite: true,
    win32metadata: { ProductName: 'ButterToast Security Test', 'requested-execution-level': 'asInvoker' }
  });
  const exePath = path.join(output, 'ButterToast.exe');
  const fuses = {
    [F.RunAsNode]: false, [F.EnableCookieEncryption]: true,
    [F.EnableNodeOptionsEnvironmentVariable]: false, [F.EnableNodeCliInspectArguments]: false,
    [F.EnableEmbeddedAsarIntegrityValidation]: true, [F.OnlyLoadAppFromAsar]: true,
    [F.GrantFileProtocolExtraPrivileges]: false
  };
  await flipFuses(exePath, { version: FuseVersion.V1, ...fuses });
  const actual = await getCurrentFuseWire(exePath);
  for (const [key, enabled] of Object.entries(fuses)) {
    assert.equal(actual[key], enabled ? FuseState.ENABLE : FuseState.DISABLE, `Fuse mismatch: ${F[key]}`);
  }
  const asar = path.join(output, 'resources', 'app.asar');
  for (const name of listPackage(asar)) {
    const normalized = name.replaceAll('\\', '/').replace(/^\//, '');
    // @electron/asar traverses directories using the host's path separator.
    // Keep the allowlist portable, but pass native paths to its extraction API.
    if (files.has(normalized)) assert.deepEqual(extractFile(asar, path.normalize(normalized)), files.get(normalized));
    else assert([...files.keys()].some(p => p.startsWith(normalized + '/')), `Unexpected ASAR entry ${name}`);
  }
  for (const [name, content] of files) assert.deepEqual(extractFile(asar, path.normalize(name)), content);
  const executable = await fs.readFile(exePath);
  assert.equal(executable.toString('ascii', 0, 2), 'MZ');
  const peOffset = executable.readUInt32LE(0x3c);
  assert.equal(executable.toString('ascii', peOffset, peOffset + 4), 'PE\0\0');
  assert.equal(executable.readUInt16LE(peOffset + 4), 0x8664, 'Expected Windows x64');
  const pe = NtExecutable.from(executable);
  const resource = NtExecutableResource.from(pe).entries.find(e => e.type === 'INTEGRITY' && e.id === 'ELECTRONASAR');
  assert(resource, 'Missing embedded ASAR integrity');
  const entries = JSON.parse(Buffer.from(resource.bin).toString('utf8'));
  const expectedHeaderHash = sha256(getRawHeader(asar).headerString);
  assert(entries.some(e => e.file.replaceAll('\\', '/') === 'resources/app.asar' && e.alg === 'SHA256' && e.value === expectedHeaderHash), 'Embedded ASAR hash mismatch');
  const report = {
    appVersion: pkg.version, electronVersion: pkg.devDependencies.electron, platform: 'win32', arch: 'x64',
    signed: false, windowsExecutionTested: false, payloadFiles: files.size,
    fuses: Object.fromEntries(Object.entries(fuses).map(([key, enabled]) => [F[key], enabled])),
    embeddedAsarHeaderHashVerified: true, asarSha256: sha256(await fs.readFile(asar)),
    executableSha256: sha256(executable), builtAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(output, 'BUILD-VERIFICATION.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.cp(path.join(root, 'docs', 'SECURITY-VALIDATION.md'), path.join(output, 'SECURITY-VALIDATION.md'));
  await fs.cp(path.join(root, 'docs', 'PROFILE-THEMES-0.3.md'), path.join(output, 'LATEST-VALIDATION.md'));
  await fs.cp(path.join(root, 'src', 'fonts','OFL-Pretendard.txt'), path.join(output, 'OFL-Pretendard.txt'));
  await fs.cp(path.join(root, 'src', 'fonts','README.md'), path.join(output, 'FONT-NOTICE.md'));
  await fs.cp(path.join(root, 'docs', 'IMPLEMENTATION-STATUS.md'), path.join(output, 'IMPLEMENTATION-STATUS.md'));
  await fs.cp(path.join(root, 'docs', 'WINDOWS-TEST-BUILD.md'), path.join(output, 'READ-ME-FIRST.md'));
  await fs.cp(path.join(root, 'docs', 'DESIGN-IMPLEMENTATION.md'), path.join(output, 'DESIGN-IMPLEMENTATION.md'));
  await fs.mkdir(path.join(output, 'design'), {recursive:true});
  for(const name of ['BRIEF.md','owner-layout.png','implemented-workspace.png','upgrade-workspace.png','profile-light-workspace.png','profile-settings.png','profile-appearance.png']) await fs.cp(path.join(root,'docs','design',name),path.join(output,'design',name));
  await fs.cp(path.join(root, 'artifacts', 'sbom.cdx.json'), path.join(output, 'SBOM.cdx.json'));
  console.log(`Verified Windows x64 test build: ${output}`);
  console.log(`Application payload: ${files.size} files; hardened fuses and embedded ASAR hash verified.`);
} finally { await fs.rm(stage, { recursive: true, force: true }); }
