// Condense directed cycles before assigning columns; independent of input array order.
export function graphColumns(nodes,allEdges){
 // Explicit return paths do not impose a forward process column. Derived layoutRole
 // is deliberately ignored here so re-optimization can recover after topology edits.
 const edges=allEdges.filter(e=>e.routeMode!=='return');
 const ids=new Set(nodes.map(n=>n.id)),out=new Map([...ids].sort().map(id=>[id,[]]));
 for(const e of edges)if(ids.has(e.from)&&ids.has(e.to))out.get(e.from).push(e.to);
 for(const values of out.values())values.sort();
 const index=new Map(),low=new Map(),stack=[],onStack=new Set(),groups=[];let next=0;
 function visit(id){index.set(id,next);low.set(id,next++);stack.push(id);onStack.add(id);for(const to of out.get(id)){if(!index.has(to)){visit(to);low.set(id,Math.min(low.get(id),low.get(to)))}else if(onStack.has(to))low.set(id,Math.min(low.get(id),index.get(to)))}if(low.get(id)===index.get(id)){const group=[];let v;do{v=stack.pop();onStack.delete(v);group.push(v)}while(v!==id);groups.push(group.sort())}}
 for(const id of out.keys())if(!index.has(id))visit(id);
 const groupOf=new Map(groups.flatMap((g,i)=>g.map(id=>[id,i]))),incoming=groups.map(()=>new Set()),orders=groups.map((group,i)=>{
  const entry=group.filter(id=>edges.some(e=>e.to===id&&ids.has(e.from)&&!group.includes(e.from))).sort()[0]||group[0],order=[],seen=new Set();
  function walk(id){if(seen.has(id))return;seen.add(id);order.push(id);for(const to of out.get(id))if(groupOf.get(to)===i)walk(to)}walk(entry);for(const id of group)walk(id);return order;
 });
 for(const e of edges)if(ids.has(e.from)&&ids.has(e.to)&&groupOf.get(e.from)!==groupOf.get(e.to))incoming[groupOf.get(e.to)].add(groupOf.get(e.from));
 const starts=new Map();function start(i){if(starts.has(i))return starts.get(i);const x=Math.max(0,...[...incoming[i]].map(p=>start(p)+orders[p].length));starts.set(i,x);return x}
 const ranks=new Map();for(let i=0;i<groups.length;i++)orders[i].forEach((id,j)=>ranks.set(id,start(i)+j));
 const feedback=allEdges.filter(e=>ids.has(e.from)&&ids.has(e.to)&&(e.routeMode==='return'||ranks.get(e.to)<=ranks.get(e.from))).map(e=>e.id).sort();
 const columns=new Map();for(const node of nodes){const rank=ranks.get(node.id);if(!columns.has(rank))columns.set(rank,[]);columns.get(rank).push(node)}
 const ordered=[...columns].sort((a,b)=>a[0]-b[0]),maxRows=Math.max(1,...ordered.map(([,n])=>n.length)),rows=new Map();
 for(const [,items] of ordered){const center=id=>{const parents=edges.filter(e=>e.to===id&&rows.has(e.from)&&ranks.get(e.from)<ranks.get(id)).map(e=>rows.get(e.from));return parents.length?parents.reduce((a,b)=>a+b,0)/parents.length:maxRows/2};items.sort((a,b)=>center(a.id)-center(b.id)||a.id.localeCompare(b.id));items.forEach((n,i)=>rows.set(n.id,(maxRows-items.length)/2+i))}
 return {columns:ordered,rows,feedback,cycles:groups.filter(g=>g.length>1)};
}
