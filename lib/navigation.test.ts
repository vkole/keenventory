import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionRoots,sectionForLocation} from './navigation';
test('section roots remove detail parameters and subpages retain parent highlighting',()=>{
 for(const path of ['/materials','/materials/new','/materials/7','/materials/7/edit','/materials/categories'])assert.equal(sectionForLocation(path,'id=7&edit=1'),'materials');
 for(const path of ['/recipes','/recipes/new','/recipes/7','/recipes/7/edit'])assert.equal(sectionForLocation(path,''),'recipes');
 assert.equal(sectionForLocation('/','module=products&record=12'),'products');assert.equal(sectionForLocation('/','module=orders&record=5'),'orders');assert.equal(sectionForLocation('/settings/users/new',''),'settings');assert.equal(sectionForLocation('/','module=reporting'),'reports');assert.equal(sectionForLocation('/suppliers',''),'suppliers');
 for(const key of ['dashboard','products','materials','components','recipes','manufacturing','orders','purchases','customers','suppliers','barcode','content','reports','settings']){const url=new URL(sectionRoots[key],'http://localhost');assert.equal(url.searchParams.has('record'),false);assert.equal(url.searchParams.has('edit'),false);assert.equal(url.searchParams.has('id'),false);}
 assert.equal(sectionRoots.materials,'/materials');assert.equal(sectionRoots.recipes,'/recipes');
});
