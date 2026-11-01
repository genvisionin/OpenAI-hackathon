import * as THREE from 'three';
import { BIG_BEN, WORLD, ROAD_PATHS, findLandNear, landBlocked } from './world.js';
import { NPCS } from './npcData.js';
import { makeHuman, animateHuman } from './human.js';

const PALETTE = [
  ['#c94e3b','#26384d','#d6a27c','#33261f'],['#3b7880','#394458','#e3bd9a','#49372a'],['#d7a53e','#343434','#9a6549','#211d1b'],
  ['#765c9d','#292c35','#ecc5a1','#402d28'],['#66824d','#51463d','#d2a27a','#31221b'],['#d17d9b','#51475b','#f1cba8','#65433a'],
  ['#d9d6c9','#384b55','#9b6549','#241d18'],['#35604f','#463529','#efc49e','#55402f'],['#e2a83d','#282d39','#c68661','#1d1b1b'],
  ['#a74436','#ddd4bd','#d8b28e','#6b493a'],['#5487a0','#272c35','#edc9a4','#3e322c'],['#8b7051','#41444a','#aa7455','#30231d'],
];
const HATS = [null,null,null,null,'cap','beanie'];
const rand = (a,b) => a + Math.random() * (b-a);
const wrap = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

function makeTag(data) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
  const c = canvas.getContext('2d'); c.fillStyle='rgba(12,16,22,.86)'; c.beginPath(); c.roundRect(8,12,496,88,20); c.fill();
  c.strokeStyle=data.mission?'#ffd15c':'rgba(255,255,255,.34)'; c.lineWidth=data.mission?5:3; c.stroke();
  c.font='bold 42px system-ui,sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillStyle='#fff'; c.shadowColor=data.mission?'#ffbd3b':'#000'; c.shadowBlur=data.mission?14:4;
  c.fillText(`${data.mission?'★ ':''}${data.name} — ${data.role}`,256,57,460);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false})); sprite.scale.set(4.6,1,1); sprite.position.y=2.65; return sprite;
}

function pedestrian(scene,data,ambient=false,idx=0) {
  const human=makeHuman(data.look || {}); scene.add(human.group);
  const [x,z]=data.pos; human.group.position.set(x,0,z); if(!ambient) human.group.add(makeTag(data));
  human.group.rotation.y=data.face??0;
  return {data,human,position:human.group.position,angle:data.face??0,phase:idx*1.71,ambient,home:new THREE.Vector2(x,z),
    speed:rand(0.75,1.8),target:null,pause:rand(0,2),action:'walk',actionTime:0,actionArm:0,turn:data.face??0,stumbleUntil:0,radius:.48,chat:null};
}

// Construct real sidewalk samples along the main OSM carriageways. Samples are checked
// against the baked land mask so paths never wander through buildings or the Thames.
function buildSidewalks() {
  const pts=[]; const seen=new Set();
  for(const road of ROAD_PATHS) {
    const src=road.pts||[];
    for(let i=0;i<src.length-1;i++) {
      const [ax,az]=src[i],[bx,bz]=src[i+1],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz); if(len<10)continue;
      const nx=-dz/len,nz=dx/len,offset=(road.w||8)*.5+2.5,count=Math.max(2,Math.ceil(len/15));
      for(const side of [-1,1]) for(let n=0;n<=count;n++) {
        const q=n/count,x=ax+dx*q+nx*offset*side,z=az+dz*q+nz*offset*side;
        if(Math.hypot(x-BIG_BEN.x,z-BIG_BEN.z)>350||landBlocked(x,z,.52))continue;
        const key=`${Math.round(x/4)},${Math.round(z/4)}`; if(seen.has(key))continue; seen.add(key); pts.push({x,z,route:road.name||'',side});
      }
    }
  }
  // Fine-grained links on long segments make a continuous walk graph without cutting corners.
  return pts;
}
function closestWaypoint(pos,points,max=30) {
  let best=null,bd=max*max; for(const p of points){const dx=p.x-pos.x,dz=p.z-pos.z,d=dx*dx+dz*dz;if(d<bd){bd=d;best=p;}} return best;
}
function ambientLook(i) {
  const p=PALETTE[i%PALETTE.length]; return {shirt:p[0],pants:p[1],skin:p[2],hair:p[3],hat:HATS[Math.floor(Math.random()*HATS.length)],height:rand(.91,1.1),width:rand(.86,1.18),
    bag:Math.random()<.25,umbrella:Math.random()<.06,phone:Math.random()<.24};
}

