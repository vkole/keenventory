import 'next/dist/server/node-environment-baseline.js';
import {chromium} from '@playwright/test';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
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
const cameraPath=path.join(folder,'camera.y4m');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-video-capture='+cameraPath]});
try {
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies(cookie.split('; ').map(v=>{const i=v.indexOf('=');return {name:v.slice(0,i),value:v.slice(i+1),url:base};}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/materials');await page.getByRole('button',{name:'Create Material',exact:true}).click();
await page.getByLabel('Material Name',{exact:true}).fill('Browser Oil');await page.getByLabel('SKU',{exact:true}).fill('BROWSER-OIL');await page.getByLabel('Opening Quantity').fill('32');await page.getByLabel('Low Stock Threshold / Reorder Point').fill('8');await page.getByLabel('Direct Product URL (HTTPS)').fill('https://example.com/oil');await page.getByRole('button',{name:'Add Code',exact:true}).click();await page.getByLabel('Code Value',{exact:true}).fill('5901234123457');await page.getByLabel('Code Format',{exact:true}).selectOption('EAN_13');const cost=page.getByLabel('Cost per Tracking Unit',{exact:true});
await cost.fill('');await cost.pressSequentially('0.');assert.equal(await cost.inputValue(),'0.');await cost.pressSequentially('0045');assert.equal(await cost.inputValue(),'0.0045');await cost.fill('.');assert.equal(await cost.inputValue(),'.');await cost.fill('125.50');assert.equal(await cost.inputValue(),'125.50');await cost.fill('0.1875');
await page.getByRole('button',{name:'Save Material',exact:true}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();
await page.getByRole('button',{name:'Edit Material',exact:true}).click();assert.equal(await page.getByLabel('Cost per Tracking Unit',{exact:true}).inputValue(),'0.1875');
await page.getByRole('button',{name:'Generate QR Code',exact:true}).click();await page.getByAltText('Inventory QR code preview').waitFor();
const qrValue=await page.getByLabel('Code Value',{exact:true}).nth(1).inputValue();assert.match(qrValue,/^KEENVENTORY:/);
const qrUrl=await page.getByRole('link',{name:'Download QR Image',exact:true}).getAttribute('href');const qrResponse=await context.request.get(base+qrUrl);assert.ok(qrResponse.ok());const qrPng=await qrResponse.body();
const gray=await sharp(qrPng).resize(400,400).flatten({background:'white'}).extend({left:120,right:120,top:40,bottom:40,background:'white'}).greyscale().raw().toBuffer();
const frame=Buffer.concat([Buffer.from('FRAME\n'),gray,Buffer.alloc(640*480/2,128)]);writeFileSync(cameraPath,Buffer.concat([Buffer.from('YUV4MPEG2 W640 H480 F10:1 Ip A1:1 C420jpeg\n'),...Array(30).fill(frame)]));
await page.getByRole('button',{name:'Save Material',exact:true}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();
await page.goto(base+'/barcode');await page.getByLabel('Enter Code Manually').fill('5901234123457');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Reorder Material'}).getAttribute('href'),'https://example.com/oil');
await page.getByRole('button',{name:'Scan Another Item'}).click();
// A known EAN-13 fixture exercises actual uploaded-image decoding, not a mocked decoder.
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const parity='LGGLLG',digits='5901234123457';let bits='101';for(let i=1;i<=6;i++)bits+=(parity[i-1]==='L'?L:G)[Number(digits[i])];bits+='01010';for(let i=7;i<13;i++)bits+=L[Number(digits[i])].replace(/[01]/g,c=>c==='0'?'1':'0');bits+='101';
const bars=[...bits].map((b,i)=>b==='1'?`<rect x="${(i+14)*3}" y="10" width="3" height="130"/>`:'').join('');const png=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="369" height="160"><rect width="100%" height="100%" fill="white"/><g fill="black">${bars}</g></svg>`)).png().toBuffer();
await page.locator('input[type=file]').setInputFiles({name:'barcode.png',mimeType:'image/png',buffer:png});await page.getByLabel('Confirm or correct code').waitFor();assert.equal(await page.getByLabel('Confirm or correct code').inputValue(),digits);await page.getByRole('button',{name:'Use This Code'}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();
// Decode the generated QR through the same file-upload path used on phones.
await page.getByRole('button',{name:'Scan Another Item'}).click();await page.locator('input[type=file]').setInputFiles({name:'inventory-qr.png',mimeType:'image/png',buffer:qrPng});await page.getByLabel('Confirm or correct code').waitFor();assert.equal(await page.getByLabel('Confirm or correct code').inputValue(),qrValue);await page.getByRole('button',{name:'Use This Code'}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();
// Feed an actual QR video into Chromium's synthetic camera to exercise live decoding.
await page.getByRole('button',{name:'Scan Another Item'}).click();await page.getByRole('button',{name:'Start Scanner'}).click();await page.getByLabel('Confirm or correct code').waitFor({timeout:20000});assert.equal(await page.getByLabel('Confirm or correct code').inputValue(),qrValue);await page.getByRole('button',{name:'Use This Code'}).click();await page.getByRole('heading',{name:'Browser Oil',exact:true}).waitFor();
await page.setViewportSize({width:390,height:844});assert.ok(await page.getByRole('button',{name:'Scan Another Item'}).isVisible());
await page.getByRole('button',{name:'Scan Another Item'}).click();await page.getByLabel('Enter Code Manually').fill('https://untrusted.example/never-open');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByText('No inventory item was found for this code.',{exact:true}).waitFor();assert.ok(await page.getByRole('link',{name:'Create New Material'}).isVisible());assert.equal(new URL(page.url()).pathname,'/barcode');assert.deepEqual(errors,[]);
console.log('PASS: material creation, barcode lookup, decimal typing and persistence, EAN-13 decoding, QR generation and image/live camera decoding, safe unknown URL, mobile layout.');
await context.close();
} catch(error){console.error(error);process.exitCode=1;} finally {await browser.close();await new Promise(r=>server.close(r));await app.close();db.close();try{if(!folder.startsWith(path.join(tmpdir(),'keen-barcode-ui-')))throw Error('Unexpected test directory');rmSync(folder,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{console.warn('Temporary browser fixture remains locked until Node exits:',folder);}}

process.exit(process.exitCode||0);
