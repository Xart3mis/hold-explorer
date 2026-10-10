// Reference implementation: the logic of the original "Hold Explorer.html",
// copied without change. Used only by crates/cli/tests/parity.rs.
// Input:  path to a JSON array of {l, n, r, m, t, d} (open holds, file order).
// Output: JSON on stdout.
import { readFileSync } from 'node:fs';

var R = JSON.parse(readFileSync(process.argv[2], 'utf8'));
var BL = {};

var KW=[[/P\s?&\s?IDS?\b|\bPIDS?\b/,'P&ID'],[/SLEEPER/,'SLEEPERS'],[/MISC/,'MISC.'],[/FIV|AIV/,'FIV/AIV'],[/\bLDT\b/,'LDT'],[/LINE SIZE|HOLD SIZE/,'LINE SIZE'],[/DATA ?SHEET/,'DATA SHEET'],[/ISOMETRIC/,'ISOMETRIC'],[/PLOT PLAN/,'PLOT PLAN'],[/TAG NO/,'INSTRUMENT TAG'],[/PIPING MATERIAL CLASS|\bPMC\b/,'PMC'],[/PLATFORM/,'PLATFORM'],[/SUPPORT/,'SUPPORT'],[/\bGA\b|\bGA'S/,'GA DRAWING'],[/VENDOR/,'VENDOR'],[/STRUCTURE|STEEL|STRU/,'STRUCTURE']];
var TAG=/\b(?:\d{3}-)?([A-Z]{1,5})-\s?(\d{2,5})(?:[A-Z](?![A-Z]))?(?!\d|-\d)/g;
function tagOf(u){TAG.lastIndex=0;var g;while(g=TAG.exec(u))if(g[1]!=='UNIT')return g;return null}
function reason(m){
  var s=String(m||'').replace(/_x000D_/gi,' ').replace(/\s+/g,' ').trim(),u=s.toUpperCase(),g;
  if(g=tagOf(u))return [g[1]==='STRU'?'STR':g[1],g[0].replace(/\s/g,'')];
  if(g=/\bT\d{3}-R\d{3}\b/.exec(u))return ['TIE-IN',g[0]];
  for(var i=0;i<KW.length;i++)if(KW[i][0].test(u))return [KW[i][1],KW[i][1]];
  var c=u.replace(/^HOLD /,'').replace(/^(PENDING|ON) ?/,'').slice(0,60);
  return ['Other',c||'—'];
}
function grp(rows,f){
  var g={};
  rows.forEach(function(x){var k=x[f];var o=g[k]=g[k]||{k:k,rows:[],ls:{}};o.rows.push(x);o.ls[x.l]=(o.ls[x.l]||0)+1});
  return Object.keys(g).map(function(k){var o=g[k];o.nl=Object.keys(o.ls).length;return o}).sort(function(a,b){return b.rows.length-a.rows.length});
}
function easy(){return Object.keys(BL).map(function(l){var r=BL[l],d={},t={};r.forEach(function(x){d[x.d]=1;t[x.t]=1});return {l:l,n:r.length,d:Object.keys(d),t:Object.keys(t)}}).sort(function(a,b){return a.d.length-b.d.length||a.n-b.n||(a.d[0]<b.d[0]?-1:a.d[0]>b.d[0]?1:0)||(a.l<b.l?-1:1)})}
function mapData(){
  var N={},LK={},E2={};
  R.forEach(function(x){
    var k=x.d+'|'+x.e,o=N[k]=N[k]||{k:k,d:x.d,z:x.z,e:x.e,ls:{},n:0,lk:0};
    o.n++;o.ls[x.l]=1;(LK[x.l]=LK[x.l]||{})[k]=1;
  });
  Object.keys(LK).forEach(function(l){
    var ks=Object.keys(LK[l]);
    for(var i=0;i<ks.length;i++)for(var j=i+1;j<ks.length;j++){
      var a=ks[i]<ks[j]?ks[i]:ks[j],b=ks[i]<ks[j]?ks[j]:ks[i],id=a+'\u0002'+b,e=E2[id];
      if(!e){e=E2[id]={a:a,b:b,ls:[]};N[a].lk++;N[b].lk++}
      e.ls.push(l);
    }
  });
  var rem={},fr={},sv={},plan=[],cum=0,keys=Object.keys(N);
  Object.keys(LK).forEach(function(l){rem[l]=Object.keys(LK[l]).length});
  for(var s=0;s<20;s++){
    var best=null,bs=0;
    keys.forEach(function(k){
      if(sv[k])return;
      var g=0,p=0;
      Object.keys(N[k].ls).forEach(function(l){if(fr[l])return;if(rem[l]===1)g++;else p+=1/rem[l]});
      var sc=g*1000+p;
      if(sc>bs){bs=sc;best=k}
    });
    if(!best)break;
    var f=[];
    Object.keys(N[best].ls).forEach(function(l){rem[l]--;if(rem[l]===0&&!fr[l]){fr[l]=1;f.push(l)}});
    sv[best]=1;cum+=f.length;plan.push({k:best,gain:f.length,cum:cum,ls:f});
  }
  return {N:N,LK:LK,E:Object.keys(E2).map(function(k){return E2[k]}),plan:plan};
}

// Same set-up as setRows() in the original.
R.forEach(function(x){var r=reason(x.m);x.z=r[0];x.e=r[1]});
R.forEach(function(x){(BL[x.l]=BL[x.l]||[]).push(x)});

function counts(f){var o={};grp(R,f).forEach(function(g){o[g.k]=[g.rows.length,g.nl]});return o}
var ls=Object.keys(BL);
process.stdout.write(JSON.stringify({
  holds:R.length,
  lines:ls.length,
  single:ls.filter(function(l){return BL[l].length===1}).length,
  by:{d:counts('d'),t:counts('t'),r:counts('r'),z:counts('z')},
  easy:easy().map(function(o){return o.l}),
  plan:mapData().plan.map(function(p){return {k:p.k,gain:p.gain,cum:p.cum}}),
  rules:R.map(function(x){return [x.z,x.e]})
}));