export function spawnNPCs(scene) {
  const list=NPCS.map((data,i)=>pedestrian(scene,data,false,i));
  const sidewalks=buildSidewalks();
  function spawnPoint() {
    for(let k=0;k<80;k++) { const p=sidewalks[Math.floor(Math.random()*sidewalks.length)]; if(p&&Math.hypot(p.x-BIG_BEN.x,p.z-BIG_BEN.z)<350)return {...p}; }
    return findLandNear(BIG_BEN.x-35,BIG_BEN.z+45,.55,90);
  }
  for(let i=0;i<70;i++) {
    const p=spawnPoint(), data={id:`walker_${i}`,name:'',role:'',pos:[p.x,p.z],face:rand(-Math.PI,Math.PI),look:ambientLook(i)};
    const e=pedestrian(scene,data,true,i+NPCS.length); e.route=p.route; e.side=p.side; e.waypoint=closestWaypoint(p,sidewalks,2)||p;
    e.pathPoints=sidewalks.filter(q=>q.route===e.route&&q.side===e.side&&Math.hypot(q.x-p.x,q.z-p.z)<55);
    if(e.pathPoints.length<3)e.pathPoints=sidewalks.filter(q=>Math.hypot(q.x-p.x,q.z-p.z)<55);
    e.target=chooseTarget(e); list.push(e);
  }
  // Pairs are assigned a shared chat state and face each other during occasional pauses.
  const walkers=list.filter(e=>e.ambient); for(let i=0;i<walkers.length-1;i+=9){walkers[i].chat=walkers[i+1];walkers[i+1].chat=walkers[i];}
  function chooseTarget(e) {
    const pts=e.pathPoints?.length?e.pathPoints:sidewalks; let best=null,bd=Infinity;
    for(const p of pts){const d=(p.x-e.position.x)**2+(p.z-e.position.z)**2;if(d>16&&d<bd){bd=d;best=p;}}
    if(best)return best;
    const near=closestWaypoint(e.position,sidewalks,45); return near||{x:e.position.x,z:e.position.z};
  }
  return {
    list,
    update(dt,playerPos,t) {
      for(const e of list) {
        const p=e.position, g=e.human.group;
        if(e.ambient) {
          const playerD=Math.hypot(playerPos.x-p.x,playerPos.z-p.z);
          if(playerD>500) { const q=spawnPoint();p.set(q.x,0,q.z);e.target=chooseTarget(e);e.pause=rand(0,1); }
          if(playerD<.96&&playerD>0) {const k=(.96-playerD)/playerD;p.x+=(p.x-playerPos.x)*k;p.z+=(p.z-playerPos.z)*k;}
          if(e.chat&&e.actionTime<=0&&Math.random()<.00012) {e.action='chat';e.actionTime=rand(3,6);e.pause=e.actionTime;}
          if(e.pause>0)e.pause-=dt;
          if(e.actionTime>0)e.actionTime-=dt;
          if(e.actionTime<=0&&e.action!=='walk'){e.action='walk';e.actionArm=0;}
          if(e.action==='walk'&&e.pause<=0) {
            if(!e.target||Math.hypot(e.target.x-p.x,e.target.z-p.z)<1.1){e.target=chooseTarget(e);e.speed=rand(.72,1.9);e.pause=rand(.1,.9);if(Math.random()<.12){e.action=['photo','phone','idle'][Math.floor(Math.random()*3)];e.actionTime=rand(2,5);e.pause=e.actionTime;}}
            const tx=e.target?.x-p.x||0,tz=e.target?.z-p.z||0,d=Math.hypot(tx,tz);
            if(d>.05){let vx=tx/d,vz=tz/d;
              // Soft separation keeps people and the player from occupying the same capsule.
              for(const other of list){if(other===e||other.ambient===false)continue;const ox=p.x-other.position.x,oz=p.z-other.position.z,od=Math.hypot(ox,oz);if(od>0&&od<1.15){const force=(1.15-od)/1.15;vx+=ox/od*force*1.45;vz+=oz/od*force*1.45;}}
              const vd=Math.hypot(vx,vz)||1;vx/=vd;vz/=vd;
              const step=Math.min(d,e.speed*dt),nx=p.x+vx*step,nz=p.z+vz*step;
              if(!landBlocked(nx,nz,.5)){p.x=nx;p.z=nz;const desired=Math.atan2(-vx,-vz);e.turn+=wrap(desired-e.turn)*(1-Math.exp(-7*dt));}
              else e.target=chooseTarget(e);
            }
          }
          if(e.action==='chat'&&e.chat){const dx=e.chat.position.x-p.x,dz=e.chat.position.z-p.z;e.turn+=wrap(Math.atan2(-dx,-dz)-e.turn)*(1-Math.exp(-6*dt));}
          else if(e.action==='photo'){const dx=BIG_BEN.x-p.x,dz=BIG_BEN.z-p.z;e.turn+=wrap(Math.atan2(-dx,-dz)-e.turn)*(1-Math.exp(-4*dt));e.actionArm=THREE.MathUtils.damp(e.actionArm,1,4,dt);}
          else if(e.action==='phone')e.actionArm=THREE.MathUtils.damp(e.actionArm,.65,4,dt);
          else e.actionArm=THREE.MathUtils.damp(e.actionArm,0,4,dt);
          g.rotation.y=e.turn; e.phase+=dt*(e.action==='walk'&&e.pause<=0?e.speed*5.1:0);
          const dist=playerD; if(dist<120){animateHuman(e.human,e.phase,e.action==='walk'&&e.pause<=0?THREE.MathUtils.clamp(e.speed/2.1,0,1):0);e.human.head.rotation.y=0;}
          if(e.actionArm>.02){e.human.armR.rotation.x=-.5-e.actionArm*1.1;e.human.armR.rotation.z=-.25;}
          if(e.action==='phone'){e.human.head.rotation.x=.2;e.human.armL.rotation.x=-.8;}
        } else {
          const dx=playerPos.x-p.x,dz=playerPos.z-p.z,dist=Math.hypot(dx,dz);
          if(dist<16&&dist>.01){const desired=Math.atan2(-dx,-dz);e.turn+=wrap(desired-e.turn)*(1-Math.exp(-5*dt));g.rotation.y=e.turn;
            if(dist<8){e.phase+=dt*2.3;animateHuman(e.human,e.phase,0);e.human.armL.rotation.x=-.3+Math.sin(t*4+e.phase)*.18;e.human.armR.rotation.x=-.6+Math.sin(t*3+e.phase)*.22;}
          }
        }
      }
      // Final low-cost capsule separation removes any overlap left by simultaneous steps.
      const walkers=list.filter(e=>e.ambient);
      for(let i=0;i<walkers.length;i++)for(let j=i+1;j<walkers.length;j++){
        const a=walkers[i],b=walkers[j],dx=b.position.x-a.position.x,dz=b.position.z-a.position.z,d=Math.hypot(dx,dz),min=.94;
        if(d>=min)continue;const nx=d>.001?dx/d:1,nz=d>.001?dz/d:0,push=(min-d)*.51;
        const ax=a.position.x-nx*push,az=a.position.z-nz*push,bx=b.position.x+nx*push,bz=b.position.z+nz*push;
        if(!landBlocked(ax,az,.48)){a.position.x=ax;a.position.z=az;}
        if(!landBlocked(bx,bz,.48)){b.position.x=bx;b.position.z=bz;}
      }
    },
    nearest(pos,maxDist) {let best=null,bd=maxDist;for(const e of list){if(e.ambient)continue;const d=Math.hypot(e.position.x-pos.x,e.position.z-pos.z);if(d<bd){bd=d;best=e;}}return best;},
  };
}
