import {graphColumns} from './graph-layout.mjs';
// Deterministic topology layout and orthogonal routing. Shared by browser and agent.
const clone = x => JSON.parse(JSON.stringify(x));
const rect = (c,pad=0) => ({x:c.x-pad,y:c.y-pad,r:c.x+c.w+pad,b:c.y+c.h+pad});
const overlaps = (a,b) => a.x<b.r && a.r>b.x && a.y<b.b && a.b>b.y;
export function segmentBlocked(a,b,boxes) {
  return boxes.some(o => a.x===b.x ? a.x>o.x && a.x<o.r && Math.max(a.y,b.y)>o.y && Math.min(a.y,b.y)<o.b : a.y>o.y && a.y<o.b && Math.max(a.x,b.x)>o.x && Math.min(a.x,b.x)<o.r);
}
const vector={right:[1,0],bottom:[0,1],left:[-1,0],top:[0,-1]};
const direction={right:1,bottom:2,left:3,top:4};
const opposite=d=>((d+1)%4)+1;
const round=n=>Math.round(n*1000)/1000;
// SVG viewbox coordinates match app.js; ports terminate at visible equipment,
// not at the surrounding selection rectangle or its label.
export function portAnchor(c,side) {
  const custom=c.ports?.[side];
  if(custom&&Number.isFinite(custom.x)&&Number.isFinite(custom.y)&&custom.x>=0&&custom.x<=1&&custom.y>=0&&custom.y<=1)return {x:round(c.x+c.w*custom.x),y:round(c.y+c.h*custom.y)};
  const defs={
    tank:{view:[160,200],left:[27,100],right:[133,100],top:[80,9],bottom:[80,171]},
    pump:{view:[112,94],left:[8,53],right:[104,53],top:[55,25],bottom:[55,81]},
    valve:{view:[112,94],left:[13,55],right:[98,55],top:[55,20],bottom:[55,75]},
    motor:{view:[112,94],left:[10,53],right:[102,53],top:[55,15],bottom:[55,86]},
  };
  const def=defs[c.kind];if(def){const h=Math.max(1,c.h-29),scale=Math.min(c.w/def.view[0],h/def.view[1]),offX=(c.w-def.view[0]*scale)/2,offY=(h-def.view[1]*scale)/2;
    return {x:round(c.x+offX+def[side][0]*scale),y:round(c.y+offY+def[side][1]*scale)};
  }
  return {x:round(c.x+(side==='left'?0:side==='right'?c.w:c.w/2)),y:round(c.y+(side==='top'?0:side==='bottom'?c.h:c.h/2))};
}
function escapePort(c,side,anchor){const gap=20;return {x:side==='left'?c.x-gap:side==='right'?c.x+c.w+gap:anchor.x,y:side==='top'?c.y-gap:side==='bottom'?c.y+c.h+gap:anchor.y}}
function simplify(points){const out=[];for(const p of points){if(out.length&&out.at(-1).x===p.x&&out.at(-1).y===p.y)continue;while(out.length>1){const a=out.at(-2),b=out.at(-1);if((a.x===b.x&&b.x===p.x&&(b.y-a.y)*(p.y-b.y)>=0)||(a.y===b.y&&b.y===p.y&&(b.x-a.x)*(p.x-b.x)>=0))out.pop();else break}out.push(p)}return out}
function dot(a,b,side){const [dx,dy]=vector[side];return (b.x-a.x)*dx+(b.y-a.y)*dy}
const facing=(a,b,side)=>dot(a,b,side)>0;
function preferredRoute(start,end,boxes,aSide,bSide){
  const horizontal=s=>s==='left'||s==='right',candidates=[];
  if(start.x===end.x||start.y===end.y)candidates.push([start,end]);
  if(horizontal(aSide)&&horizontal(bSide)){const x=round((start.x+end.x)/2);candidates.push([start,{x,y:start.y},{x,y:end.y},end])}
  else if(!horizontal(aSide)&&!horizontal(bSide)){const y=round((start.y+end.y)/2);candidates.push([start,{x:start.x,y},{x:end.x,y},end])}
  else candidates.push(horizontal(aSide)?[start,{x:end.x,y:start.y},end]:[start,{x:start.x,y:end.y},end]);
  for(const raw of candidates){const pts=simplify(raw);if(pts.length<2)continue;
    if(dot(pts[0],pts[1],aSide)<0||dot(pts.at(-1),pts.at(-2),bSide)<0)continue;
    if(pts.slice(1).every((p,i)=>!segmentBlocked(pts[i],p,boxes)))return pts;
  }
  return null;
}
class Heap {
  a=[];
  push(v){let i=this.a.length;this.a.push(v);while(i){let p=(i-1)>>1;if(this.a[p].f<=v.f)break;this.a[i]=this.a[p];i=p}this.a[i]=v}
  pop(){const first=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let n=i*2+1;if(n+1<this.a.length&&this.a[n+1].f<this.a[n].f)n++;if(this.a[n].f>=last.f)break;this.a[i]=this.a[n];i=n}this.a[i]=last}return first}
}
function route(start,end,boxes,width,height,aSide,bSide) {
  const preferred=preferredRoute(start,end,boxes,aSide,bSide);if(preferred)return preferred;
  const xs=[...new Set([start.x,end.x,8,width-8,...boxes.flatMap(o=>[o.x,o.r])])].filter(x=>x>=0&&x<=width).sort((a,b)=>a-b);
  const ys=[...new Set([start.y,end.y,8,height-8,...boxes.flatMap(o=>[o.y,o.b])])].filter(y=>y>=0&&y<=height).sort((a,b)=>a-b);
  const key=(x,y,d)=>`${x},${y},${d}`,q=new Heap(),dist=new Map(),parents=new Map();
  const sx=xs.indexOf(start.x),sy=ys.indexOf(start.y),ex=xs.indexOf(end.x),ey=ys.indexOf(end.y);
  if([sx,sy,ex,ey].some(i=>i<0))throw Error('端口超出画面，请增加设备边距');
  const initial={x:sx,y:sy,d:direction[aSide],g:0,f:0,k:key(sx,sy,direction[aSide])};q.push(initial);dist.set(initial.k,0);
  let found,visits=0;
  while(q.a.length){const n=q.pop();if(n.g!==dist.get(n.k))continue;if(++visits>180000)throw Error('布线搜索超出预算，请拆分画面或增加间距');if(n.x===ex&&n.y===ey&&n.d!==direction[bSide]){found=n;break}
    for(const [dx,dy,d] of [[1,0,1],[-1,0,3],[0,1,2],[0,-1,4]]){if(d===opposite(n.d))continue;const x=n.x+dx,y=n.y+dy;if(x<0||y<0||x>=xs.length||y>=ys.length)continue;const a={x:xs[n.x],y:ys[n.y]},b={x:xs[x],y:ys[y]};if(segmentBlocked(a,b,boxes))continue;
      const g=n.g+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+(n.d&&d!==n.d?80:0),k=key(x,y,d);if(g>=(dist.get(k)??Infinity))continue;
      dist.set(k,g);parents.set(k,n);q.push({x,y,d,g,k,f:g+Math.abs(b.x-end.x)+Math.abs(b.y-end.y)});
    }
  }
  if(!found)throw Error('没有可用的正交通道，请移动遮挡设备或增加画面空间');
  const points=[];for(let n=found;n;n=parents.get(n.k))points.unshift({x:xs[n.x],y:ys[n.y]});return points;
}
export function labelBounds(c){return ['tank','pump','motor','valve'].includes(c.kind)&&c.label?{x:c.x-2,y:c.y+c.h-23,r:c.x+c.w+2,b:c.y+c.h+2}:null}
export function connectionCrossings(edges){
 const diagnostics=[];
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const a=edges[i],b=edges[j];if(a.routeStatus!=='ok'||b.routeStatus!=='ok')continue;let overlap=false,cross=null;
  for(let x=1;x<a.points.length;x++)for(let y=1;y<b.points.length;y++){
   const p=a.points[x-1],q=a.points[x],r=b.points[y-1],s=b.points[y],ah=p.y===q.y,bh=r.y===s.y;
   if(ah===bh){if(ah?p.y===r.y&&Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x))<Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x)):p.x===r.x&&Math.max(Math.min(p.y,q.y),Math.min(r.y,s.y))<Math.min(Math.max(p.y,q.y),Math.max(r.y,s.y)))overlap=true;}
   else{const h=ah?[p,q]:[r,s],v=ah?[r,s]:[p,q];if(v[0].x>Math.min(h[0].x,h[1].x)&&v[0].x<Math.max(h[0].x,h[1].x)&&h[0].y>Math.min(v[0].y,v[1].y)&&h[0].y<Math.max(v[0].y,v[1].y))cross={x:v[0].x,y:h[0].y};}
  }
  if(overlap&&((a.from!==b.from&&a.to!==b.to)||(a.from===b.from&&a.to===b.to)))diagnostics.push({code:'route-overlap',connections:[a.id,b.id],message:`管线 ${a.label||a.id} 与 ${b.label||b.id} 共用一段路径，请调整端口或设备位置以明确区分`});
  else if(cross)diagnostics.push({code:'route-crossing',connections:[a.id,b.id],point:cross,message:`管线 ${a.label||a.id} 与 ${b.label||b.id} 交叉但不连通；留白跨线只表示越过`});
 }
 return diagnostics;
}
// Shift interior channels only: fixed equipment ports and first/last directions remain intact.
// Shared source/destination branches may deliberately share a stem, as in crossing diagnostics.
function channelPenalty(a,b){
 if(a.routeStatus!=='ok'||b.routeStatus!=='ok'||((a.from===b.from||a.to===b.to)&&!(a.from===b.from&&a.to===b.to)))return 0;
 let total=0;
 for(let i=1;i<a.points.length;i++)for(let j=1;j<b.points.length;j++){
  const p=a.points[i-1],q=a.points[i],r=b.points[j-1],t=b.points[j],horizontal=p.y===q.y;
  if(horizontal!==(r.y===t.y))continue;
  const distance=Math.abs(horizontal?p.y-r.y:p.x-r.x);if(distance>=12)continue;
  const lo=Math.max(Math.min(horizontal?p.x:p.y,horizontal?q.x:q.y),Math.min(horizontal?r.x:r.y,horizontal?t.x:t.y));
  const hi=Math.min(Math.max(horizontal?p.x:p.y,horizontal?q.x:q.y),Math.max(horizontal?r.x:r.y,horizontal?t.x:t.y));
  total+=Math.max(0,hi-lo+12)*(12-distance);
 }
 return total;
}
function separateChannels(page){
 const edges=[...page.connections].sort((a,b)=>a.id.localeCompare(b.id)),nodes=page.components.filter(c=>c.kind!=='flow');
 const labels=nodes.map(labelBounds).filter(Boolean),changed=new Set();let trials=0;
 const length=pts=>pts.slice(1).reduce((n,p,i)=>n+Math.abs(p.x-pts[i].x)+Math.abs(p.y-pts[i].y),0);
 function valid(e,pts){
  if(pts.some(p=>p.x<0||p.y<0||p.x>page.width||p.y>page.height))return false;
  if(!facing(pts[0],pts[1],e.resolvedPorts.from)||!facing(pts.at(-1),pts.at(-2),e.resolvedPorts.to))return false;
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i];if(a.x!==b.x&&a.y!==b.y)return false;
   if(i>1){const prev=pts[i-2];if((prev.x===a.x&&a.x===b.x)||(prev.y===a.y&&a.y===b.y))return false;}
   const boxes=nodes.filter(n=>!(i===1&&n.id===e.from)&&!(i===pts.length-1&&n.id===e.to)).map(n=>rect(n,12));
   if(segmentBlocked(a,b,[...labels,...boxes]))return false;
  }
  return true;
 }
 for(let pass=0;pass<4&&trials<1024;pass++){
  let progress=false;
  for(const e of edges){
   if(e.routeStatus!=='ok'||e.points.length<4)continue;
   const others=edges.filter(other=>other!==e),before=others.reduce((sum,o)=>sum+channelPenalty(e,o),0);if(before===0)continue;
   let best=null,score=before,cost=Infinity;
   for(let i=1;i<e.points.length-2&&trials<1024;i++)for(const offset of [-16,16,-32,32,-48,48,-64,64,-80,80,-96,96]){
    if(++trials>1024)break;
    const pts=e.points.map(p=>({...p})),key=pts[i].y===pts[i+1].y?'y':'x';pts[i][key]=round(pts[i][key]+offset);pts[i+1][key]=round(pts[i+1][key]+offset);
    const candidate=simplify(pts);if(candidate.length<2||!valid(e,candidate))continue;
    const penalty=others.reduce((sum,o)=>sum+channelPenalty({...e,points:candidate},o),0),candidateCost=(candidate.length-2)*80+length(candidate)+Math.abs(offset)/1000;
    if(penalty<score-0.001||(penalty<before-0.001&&Math.abs(penalty-score)<0.001&&candidateCost<cost)){best=candidate;score=penalty;cost=candidateCost;}
   }
   if(best){e.points=best;e.routeInfo.bends=best.length-2;e.routeInfo.channelAdjusted=true;e.routeInfo.reason='为区分独立管线调整中间通道，端点和流向保持不变';changed.add(e.id);progress=true;}
  }
  if(!progress)break;
 }
 return [...changed].map(connectionId=>({code:'channel-adjusted',connectionId,message:'独立管线的中间通道已调整以减少共线或过近；起止设备与端口不变'}));
}
export function routePage(input) {
 const page=clone(input),nodes=page.components.filter(c=>c.kind!=='flow'),byId=new Map(nodes.map(c=>[c.id,c])),diagnostics=[];
 page.connections=(page.connections||[]).map(edge=>{
  const from=byId.get(edge.from),to=byId.get(edge.to);if(!from||!to)throw Error(`连接 ${edge.id} 引用了不存在的组件`);
  const sides=from.x+from.w<=to.x?['right','left']:to.x+to.w<=from.x?['left','right']:from.y+from.h<=to.y?['bottom','top']:to.y+to.h<=from.y?['top','bottom']:null;
  const returnSide=(edge.routeMode==='return'||edge.layoutRole==='return')&&(Math.min(from.y,to.y)>=40?'top':Math.max(from.y+from.h,to.y+to.h)<=page.height-40?'bottom':null);
  const first=[edge.fromPort||returnSide||sides?.[0]||'right',edge.toPort||returnSide||sides?.[1]||'left'];
  const labels=[labelBounds(from),labelBounds(to)].filter(Boolean),boxes=nodes.map(c=>rect(c,12));
  function attempt(aSide,bSide){
   if(!sides&&overlaps(rect(from),rect(to)))throw Error('设备重叠，请先移开设备再布线');
   const a=portAnchor(from,aSide),b=portAnchor(to,bSide),start=escapePort(from,aSide,a),end=escapePort(to,bSide,b);
   const direct=(a.x===b.x||a.y===b.y)&&facing(a,b,aSide)&&facing(b,a,bSide)&&!segmentBlocked(a,b,[...labels,...nodes.filter(c=>c.id!==from.id&&c.id!==to.id).map(c=>rect(c,12))]);
   if(!direct&&(segmentBlocked(a,start,labels)||segmentBlocked(end,b,labels)))throw Error('所选端口通道穿过设备名称，请选择其他端口或自动选择');
   if(!direct&&(segmentBlocked(a,start,nodes.filter(c=>c.id!==from.id).map(c=>rect(c,12)))||segmentBlocked(end,b,nodes.filter(c=>c.id!==to.id).map(c=>rect(c,12)))))throw Error('端口被其他组件遮挡');
   const simple=direct?[a,b]:simplify([a,...route(start,end,boxes,page.width,page.height,aSide,bSide),b]);
   if(simple.some(p=>p.x<0||p.y<0||p.x>page.width||p.y>page.height))throw Error('管线超出画面，请增加设备边距');
   const bends=Math.max(0,simple.length-2),dx=simple.at(-1).x-simple.at(-2).x,dy=simple.at(-1).y-simple.at(-2).y;
   return {...edge,points:simple,resolvedPorts:{from:aSide,to:bSide},routeStatus:'ok',routeError:null,routeInfo:{bends,arrowDirection:Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'bottom':'top'),reason:direct?'端口同轴，直接连接':returnSide===aSide&&returnSide===bSide?'循环回流使用外侧通道':bends<=2?'端口不同轴，使用居中的正交通道':'绕开设备或标签障碍'}};
  }
  try{return attempt(...first)}catch(initial){
   let best=null,score=Infinity;
   if(sides)for(const a of edge.fromPort?[edge.fromPort]:['right','left','top','bottom'])for(const b of edge.toPort?[edge.toPort]:['left','right','top','bottom']){
    if(a===first[0]&&b===first[1])continue;
    try{const candidate=attempt(a,b),cost=candidate.routeInfo.bends*80+candidate.points.slice(1).reduce((n,p,i)=>n+Math.abs(p.x-candidate.points[i].x)+Math.abs(p.y-candidate.points[i].y),0);if(cost<score){best=candidate;score=cost}}catch{}
   }
   if(best){best.routeInfo.autoPortAdjusted=true;best.routeInfo.reason='默认端口通道受阻，已改用其他端口避开设备或名称';diagnostics.push({code:'port-adjusted',connectionId:edge.id,message:best.routeInfo.reason});return best}
   diagnostics.push({code:'route-blocked',connectionId:edge.id,message:initial.message});return {...edge,points:[],resolvedPorts:null,routeInfo:null,routeStatus:'blocked',routeError:initial.message};
  }
 });diagnostics.push(...separateChannels(page),...connectionCrossings(page.connections));return {page,diagnostics};
}
export function optimizePage(input) {
  if(input.components.some(c=>c.kind==='flow'))throw Error('此画面含旧版手绘管线，请先为管线指定起止设备，再整体优化；当前画面保持不变');
  const page=clone(input),connected=new Set((page.connections||[]).flatMap(e=>[e.from,e.to]));
  // Titles, controls and dashboard cards keep their authored regions. Only explicit
  // topology participants move; being unlocked alone does not make a label a device.
  const movable=page.components.filter(c=>!c.locked&&c.kind!=='flow'&&connected.has(c.id)),ids=new Set(movable.map(c=>c.id));
  if(!movable.length)return routePage(page);
  const graph=graphColumns(movable,page.connections||[]);
  for(const edge of page.connections||[])if(ids.has(edge.from)&&ids.has(edge.to)){if(graph.feedback.includes(edge.id))edge.layoutRole='return';else delete edge.layoutRole;}
  const rowHeight=Math.max(...movable.map(c=>c.h)),local=new Map(movable.map(c=>[c.id,portAnchor({...c,x:0,y:0},'left')]));
  const obstacles=page.components.filter(c=>!ids.has(c.id)&&c.kind!=='flow').map(c=>rect(c,16));
  const baseY=Math.max(48+Math.max(...movable.map(c=>local.get(c.id).y)),Math.min(...movable.map(c=>portAnchor(c,'left').y)));
  let x=Math.max(48,Math.min(...movable.map(c=>c.x)));
  for(const [,items] of graph.columns){
    items.forEach(c=>{c.x=x;c.y=round(baseY+graph.rows.get(c.id)*(rowHeight+64)-local.get(c.id).y)});
    x+=Math.ceil((Math.max(...items.map(c=>c.w))+112)/8)*8;
  }
  // Shift the process band together around fixed content, keeping same-row ports aligned.
  let offset=0;
  while(movable.some(c=>obstacles.some(o=>overlaps(rect({...c,y:c.y+offset}),o)))){
    offset+=16;if(movable.some(c=>c.y+c.h+offset+48>2160))throw Error('标题、控制区或锁定对象占用布局空间，请调整区域或拆分画面');
  }
  for(const c of movable)c.y=round(c.y+offset);
  page.height=Math.max(page.height,Math.ceil(Math.max(...movable.map(c=>c.y+c.h))+48));
  if(page.height>2160)throw Error('组件超过单页可用空间，请拆分画面');
  page.width=Math.max(page.width,x);if(page.width>4096)throw Error('流程过长，请拆分画面');
  const result=routePage(page);if(graph.cycles.length)result.diagnostics.push({code:'cycle-layout',message:'未标注回流的循环已按确定性顺序展开，请核对主流程与回流；可将回流连接明确设为“回流”再优化。箭头仍从源指向目标',components:graph.cycles.flat(),connections:graph.feedback});return result;
}
