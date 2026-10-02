// A manager's note travels only with a rejection: typed and then approved,
// nothing is stored; typed and rejected, the user reads it.
import { PrismaClient } from '@prisma/client';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = process.env.E2E_API ?? 'http://localhost:3000/api';
const WEB = process.env.E2E_WEB ?? 'http://localhost:3001';
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const created: string[] = [];
let ok = 0;
let bad = 0;
const check = (n: string, pass: boolean, d?: unknown) => {
  pass ? ok++ : bad++;
  console.log(pass ? 'OK  ' : 'FAIL', n, pass ? '' : JSON.stringify(d).slice(0, 300));
};
async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}
async function login(kp: Keypair, role?: 'startup' | 'specialist') {
  const ch = await call('POST', '/auth/challenge', undefined, { stellarAddress: kp.publicKey() });
  const tx = TransactionBuilder.fromXDR(ch.xdr, Networks.TESTNET);
  tx.sign(kp);
  const res = await call('POST', '/auth/login', undefined, { stellarAddress: kp.publicKey(), signedXdr: tx.toXDR(), role });
  created.push(res.user.id);
  return { token: res.accessToken as string, id: res.user.id as string };
}

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9343', '--no-first-run',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'mn-'))}`, 'about:blank',
]);

try {
  const managerKp = Keypair.random();
  const manager = await prisma.user.create({
    data: { stellarAddress: managerKp.publicKey(), role: 'manager', verificationStatus: 'approved' },
  });
  created.push(manager.id);
  const mgr = await login(managerKp);
  const approved = await login(Keypair.random(), 'specialist');
  const rejected = await login(Keypair.random(), 'specialist');
  await call('POST', '/verification', approved.token, { fullName: 'Note Approve', contactEmail: 'note-approve@example.com', country: 'BO' });
  await call('POST', '/verification', rejected.token, { fullName: 'Note Reject', contactEmail: 'note-reject@example.com', country: 'MX' });

  let targets: any[] = [];
  for (let i = 0; i < 40 && !targets.length; i++) {
    await sleep(250);
    try { targets = (await (await fetch('http://127.0.0.1:9343/json')).json()).filter((t: any) => t.type === 'page'); } catch {}
  }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0;
  const pending = new Map<number, (v: any) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result ?? m.error); pending.delete(m.id); }
  };
  const send = (method: string, params = {}) => new Promise<any>((r) => { const i = ++n; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (x: string) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
  const text = async () => ((await ev('document.body.innerText')) ?? '') as string;
  const waitFor = async (what: string, ms = 15000) => {
    for (let t = 0; t < ms; t += 500) { if ((await text()).includes(what)) return true; await sleep(500); }
    return false;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const as = async (token: string, path: string) => {
    await send('Page.navigate', { url: WEB + '/login' });
    await sleep(1500);
    await ev(`localStorage.setItem('pocket.token', ${JSON.stringify(token)})`);
    await send('Page.navigate', { url: WEB + path });
    await sleep(2500);
  };
  /** Type into the note of the card for this person, then press one of its buttons. */
  const review = async (name: string, note: string, button: 'Approve' | 'Reject') => {
    const card = `[...document.querySelectorAll('textarea')].find(t => t.closest('div.space-y-4')?.innerText.includes(${JSON.stringify(name)}))`;
    await ev(`(${card}).focus()`);
    await send('Input.insertText', { text: note });
    await sleep(300);
    const at = await ev(`(() => { const box = (${card}).closest('div.space-y-4'); const b = [...box.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(button)}); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await sleep(500);
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
    await sleep(2500);
  };

  await as(mgr.token, '/manager/verifications');
  await waitFor('Note Approve');
  check('the note says it is only for rejecting', await ev(`!![...document.querySelectorAll('textarea')].find(t => /only to reject/i.test(t.placeholder))`), 'placeholder');
  await review('Note Approve', 'Checked their LinkedIn, internal', 'Approve');
  const a = await prisma.verificationRequest.findFirst({ where: { userId: approved.id } });
  check('approving with a note typed approves and stores no note', a?.status === 'approved' && a.reviewNote === null, { status: a?.status, note: a?.reviewNote });

  await as(mgr.token, '/manager/verifications');
  await waitFor('Note Reject');
  await review('Note Reject', 'Add your LinkedIn so we can check your work', 'Reject');
  const r = await prisma.verificationRequest.findFirst({ where: { userId: rejected.id } });
  check('rejecting stores the note', r?.status === 'rejected' && r.reviewNote === 'Add your LinkedIn so we can check your work', { status: r?.status, note: r?.reviewNote });
  await as(rejected.token, '/verification');
  check('the rejected user reads why', await waitFor('Add your LinkedIn so we can check your work'), (await text()).slice(0, 300));
} catch (e) {
  bad++;
  console.log('ERROR', (e as Error).message);
} finally {
  chrome.kill();
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  console.log(`\n${ok} OK, ${bad} FAIL`);
  await prisma.$disconnect();
  process.exit(0);
}
