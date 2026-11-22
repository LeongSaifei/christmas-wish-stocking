import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleApi } from '../worker/api.js';
import { submitWish, newReceiptId } from '../public/storage.js';
import { inviteAddress } from '../public/stockings.js';
const valid = () => ({ id: crypto.randomUUID(), nickname: '', gift: '一本喜欢的书', consent: true, website: '' });
function envFor(db) {
  return { DB: { prepare: sql => ({ bind: (...args) => {
    const stmt = db.prepare(sql.replace(/\?[123]/g, '?'));
    return { first: async () => stmt.get(...args) ?? null, all: async () => ({ results: stmt.all(...args) }) };
  } }) } };
}
function request(body, origin='https://leongsaifei.github.io', ip) { const headers={'Content-Type':'application/json',Origin:origin}; if (ip) headers['CF-Connecting-IP']=ip; return new Request('https://post.example/api/wishes', { method:'POST', headers,body:JSON.stringify(body) }); }
const schema = ['0000_wishes.sql','0001_submit_counts.sql','0002_stockings.sql'].map(f=>readFileSync(new URL('../drizzle/'+f, import.meta.url),'utf8')).join('\n').replaceAll('--> statement-breakpoint','');
test('durable save survives DB close/reopen; duplicate retry saves one row; collision cannot overwrite', async () => {
  const dir = mkdtempSync(join(tmpdir(),'christmas-test-')); const path=join(dir,'db.sqlite');
  let db = new DatabaseSync(path); db.exec(schema); const body=valid();
  assert.equal((await handleApi(request(body), envFor(db))).status,201);
  db.close(); db = new DatabaseSync(path);
  assert.equal(db.prepare('SELECT gift FROM wishes').get().gift,body.gift);
  assert.equal((await handleApi(request(body), envFor(db))).status,200);
  assert.equal(db.prepare('SELECT count(*) AS n FROM wishes').get().n,1);
  assert.equal((await handleApi(request({...body,gift:'changed'}), envFor(db))).status,409);
  db.close(); rmSync(dir,{recursive:true});
});
test('private records: no read API and reject foreign origins', async () => {
  assert.equal((await handleApi(new Request('https://post.example/api/wishes'),{})).status,405);
  assert.equal((await handleApi(request(valid(),'https://foreign.example'),{})).status,403);
});
test('validation, missing DB, oversized requests and no false success', async () => {
  for (const change of [{gift:'  '},{gift:'x'.repeat(501)},{nickname:'x'.repeat(31)},{consent:false},{id:'bad'},{website:'bot'}]) assert.equal((await handleApi(request({...valid(),...change}),{})).status,400);
  assert.equal((await handleApi(request(valid()),{})).status,503);
  assert.equal((await handleApi(request({...valid(),gift:'x'.repeat(9000)}),{})).status,413);
});
test('daily capacity is enforced by database', async () => {
  const db=new DatabaseSync(':memory:');db.exec(schema);
  db.exec("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2000) INSERT INTO wishes (id,nickname,gift) SELECT cast(x AS TEXT),'','test' FROM n;");
  assert.equal((await handleApi(request(valid()),envFor(db))).status,429);db.close();
});
test('client requires valid confirmed receipt, handles errors and missing configuration', async () => {
  const body=valid();const config={storage:'api',apiBase:'https://post.example'};
  await assert.rejects(submitWish({},body),/没有接通/);
  await assert.rejects(submitWish(config,body,async()=>new Response('{}')),/有效回执/);
  await assert.rejects(submitWish(config,body,async()=>new Response('{}',{status:503})),/无法确认/);
  await assert.rejects(submitWish(config,body,async()=>{throw new TypeError('network')}),/网络/);
  assert.equal((await submitWish(config,body,async()=>Response.json({ok:true,id:body.id}))).id,body.id);
});

