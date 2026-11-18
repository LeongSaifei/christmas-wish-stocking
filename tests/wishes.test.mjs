import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleApi } from '../worker/api.js';
import { submitWish } from '../public/storage.js';
const valid = () => ({ id: crypto.randomUUID(), nickname: '', gift: '一本喜欢的书', consent: true, website: '' });
function envFor(db) { return { DB: { prepare: sql => ({ bind: (...args) => ({ first: async () => db.prepare(sql.replace(/\?[123]/g,'?')).get(...args) ?? null }) }) } }; }
function request(body, origin='https://leongsaifei.github.io') { return new Request('https://post.example/api/wishes', { method:'POST', headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body) }); }
const schema = readFileSync(new URL('../drizzle/0000_wishes.sql', import.meta.url),'utf8');
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
