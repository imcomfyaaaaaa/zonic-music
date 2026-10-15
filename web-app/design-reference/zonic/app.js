const T=[
{t:'Afterglow',a:'Zonic Originals',z:'Night Drive',d:222,g:'#6C5CFF,#2B2370'},
{t:'Neon Rain',a:'Kavi North',z:'Night Drive',d:198,g:'#2B2370,#FF6B81'},
{t:'Low Tide',a:'Mara Lenz',z:'Golden Hour',d:245,g:'#FF6B81,#7a2a6e'},
{t:'Honey Light',a:'The Fieldwork',z:'Golden Hour',d:210,g:'#FFB36B,#FF6B81'},
{t:'Static Bloom',a:'Oro',z:'Deep Focus',d:178,g:'#3a3f55,#14161d'},
{t:'Paper Planes',a:'Hollow Hours',z:'Deep Focus',d:231,g:'#4b5a8a,#1B1D26'},
{t:'Midnight Run',a:'Kavi North',z:'Night Drive',d:204,g:'#6C5CFF,#FF6B81'},
{t:'Sunday Slow',a:'Mara Lenz',z:'Golden Hour',d:262,g:'#FF6B81,#6C5CFF'}];
const Z=['All','Night Drive','Golden Hour','Deep Focus'];
let cur=0,playing=false,pos=0,view='home',zone='All';const P=[{n:'Liked Songs',t:[],liked:1},{n:'Late Night Mix',t:[0,1,6]},{n:'Sunday Reset',t:[2,3,7]}];const liked={has:i=>P[0].t.includes(i)};let query='',menu=false;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\x22/g,'&quot;').replace(/\x27/g,'&#39;');
const PLUS=`<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' aria-hidden='true'><path d='M12 5v14M5 12h14'/></svg>`;
const plBg=p=>p.liked?bg('#6C5CFF,#FF6B81'):p.t.length?bg(T[p.t[0]].g):bg('#3a3f55,#14161d');
const plCard=(p,i)=>`<button class='card' data-v='pl:${i}'><div class='art' style='background:${plBg(p)}'></div><b>${esc(p.n)}</b><small>${p.t.length} songs</small></button>`;
function navPl(){$('#plNav').innerHTML=P.map((p,i)=>`<button class='nav' data-v='pl:${i}'>${esc(p.n)}</button>`).join('');document.querySelectorAll('#plNav .nav').forEach(b=>b.classList.toggle('on',b.dataset.v===view))}
function renderMenu(){const m=$('#menu');m.hidden=!menu;$('#add').setAttribute('aria-expanded',menu);if(menu)m.innerHTML=`<small>Add ${esc(T[cur].t)} to</small>`+P.map((p,i)=>`<button class='mi' data-add='${i}'><span>${esc(p.n)}</span><span>${p.t.includes(cur)?'✓':''}</span></button>`).join('')+`<button class='mi' data-new='1'>+ New playlist</button>`}
function srHtml(){const q=query.trim().toLowerCase(),A=[...new Set(T.map(t=>t.a))];
const av=a=>{const k=T.find(t=>t.a===a);return `<button class='artist' data-q='${esc(a)}'><div class='av' style='background:${bg(k.g)}'>${esc(a[0])}</div><b>${esc(a)}</b></button>`};
if(!q)return `<h2>Browse by zone</h2><div class='chips'>${Z.slice(1).map(z=>`<button class='chip' data-q='${z}'>${z}</button>`).join('')}</div><h2>Artists</h2><div class='artists'>${A.map(av).join('')}</div><h2>All songs</h2>${T.map((_,i)=>row(i,i+1)).join('')}`;
const r=T.map((_,i)=>i).filter(i=>(T[i].t+' '+T[i].a+' '+T[i].z).toLowerCase().includes(q)),ar=A.filter(a=>a.toLowerCase().includes(q));
if(!r.length&&!ar.length)return `<div class='empty'>No results for “${esc(query)}”. Try an artist or zone name.</div>`;
return (ar.length?`<h2>Artists</h2><div class='artists'>${ar.map(av).join('')}</div>`:'')+(r.length?`<h2>Songs</h2>${r.map((i,n)=>row(i,n+1)).join('')}`:'')}
function plView(i){const p=P[i];if(!p)return '<h1>Playlist</h1>';return `<div class='plhead'><div class='art' style='background:${plBg(p)}'></div><div style='flex:1;min-width:0'><small>Playlist</small><input id='pn' class='pname' ${p.liked?'readonly':''} value='${esc(p.n)}' aria-label='Playlist name' data-p='${i}'><div class='sub'>${p.t.length} songs</div><button class='cta' ${p.t.length?'':'disabled'} data-i='${p.t[0]??0}'>Play</button> ${p.liked?'':`<button class='chip' data-del='${i}'>Delete</button>`}</div></div>${p.t.length?p.t.map((t,n)=>row(t,n+1)).join(''):`<div class='empty'>${p.liked?'Tap the heart on a playing song to add it here.':'Empty. Use the + button in the player to add songs.'}</div>`}`}
const $=s=>document.querySelector(s);
const fmt=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
const bg=g=>`linear-gradient(135deg,${g})`;
const I={play:'<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',pause:'<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
prev:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 5L9 12l10 7zM5 5v14"/></svg>',
next:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l10 7-10 7zM19 5v14"/></svg>',
heart:f=>`<svg width="22" height="22" viewBox="0 0 24 24" fill="${f?'#FF6B81':'none'}" stroke="${f?'#FF6B81':'currentColor'}" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>`};
const card=i=>`<button class="card" data-i="${i}"><div class="art" style="background:${bg(T[i].g)}">${i===cur&&playing?'<span class="badge">Playing</span>':''}</div><b>${T[i].t}</b><small>${T[i].a}</small></button>`;
const row=(i,n)=>`<button class="row${i===cur?' on':''}" data-i="${i}"><span class="n">${n}</span><span class="rt"><b>${T[i].t}</b><small>${T[i].a}</small></span><span class="rz">${T[i].z}</span><span>${fmt(T[i].d)}</span></button>`;
function render(){
 const h=new Date().getHours(),g=h<12?'Good morning':h<18?'Good afternoon':'Good evening';let o='';
 if(view==='home'){
  o=`<h1>${g}</h1><div class="sub">Pick a zone and drift.</div>${hero()}<h2>Jump back in</h2><div class="shelf">${[...T.keys()].reverse().slice(0,6).map(card).join('')}</div><h2>Zones</h2><div class="chips">${Z.map(z=>`<button class="chip${z===zone?' on':''}" data-z="${z}">${z}</button>`).join('')}</div><div class="grid">${T.map((_,i)=>i).filter(i=>zone==='All'||T[i].z===zone).map(card).join('')}</div>`;
 }else if(view==='browse'){
  o=`<h1>Browse</h1><div class='sub'>Search songs, artists and zones, or look around.</div><input id='q' class='sbox' type='search' placeholder='What do you want to hear?' aria-label='Search songs, artists and zones' value='${esc(query)}'><div id='sr'>${srHtml()}</div>`;
 }else if(view.startsWith('pl:')){o=plView(+view.slice(3))
 }else if(view==='browse'){
  o=`<h1>Browse</h1><div class="sub">Every track in every zone.</div>${T.map((_,i)=>row(i,i+1)).join('')}`;
 }else{
  o=`<h1>Library</h1><div class="sub">Your playlists, including Liked Songs.</div><h2>Playlists</h2><div class="shelf">${P.map(plCard).join('')}<button class="card" data-new="1"><div class="art plus">+</div><b>New playlist</b></button></div>`;
 }
 navPl();$('#main').innerHTML=o;
 document.querySelectorAll('[data-v]').forEach(b=>{const on=b.dataset.v===view;b.classList.toggle('on',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')});
}
function hero(){const k=T[cur];return `<section class="hero"><div class="hz"><small>Featured zone</small><h2>${k.z}</h2><p>${T.filter(t=>t.z===k.z).length} tracks to match the mood.</p><button class="cta" data-i="${cur}">${playing?'Pause':'Play zone'}</button></div><div class="hart" style="background:${bg(k.g)}"></div></section>`}
function renderQ(){$('#qList').innerHTML=[1,2,3,4,5].map(n=>row((cur+n)%T.length,n)).join('')}
function sync(){
 const k=T[cur];$('#pArt').style.background=bg(k.g);$('#pT').textContent=k.t;$('#pA').textContent=k.a;
 $('#pp').innerHTML=playing?I.pause:I.play;$('#pp').setAttribute('aria-label',playing?'Pause':'Play');
 const l=liked.has(cur);$('#like').innerHTML=I.heart(l);$('#like').setAttribute('aria-pressed',l);
 $('#rng').max=k.d;upd();const c=k.g.split(',');document.documentElement.style.setProperty('--c1',c[0]);document.documentElement.style.setProperty('--c2',c[1]);renderQ();
}
function upd(){$('#rng').value=pos;$('#pos').textContent=fmt(pos);$('#dur').textContent=fmt(T[cur].d)}
function go(i){cur=(i+T.length)%T.length;pos=0;playing=true;sync();render()}
$('#prev').innerHTML=I.prev;$('#next').innerHTML=I.next;
$('#prev').onclick=()=>pos>3?(pos=0,upd()):go(cur-1);
$('#next').onclick=()=>go(cur+1);
$('#pp').onclick=()=>{playing=!playing;sync();render()};
$('#like').onclick=()=>{const t=P[0].t,k=t.indexOf(cur);k<0?t.push(cur):t.splice(k,1);sync();renderMenu();render()};
$('#rng').oninput=e=>{pos=+e.target.value;upd()};
document.addEventListener('click',e=>{
 const i=e.target.closest('[data-i]'),v=e.target.closest('[data-v]'),z=e.target.closest('[data-z]');
 if(i){i.dataset.i==cur&&playing?(playing=false,sync(),render()):go(+i.dataset.i)}
 else if(v){view=v.dataset.v;render()}
 else if(z){zone=z.dataset.z;render()}
});
setInterval(()=>{if(!playing)return;pos++;pos>=T[cur].d?go(cur+1):upd()},1000);
document.addEventListener('input',e=>{const t=e.target;if(t.id==='q'){query=t.value;$('#sr').innerHTML=srHtml()}else if(t.id==='pn'){P[+t.dataset.p].n=t.value;navPl()}});
document.addEventListener('click',e=>{const t=e.target,q=t.closest('[data-q]'),nw=t.closest('[data-new]'),ad=t.closest('[data-add]'),dl=t.closest('[data-del]');
if(q){query=q.dataset.q;render();return}
if(nw){P.push({n:'New playlist '+P.length,t:nw.closest('#menu')?[cur]:[]});menu=false;view='pl:'+(P.length-1);renderMenu();render();return}
if(ad){const p=P[+ad.dataset.add],k=p.t.indexOf(cur);k<0?p.t.push(cur):p.t.splice(k,1);sync();renderMenu();render();return}
if(dl){P.splice(+dl.dataset.del,1);view='library';render();return}
if(t.closest('#add')){menu=!menu;renderMenu();return}
if(menu&&!t.closest('#menu')){menu=false;renderMenu()}});
const DIR={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
document.addEventListener('keydown',e=>{const t=e.target,k=e.key;
if(t.matches('input[type=search],input:not([type])')&&!/Arrow(Up|Down)/.test(k))return;
if(k==='MediaPlayPause'||(k===' '&&!t.closest('button,input'))){e.preventDefault();$('#pp').click();return}
if(k==='MediaTrackNext'){$('#next').click();return}
if(k==='MediaTrackPrevious'){$('#prev').click();return}
const d=DIR[k];if(!d||(t.type==='range'&&d[0]))return;
const all=[...document.querySelectorAll('button:not([disabled]),input')].filter(el=>el.offsetParent&&!el.closest('[hidden]'));
if(!all.includes(t)){e.preventDefault();(all[0]||t).focus();return}
const r=t.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let best=null,bs=1e9;
for(const el of all){if(el===t)continue;const b=el.getBoundingClientRect(),x=b.left+b.width/2-cx,y=b.top+b.height/2-cy,p=x*d[0]+y*d[1];if(p<=4)continue;const s=p+Math.abs(x*d[1]+y*d[0])*2;if(s<bs){bs=s;best=el}}
if(best){e.preventDefault();best.focus();best.scrollIntoView({block:'nearest',inline:'nearest'})}});
$('#add').innerHTML=PLUS;renderMenu();sync();render();