test('a shared public address can deliver many wishes to the original and personal stockings', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(schema);
  const env = envFor(db);
  const headers = { 'Content-Type': 'application/json', Origin: 'https://leongsaifei.github.io', 'CF-Connecting-IP': '203.0.113.7' };
  const post = (route, body) => handleApi(new Request('https://post.example/api/' + route, {
    method: 'POST', headers, body: JSON.stringify(body)
  }), env);
  const box = { id: crypto.randomUUID(), key: 'a'.repeat(64), name: '圣诞活动' };
  assert.equal((await post('stockings/create', box)).status, 201);
  db.exec("INSERT INTO submit_counts VALUES ('2000-01-01', 'old-digest', 5)");
  const deliveries = Array.from({ length: 60 }, (_, i) => {
    const body = { ...valid(), nickname: '参与者' + i };
    if (i % 2) body.stockingId = box.id;
    return { route: body.stockingId ? 'stockings/wish' : 'wishes', body };
  });
  const responses = await Promise.all(deliveries.map(({ route, body }) => post(route, body)));
  assert.ok(responses.every(response => response.status === 201));
  const { route, body } = deliveries[59];
  assert.equal((await post(route, body)).status, 200);
  assert.equal(db.prepare('SELECT count(*) AS n FROM wishes').get().n, 60);
  assert.equal(db.prepare('SELECT count(*) AS n FROM wishes WHERE stocking_id = ?').get(box.id).n, 30);
  assert.equal(db.prepare('SELECT count(*) AS n FROM submit_counts').get().n, 0);
});
test('receipt id falls back to getRandomValues outside secure contexts', () => {
  const id=newReceiptId({getRandomValues:(a)=>crypto.getRandomValues(a)});
  assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('a forwarded invitation keeps its recipient; a new stocking collects separately', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const migrations = schema.split('CREATE TABLE stockings');
  db.exec(migrations[0]);
  db.prepare('INSERT INTO wishes (id, nickname, gift) VALUES (?, ?, ?)').run(crypto.randomUUID(), '', '旧邮局的信');
  db.exec('CREATE TABLE stockings' + migrations[1]);
  const env = envFor(db);
  const base = 'https://post.example';
  const owner = key => ({ id: crypto.randomUUID(), name: '同名朋友', key: key.repeat(64) });
  const a = owner('a'), b = owner('b');
  const post = (action, data) => handleApi(new Request(base + '/api/stockings/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  }), env);
  const read = async (action, data) => (await post(action, data)).json();
  for (const box of [a, b]) assert.equal((await post('create', box)).status, 201);
  assert.equal((await post('create', a)).status, 200);
  assert.deepEqual(await read('info', { id: a.id }), { id: a.id, name: a.name });
  const link = inviteAddress(base + '/christmas/?sock=' + b.id + '#extra', a.id);
  assert.equal(link, base + '/christmas/?sock=' + a.id);
  assert.equal(inviteAddress(link, a.id), link);
  const first = { ...valid(), stockingId: a.id };
  const fetcher = (url, init) => handleApi(new Request(url, init), env);
  await submitWish({ storage: 'api', apiBase: base }, first, fetcher);
  assert.equal((await post('wish', first)).status, 200);
  assert.equal((await post('wish', { ...first, stockingId: b.id })).status, 409);
  assert.equal((await post('wish', { ...valid(), stockingId: crypto.randomUUID() })).status, 404);
  assert.equal((await post('wish', valid())).status, 400);
  assert.equal((await post('inbox', { id: a.id })).status, 403);
  assert.equal((await post('inbox', { id: a.id, key: b.key })).status, 403);
  assert.deepEqual((await read('inbox', b)).items, []);
  const letterB = { ...valid(), stockingId: b.id, nickname: '小鹿', gift: '雪花球' };
  assert.equal((await post('wish', letterB)).status, 201);
  const mailA = (await read('inbox', a)).items;
  assert.deepEqual(mailA.map(row => row.gift), [first.gift]);
  assert.deepEqual((await read('inbox', b)).items.map(row => row.nickname), ['小鹿']);
  assert.equal(db.prepare('SELECT gift FROM wishes WHERE stocking_id IS NULL').get().gift, '旧邮局的信');
  for (let i = 0; i < 25; i++) await post('wish', { ...valid(), stockingId: a.id, gift: String(i) });
  const latest = await read('inbox', a);
  assert.equal(latest.items.length, 25);
  assert.equal(latest.items[0].gift, '24');
  const older = await read('inbox', { ...a, before: latest.next });
  assert.deepEqual(older.items, mailA);
  assert.equal(older.next, null);
});
test('client: hijacked non-JSON 200 and code bugs are not misreported', async () => {
  const body=valid();const config={storage:'api',apiBase:'https://post.example'};
  await assert.rejects(submitWish(config,body,async()=>new Response('<html>portal</html>')),/有效回执/);
  await assert.rejects(submitWish(config,body,async()=>Response.json({ok:true,id:body.id},{status:429})),/邮袋/);
});
