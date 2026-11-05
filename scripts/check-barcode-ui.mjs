import 'next/dist/server/node-environment-baseline.js';
import {chromium} from '@playwright/test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import next from 'next';
const folder=mkdtempSync(path.join(tmpdir(),'keen-barcode-ui-'));
const base='http://localhost:3103';
Object.assign(process.env,{KEENVENTORY_DATA_DIR:folder,KEENVENTORY_MEDIA_STORAGE:'disk',BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(48).toString('hex'),KEENVENTORY_CHECK_BREACHED_PASSWORDS:'false'});
const {db}=await import('../lib/db.ts');
const {activate,tokenHash}=await import('../lib/accounts.ts');
const {authentication}=await import('../lib/auth.ts');
const token=randomBytes(32).toString('base64url'),password=randomBytes(24).toString('hex');
db.prepare('INSERT INTO owner_claims(id,email,name,token_hash,expires_at) VALUES(1,?,?,?,?)').run('barcode@example.test','Barcode Tester',tokenHash(token),Date.now()+60000);
await activate({token,password},true);
const auth=await authentication();
const response=await auth.api.signInEmail({body:{email:'barcode@example.test',password},asResponse:true});
assert.ok(response.ok);
const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const app=next({dev:true,hostname:'localhost',port:3103,conf:{distDir:'.next-barcode-test',devIndicators:false}});await app.prepare();
const server=createServer(app.getRequestHandler());await new Promise(r=>server.listen(3103,r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies(cookie.split('; ').map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:base};}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/materials');await page.getByRole('button',{name:'Create Material',exact:true}).click();
await page.getByLabel('Material Name',{exact:true}).fill('Browser Oil');await page.getByLabel('SKU',{exact:true}).fill('BROWSER-OIL');await page.getByLabel('Opening Quantity').fill('32');await page.getByLabel('Low Stock Threshold / Reorder Point').fill('8');await page.getByLabel('Direct Product URL (HTTPS)').fill('https://example.com/oil');await page.getByRole('button',{name:'Add Barcode',exact:true}).click();await page.getByLabel('Barcode Number',{exact:true}).fill('5901234123457');await page.getByLabel('Barcode Type',{exact:true}).selectOption('EAN_13');await page.getByRole('button',{name:'Save Material',exact:true}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();
await page.goto(base+'/barcode');await page.getByLabel('Enter Barcode Manually').fill('5901234123457');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Reorder Material'}).getAttribute('href'),'https://example.com/oil');
await page.getByRole('button',{name:'Scan Another Item'}).click();
// A known EAN-13 fixture exercises actual uploaded-image decoding, not a mocked decoder.
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const parity='LGGLLG',digits='5901234123457';let bits='101';for(let i=1;i<=6;i++)bits+=(parity[i-1]==='L'?L:G)[Number(digits[i])];bits+='01010';for(let i=7;i<13;i++)bits+=L[Number(digits[i])].replace(/[01]/g,c=>c==='0'?'1':'0');bits+='101';
const bars=[...bits].map((b,i)=>b==='1'?`<rect x="${(i+14)*3}" y="10" width="3" height="130"/>`:'').join('');const png=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="369" height="160"><rect width="100%" height="100%" fill="white"/><g fill="black">${bars}</g></svg>`)).png().toBuffer();
await page.locator('input[type=file]').setInputFiles({name:'barcode.png',mimeType:'image/png',buffer:png});await page.getByLabel('Confirm or correct barcode').waitFor();assert.equal(await page.getByLabel('Confirm or correct barcode').inputValue(),digits);await page.getByRole('button',{name:'Use This Barcode'}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();
await page.setViewportSize({width:390,height:844});assert.ok(await page.getByRole('button',{name:'Scan Another Item'}).isVisible());
await page.getByRole('button',{name:'Scan Another Item'}).click();await page.getByLabel('Enter Barcode Manually').fill('UNKNOWN-000');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByText('No inventory item was found for this barcode.',{exact:true}).waitFor();assert.ok(await page.getByRole('link',{name:'Create New Material'}).isVisible());assert.deepEqual(errors,[]);
console.log('PASS: material creation, barcode lookup, real EAN-13 image decoding, supplier link, mobile layout, unknown barcode.');
await context.close();
} catch(error){console.error(error);process.exitCode=1;} finally {await browser.close();await new Promise(r=>server.close(r));await app.close();db.close();try{if(!folder.startsWith(path.join(tmpdir(),'keen-barcode-ui-')))throw Error('Unexpected test directory');rmSync(folder,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{console.warn('Temporary browser fixture remains locked until Node exits:',folder);}}

process.exit(process.exitCode||0);
