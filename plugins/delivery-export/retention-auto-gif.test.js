const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
let seq=0;const nodes={};
function node(type,name,children=[]){const n={id:String(++seq),type,name,children,visible:true,locked:false,width:375,height:500,fills:[],async exportAsync(){return new Uint8Array([137,80,78,71]);}};nodes[n.id]=n;children.forEach(c=>c.parent=n);return n;}
const gif=new Uint8Array([71,73,70,56,57,97,1,0]);
const artwork=node('RECTANGLE','Animation');artwork.fills=[{type:'IMAGE',imageHash:'animation'}];
const supporting=node('FRAME','[P2] Supporting 1',[artwork]);
const staticSlice=node('FRAME','[P7] Swoosh Footer');
const campaign=node('PAGE','Week 7 Training Best Sellers, Female');
const design=node('PAGE','🎨 Design Space',[node('SECTION',campaign.name,[node('SECTION','Nike Email',[supporting,staticSlice])])]);
const root=node('DOCUMENT','Retention Offense',[campaign,design]);root.findChild=fn=>root.children.find(fn);
const messages=[];
const context={__html__:'',console,Uint8Array,figma:{showUI(){},root,currentPage:campaign,ui:{postMessage(message){messages.push(message)}},async setCurrentPageAsync(page){this.currentPage=page},async getNodeByIdAsync(id){return nodes[id]},getImageByHash(){return {async getBytesAsync(){return gif}}}}};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/code.js','utf8'),context);
(async()=>{
await context.figma.ui.onmessage({type:'SCAN_FRAMES',pageId:campaign.id,role:'slices',fileSetup:'retention-offense'});
const frames=messages.find(m=>m.type==='FRAMES_RESULT').frames;
const f=frames.find(f=>f.id===supporting.id);assert.ok(f,'Supporting slice discovered');
assert.equal(f.isGif,true,'Scan preview must identify the actual GIF fill');
assert.equal(f.forcePng,false,'GIF must not be labelled PNG');
const result=await context.safeExportFrame({frameId:f.id,filename:'Supporting 1',format:'PNG',scale:2,isGif:f.isGif,detectGif:f.detectGif,isComp:f.isComp,fileSetup:f.fileSetup});
assert.equal(result.filename,'Supporting 1.gif','Untagged uploaded animation must export GIF rather than PNG');
assert.deepEqual(Array.from(result.bytes),Array.from(gif),'Original animation bytes preserved');
const still=frames.find(f=>f.id===staticSlice.id);
const staticResult=await context.safeExportFrame({frameId:still.id,filename:'Footer',format:'PNG',scale:2,isGif:still.isGif,detectGif:still.detectGif,isComp:false,fileSetup:still.fileSetup});
assert.equal(staticResult.filename,'Footer.png');console.log('Retention auto GIF: PASS; static PNG unchanged');
})().catch(e=>{console.error(e);process.exitCode=1});
