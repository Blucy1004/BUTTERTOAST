import { createHash, KeyObject, verify } from 'node:crypto';
import { record, exactKeys } from './ipc';
export type UpdatePolicy = { publisherKey: KeyObject; currentVersion: string; downloadOrigin: string; now?: number };
function version(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value)) return null;
  return value.split('.').map(Number);
}
function newer(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
/** Standard Ed25519/SHA-256 verification only; does not download, install or execute.
 * publisherKey and downloadOrigin must come from the signed app, never the update response.
 */
export function verifyManifest(manifest:Buffer,signature:Buffer,policy:UpdatePolicy):Readonly<{version:string;url:string;size:number;sha256:string;expires:number}> {
  const reject = () => { throw new Error('Update rejected'); };
  if (manifest.length > 8192 || signature.length !== 64 || policy.publisherKey.type !== 'public' || policy.publisherKey.asymmetricKeyType !== 'ed25519') return reject();
  if (!verify(null, manifest, policy.publisherKey, signature)) return reject();
  let data: unknown;
  try { data = JSON.parse(manifest.toString('utf8')); } catch { return reject(); }
  if (!record(data) || !exactKeys(data, ['version', 'url', 'size', 'sha256', 'expires'])) return reject();
  const next = version(data.version), current = version(policy.currentVersion);
  if (!next || !current || !newer(next, current) || !Number.isSafeInteger(data.size) || (data.size as number)<1 || (data.size as number)>512*1024*1024
    || typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)
    || !Number.isSafeInteger(data.expires) || (data.expires as number) <= (policy.now ?? Date.now())) return reject();
  try {
    if (typeof data.url !== 'string') return reject();
    const url = new URL(data.url);
    if (url.protocol !== 'https:' || url.origin !== policy.downloadOrigin || url.username || url.password || url.hash) return reject();
  } catch { return reject(); }
  return Object.freeze(data) as Readonly<{version:string;url:string;size:number;sha256:string;expires:number}>;
}
export function verifyUpdate(manifest: Buffer, signature: Buffer, artifact: Buffer, policy: UpdatePolicy): Readonly<{ version: string; artifact: Buffer }> {
  const data=verifyManifest(manifest,signature,policy);
  if(data.size!==artifact.length||createHash('sha256').update(artifact).digest('hex')!==data.sha256)throw new Error('Update rejected');
  return Object.freeze({ version:data.version, artifact:Buffer.from(artifact) });
}
