const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');let id=0;const nodes={};
function n(type,name,children=[],characters=''){const item={id:String(++id),type,name,children,characters,y:id*10,visible:true,locked:false};nodes[item.id]=item;children.forEach(c=>c.parent=item);return item;}
const p1=n('INSTANCE','Text Block',[n('TEXT','Eyebrow',[],'Women’s Training'),n('TEXT','Display Title',[],'Strong Suits You'),n('TEXT','Body',[],'Find your next training favourite.'),n('TEXT','Button Text',[],'Shop')]);p1.locked=true;
const p2=n('INSTANCE','Text Block',[n('TEXT','Body',[],'Move with confidence.'),n('TEXT','Button Text',[],'Shop Training')]);
const hidden=n('INSTANCE','Text Block',[n('TEXT','Body',[],'HIDDEN COPY')]);hidden.visible=false;
const comp=n('FRAME','[COMP] Light Mode',[n('FRAME','Specs',[n('TEXT','Body',[],'SPEC COPY')]),n('FRAME','Email Template',[n('FRAME','[P1] DT Hero'),p1,n('FRAME','[P2] Supporting 1'),p2,hidden,n('INSTANCE','[P6] Shopping With Us is Easy',[n('TEXT','Label',[],'Shopping With Us is Easy'),n('TEXT','Description',[],'Delivery made easy.')])])]);
const messages=[];const figma={showUI(){},root:{children:[]},ui:{postMessage(m){messages.push(m)}},getNodeById(id){return nodes[id]},async getNodeByIdAsync(id){return nodes[id]}};
const context={figma,__html__:'',console,Uint8Array};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/code.js','utf8'),context);
(async()=>{await figma.ui.onmessage({type:'EXTRACT_COPY_SOURCE',fileSetup:'retention-offense',fallbackFrameIds:[comp.id],frameChannels:{[comp.id]:'Nike Email'}});
const layers=messages.find(m=>m.type==='COPY_RESULT').copyData.flatMap(f=>f.layers);
for(const [panel,field,text] of [['P1','Eyebrow','Women’s Training'],['P1','Headline','Strong Suits You'],['P1','Body copy','Find your next training favourite.'],['P1','CTA','Shop'],['P2','Body copy','Move with confidence.'],['P2','CTA','Shop Training']])assert.ok(layers.some(l=>l.panel===panel&&l.layer===field&&l.text===text),`${panel} ${field} missing`);
assert.ok(layers.some(l=>l.text==='Shopping With Us is Easy'),'Shopping heading preserved');
assert.ok(layers.some(l=>l.text==='Delivery made easy.'),'Shopping body preserved');
assert.ok(!layers.some(l=>/HIDDEN COPY|SPEC COPY/.test(l.text||'')));console.log('Retention visible copy: PASS');})().catch(e=>{console.error(e);process.exitCode=1});
