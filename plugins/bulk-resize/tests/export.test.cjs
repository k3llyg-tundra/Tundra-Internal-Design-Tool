const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
function backend(selected){
 const messages=[];
 const figma={showUI(){},on(){},currentPage:{selection:selected},ui:{postMessage:m=>messages.push(m)},commitUndo(){},notify(){}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'dist/code.js'),'utf8'),{figma,__html__:'',Error});
 return {figma,messages};
}
function frame(id,name,parent,width=4096,height=4096){return {id,type:'FRAME',name,parent,width,height,async exportAsync(options){assert.equal(options.format,'PNG');assert.equal(options.constraint.value,1);return new Uint8Array([1,2,3])},resize(w,h){this.width=w;this.height=h},resizeWithoutConstraints(w,h){this.resize(w,h)},rescale(f){this.width*=f;this.height*=f}}}
function ui(){
 const mockElement=()=>({dataset:{},children:[],value:'',addEventListener(){},setAttribute(){},replaceChildren(){this.children=[]},appendChild(child){this.children.push(child)}});
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,mockElement());return elements.get(id)};
 const context={document:{getElementById:element,querySelectorAll:()=>[],createElement:mockElement},window:{addEventListener(){}},parent:{postMessage(){}},Uint8Array,Uint32Array,DataView,TextEncoder,TextDecoder,Blob,Set,URL,performance,setTimeout,setInterval(){}};
 vm.createContext(context);
 const html=fs.readFileSync(path.join(root,'dist/ui.html'),'utf8');
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
 return {context,elements};
}
test('sections export individual library images once with archived names and actual sizes',async()=>{
 const library={id:'library',type:'SECTION',name:'Always On Image Library',parent:null,children:[]};
 const group={id:'image',type:'SECTION',name:'Image 1',parent:library,children:[]};
 const a=frame('a','Image 1_2048x2048',group),b=frame('b','Landscape',group,3840,2160);
 group.children=[a,b];library.children=[group];
 const {figma,messages}=backend([library,group,a]);await figma.ui.onmessage({type:'ready'});
 assert.equal(messages.findLast(m=>m.type==='selection').exportCount,2);
 await figma.ui.onmessage({type:'export'});
 const files=messages.filter(m=>m.type==='export-file');assert.equal(files.length,2);
 assert.equal(files[0].path,'Always On Image Library/Image 1/[NIKRA1027] HO26 NVS Always On Image Library_Image 1_4096x4096.png');
 assert.equal(files[1].path,'Always On Image Library/Image 1/[NIKRA1027] HO26 NVS Always On Image Library_Image 1_3840x2160.png');
 assert.equal(typeof files[0].renderMs,'number');
 assert.equal(messages.find(m=>m.type==='export-done').count,2);
});
test('outside-library and unnumbered frames are excluded; failed images do not prevent later exports',async()=>{
 const section={type:'SECTION',name:'Always On Image Library',parent:null,children:[]};
 const a=frame('a','Image 2',section),b=frame('b','Image 3',section);
 a.exportAsync=async()=>{throw Error('renderer failure')};
 section.children=[a,b,frame('c','Untitled',section)];
 const {figma,messages}=backend([section,frame('d','Image 9',null)]);
 await figma.ui.onmessage({type:'export',prefix:'Project/Test'});
 assert.equal(messages.filter(m=>m.type==='export-file').length,1);
 assert.match(messages.find(m=>m.type==='export-file').path,/Project_Test_Image 3_4096x4096.png$/);
 assert.match(messages.find(m=>m.type==='export-done').text,/renderer failure/);
 await figma.ui.onmessage({type:'ready'});assert.equal(messages.findLast(m=>m.type==='selection').exportCount,2);
});
test('rename still replaces size suffix after resize',async()=>{
 const a=frame('a','Image 1_2048x2048',null,2048,2048);const {figma}=backend([a]);
 await figma.ui.onmessage({type:'resize',width:4096,height:4096,scale:true});assert.equal(a.name,'Image 1_4096x4096');
});
test('library download preserves folders, deduplicates filenames, and preserves file bytes',async()=>{
 const {context,elements}=ui();
 vm.runInContext(`files=[{name:'Always On Image Library/Image 1/Example.png',bytes:new Uint8Array([1,2,3])},{name:'Always On Image Library/Image 1/Example.png',bytes:new Uint8Array([4,5])}];download=(blob,name)=>{globalThis.saved={blob,name}};exportStarted=performance.now();renderMs=1200`,context);
 await vm.runInContext("finishExport({count:2,text:'Exported 2.'})",context);
 assert.equal(context.saved.name,'Always On Image Library.zip');
 const archive=new Uint8Array(await context.saved.blob.arrayBuffer());
 const entries=context.fflate.unzipSync(archive);
 assert.deepEqual(Object.keys(entries),['Always On Image Library/Image 1/Example.png','Always On Image Library/Image 1/Example (2).png']);
 assert.deepEqual([...entries[Object.keys(entries)[0]]],[1,2,3]);
 assert.deepEqual([...entries[Object.keys(entries)[1]]],[4,5]);
 assert.match(elements.get('status').textContent,/Render: 1.2s/);
});
test('large archive benchmark and integrity',async()=>{
 const {context}=ui();context.entries=Array.from({length:4},(_,i)=>({name:`Always On Image Library/Image ${i}/Image ${i}.png`,bytes:new Uint8Array(16*1024*1024).fill(153+i)}));
 const started=performance.now();const blob=vm.runInContext('zip(entries)',context);const elapsed=performance.now()-started;
 console.log(`64 MiB ZIP: ${elapsed.toFixed(1)} ms`);
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const entries=context.fflate.unzipSync(bytes);
 for(const original of context.entries)assert.deepEqual(entries[original.name],original.bytes);
 // A generous guard catches reintroduction of the measured 2.67-second ZIP stall.
 assert.ok(elapsed<1500,`ZIP packaging took ${elapsed.toFixed(0)} ms`);
});
