import * as THREE from 'three';
import { cellAt } from './world.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const VEHICLE_SPECS = {
  bus:     { maxSpeed: 23, accel: 7.4, brake: 24, turn: 0.56, grip: 4.8, mass: 3.2, circles: [-4.4, 0, 4.4], radius: 2.45, camDist: 19, camHeight: 7.5, label: 'Routemaster' },
  cab:     { maxSpeed: 34, accel: 15, brake: 28, turn: 1.35, grip: 7.2, mass: 1.15, circles: [-1.55, 0, 1.55], radius: 1.18, camDist: 8.3, camHeight: 3.6, label: 'Black cab' },
  police:  { maxSpeed: 39, accel: 17, brake: 31, turn: 1.45, grip: 7.8, mass: 1.2, circles: [-1.55, 0, 1.55], radius: 1.2, camDist: 8.8, camHeight: 3.8, label: 'Met police' },
  boat:    { maxSpeed: 31, accel: 12, brake: 17, turn: 1.0, grip: 2.3, mass: 1.5, circles: [-2.7, 0, 2.7], radius: 1.65, camDist: 11, camHeight: 4.2, label: 'Speedboat' },
  car:     { maxSpeed: 30, accel: 12, brake: 24, turn: 1.1, grip: 6, mass: 1, circles: [-1.25, 0, 1.25], radius: 1, camDist: 8, camHeight: 3.4, label: 'Car' },
};

const materialCache = new Map(), geometryCache = new Map();
const mat = (color, roughness=.55, metalness=0, physical=false) => {
  const key=`${color}|${roughness}|${metalness}|${physical}`;
  if(!materialCache.has(key)) materialCache.set(key, physical ? new THREE.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.6,clearcoatRoughness:.18}) : new THREE.MeshStandardMaterial({color,roughness,metalness}));
  return materialCache.get(key);
};
const geom = (key, create) => { if(!geometryCache.has(key))geometryCache.set(key,create());return geometryCache.get(key); };
function add(g, geometry, material, x=0,y=0,z=0, cast=true) { const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;g.add(m);return m; }
function box(g,w,h,d,m,x=0,y=0,z=0,r=.03){return add(g,geom(`round:${w}:${h}:${d}:${r}`,()=>new RoundedBoxGeometry(w,h,d,3,r)),m,x,y,z);}
function cylinder(g,r1,r2,h,m,x,y,z,n=20){return add(g,geom(`cyl:${r1}:${r2}:${h}:${n}`,()=>new THREE.CylinderGeometry(r1,r2,h,n)),m,x,y,z);}
const glassMat=mat(0x102b38,.16,.35), black=mat(0x101315,.42,.1), chrome=mat(0xc3c9c7,.24,.82), rubber=mat(0x17191a,.82), hub=mat(0xb8c0c2,.25,.78);
function wheel(g,x,y,z,r=.43){const p=new THREE.Group();p.position.set(x,y,z);g.add(p);const tire=add(p,geom(`tire:${r}`,()=>new THREE.CylinderGeometry(r,r,.25,24)),rubber);tire.rotation.z=Math.PI/2;const rim=add(p,geom(`rim:${r}`,()=>new THREE.CylinderGeometry(r*.57,r*.57,.265,20)),hub);rim.rotation.z=Math.PI/2;const ring=add(p,geom(`torus:${r}`,()=>new THREE.TorusGeometry(r*.57,.035,8,20)),chrome);ring.rotation.y=Math.PI/2;return p;}
function groundShadow(g,w,d){const m=add(g,geom(`shadow:${w}:${d}`,()=>new THREE.PlaneGeometry(w,d)),new THREE.MeshBasicMaterial({color:0x080a0b,transparent:true,opacity:.22,depthWrite:false}),0,.035,0,false);m.rotation.x=-Math.PI/2;}
function textPlane(g,text,w,h,x,y,z,bg='#101619',fg='#ffe7a1',font='bold 36px sans-serif') { if(typeof document==='undefined')return;const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=fg;ctx.font=font;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65,490);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;const mesh=add(g,new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tx}),x,y,z,false);return mesh; }
function makeCar(g,kind,opts={}){
 const cab=kind==='cab',cop=kind==='police',paint=mat(cab?0x101214:cop?0xf4f1e9:(opts.color??0x34718c),.24,.15,true),white=mat(0xf5f2e9,.3,0,true),red=mat(0xb82027,.25,.12,true),lamp=mat(0xfff1c6,.2,.1),tail=mat(0xe31b2b,.25,.1);
 const estate=cop||Math.random()>.48, length=cab?4.15:estate?4.35:3.8;
 box(g,1.88,.72,length,paint,0,.75,0,.16);box(g,1.74,.17,length*.76,black,0,.43,.02,.06);
 if(cab){box(g,1.6,.9,2.15,paint,0,1.32,-.12,.2);box(g,1.48,.6,.07,glassMat,0,1.39,-1.22);box(g,1.48,.58,.07,glassMat,0,1.37,.92);box(g,.07,.56,1.72,glassMat,-.79,1.37,-.1);box(g,.07,.56,1.72,glassMat,.79,1.37,-.1);box(g,.65,.2,.44,mat(0xf2c637,.28,.05,true),0,1.88,-.08);const taxi=textPlane(g,'TAXI',.55,.16,0,1.89,-.31,'#f2c637','#171717');if(taxi)taxi.rotation.y=Math.PI;box(g,1.18,.5,.12,black,0,.75,-2.08,.02);for(let i=0;i<7;i++)box(g,.035,.43,.025,chrome,-.45+i*.15,.75,-2.15,.01);}
 else {
  const roofZ=cop?.05:-.12, roofLen=cop?2.34:estate?2.5:1.9;
  box(g,1.52,.78,roofLen,paint,0,1.31,roofZ,.16);
  box(g,1.39,.56,.07,glassMat,0,1.34,-1.12);box(g,1.4,.55,.07,glassMat,0,1.34,1.08);
  for(const s of [-1,1]){box(g,.055,.55,1.72,glassMat,s*.76,1.34,-.02,.02);box(g,.08,.09,.16,chrome,s*.98,1.0,-1.58,.02);}
  if(cop){battenburg(g,paint);const policeText=textPlane(g,'POLICE',.9,.17,-.951,1.02,-.03,'#15539a','#fff','bold 30px sans-serif');if(policeText)policeText.rotation.y=-Math.PI/2;const bar=new THREE.Group();bar.position.set(0,1.8,0);g.add(bar);box(bar,1.3,.12,.34,black,0,0,0);const l=box(bar,.48,.19,.3,mat(0x1888ff,.2,0),-.34,.13,0),r=box(bar,.48,.19,.3,mat(0xff2335,.2,0),.34,.13,0);l.material.emissive.set(0x004aff);r.material.emissive.set(0x65000a);g.userData.lightMeshes=[l,r];}
 }
 for(const s of [-1,1]){box(g,.13,.23,.08,lamp,s*.63,.78,-length/2-.03,.03);box(g,.16,.23,.08,tail,s*.68,.78,length/2+.025,.03);}
 const wheels=[];for(const s of [-1,1])for(const z of [-length*.31,length*.31])wheels.push(wheel(g,s*.94,.49,z,cab?.43:.41));g.userData.wheels=wheels;groundShadow(g,2.5,length+1);
}
function battenburg(g,paint){if(typeof document==='undefined')return;const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='#f4f1e9';x.fillRect(0,0,512,128);for(let i=-1;i<6;i++){x.fillStyle=i%2?'#f2d41e':'#15539a';x.beginPath();x.moveTo(i*112,0);x.lineTo(i*112+76,0);x.lineTo(i*112+8,128);x.lineTo(i*112-68,128);x.fill();}const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;for(const s of [-1,1]){const p=add(g,new THREE.PlaneGeometry(1.82,.4),new THREE.MeshBasicMaterial({map:tx,side:THREE.DoubleSide}),s*.945,.88,0,false);p.rotation.y=s*Math.PI/2;}}
function makeBus(g,route='11'){
 const red=mat(0xc91827,.2,.12,true),black=mat(0x101214,.38,.05),glass=mat(0x071e2b,.12,.3),cream=mat(0xe9dfc6,.45,.15),lamp=mat(0xfff1c2,.2),tail=mat(0xe3182b,.2);
 box(g,2.48,4.04,11.2,red,0,2.2,0,.35);box(g,2.51,.43,10.7,black,0,.28,.03,.12);box(g,2.5,.14,10.9,red,0,4.18,0,.18);
 // continuous glazing bands on both decks, framed with fine red pillars
 for(const y of [1.48,3.17]){box(g,2.49,1.04,9.8,glass,0,y,.08,.07);for(const s of [-1,1]){box(g,.04,.96,9.7,black,s*1.24,y,.08,.018);for(let z=-4.25;z<=4.35;z+=.87)box(g,.055,.99,.055,red,s*1.267,y,z,.015);}}
 for(const y of [1.48,3.17]){box(g,1.9,.9,.07,glass,0,y,-5.58,.04);box(g,1.9,.9,.07,glass,0,y,5.58,.04);}
 // slanted signature front staircase pane and rear stair glazing
 const stair=box(g,.075,1.48,.78,glass,-1.3,2.32,-4.55,.035);stair.rotation.x=.46;const rear=box(g,.07,1.3,.6,glass,-1.3,2.3,4.65,.03);rear.rotation.x=-.4;
 box(g,2.05,.2,.17,black,0,.53,-5.58,.04);for(const s of [-1,1]){const h=box(g,.3,.2,.08,lamp,s*.9,.62,-5.61,.04);h.material.emissive.set(0xffd476);h.material.emissiveIntensity=.7;box(g,.3,.18,.08,tail,s*.9,.62,5.61,.04);}
 // destination blind with large route and destination label
 box(g,1.45,.38,.09,black,0,3.9,-5.62,.025);const blind=textPlane(g,`${route}  WESTMINSTER`,1.33,.27,0,3.9,-5.68,'#111719','#ffe8a2','bold 32px sans-serif');if(blind)blind.rotation.y=Math.PI;
 // lower front cab and destination plate
 box(g,.85,.72,.08,glass,0,1.08,-5.62,.035);box(g,.48,.22,.04,red,0,.58,-5.67,.02);
 for(const s of [-1,1]){box(g,.1,.13,.5,black,s*1.34,2.55,-1.1,.04);box(g,.08,.42,.08,chrome,s*1.49,2.42,-1.1,.03);}
 // low axle arches and six wheels
 for(const s of [-1,1]){for(const z of [-4.35,0,4.35]){const arch=add(g,geom('arch',()=>new THREE.TorusGeometry(.67,.09,8,24,Math.PI)),black,s*1.25,.56,z);arch.rotation.z=Math.PI;}}
 const wheels=[];for(const s of [-1,1])for(const z of [-4.35,0,4.35])wheels.push(wheel(g,s*1.28,.52,z,.56));g.userData.wheels=wheels;groundShadow(g,3.1,12.1);
}
function makeBoat(g){
 const hull=mat(0xf1f0e9,.2,.22,true),red=mat(0xc8232d,.22,.15,true),deck=mat(0xe2ded4,.34,.08,true),dark=mat(0x132d38,.12,.32),chrome=mat(0xbcc5c4,.2,.85);
 // Cross sections taper to a sharp bow, lofted as a watertight V-hull.
 const sections=[[-3.5,0,.03,.12],[-2.7,.72,.28,.25],[-1.5,1.12,.52,.32],[0,1.2,.62,.34],[2.2,1.04,.49,.31],[3.0,.75,.35,.25]];const verts=[],idx=[];
 for(const [z,w,top,keel] of sections){verts.push(-w,top,z,0,keel,z,w,top,z);}
 for(let i=0;i<sections.length-1;i++)for(let j=0;j<2;j++){const a=i*3+j,b=a+1,c=a+3,d=c+1;idx.push(a,c,b,b,c,d);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(idx);geo.computeVertexNormals();add(g,geo,hull,0,0,0);
 // red waterline strips on both sides
 for(const s of [-1,1]){const side=add(g,geom(`stripe:${s}`,()=>new THREE.BoxGeometry(.045,.11,5.45)),red,s*1.02,.35,0);side.rotation.x=.025;}
 box(g,1.65,.16,2.25,deck,0,.56,.55,.12);box(g,1.42,.65,1.35,hull,0,.94,.35,.18);box(g,1.28,.57,.07,dark,0,1.03,-.42,.06);for(const s of [-1,1]){const wind=box(g,.62,.58,.06,dark,s*.35,1.07,-.43,.04);wind.rotation.z=s*.27;}
 for(const z of [.1,1.0]){box(g,1.0,.1,.62,mat(0x1d3540,.55),0,.77,z,.13);box(g,1.08,.1,.14,mat(0x2b4148,.5),0,.9,z,.05);}
 for(const s of [-1,1]){const rail=add(g,geom(`rail:${s}`,()=>new THREE.CylinderGeometry(.025,.025,3.5,8)),chrome,s*1.02,.9,.1);rail.rotation.x=Math.PI/2;for(const z of [-1.35,1.2])cylinder(g,.025,.025,.45,chrome,s*1.02,.67,z,8);}
 box(g,.52,.67,.62,black,0,.56,2.75,.08);box(g,.4,.35,.38,chrome,0,.55,3.12,.04);cylinder(g,.17,.17,.18,black,0,.36,3.48,12);g.userData.wake=[];groundShadow(g,3,7.8);
}
export function makeVehicleMesh(kind, opts={}) {
  const g=new THREE.Group(); g.name=`vehicle-${kind}`;
  if(kind==='bus')makeBus(g, opts.route); else if(kind==='boat')makeBoat(g); else makeCar(g,kind,opts);
  if(kind==='car'&&opts.color!==undefined) g.userData.customColor=opts.color;
  return g;
}

export class Vehicle {
  constructor(kind, scene, x, z, heading=0) {
    this.kind=kind; this.scene=scene; this.mesh=makeVehicleMesh(kind); this.position=this.mesh.position;
    this.position.set(x,kind==='boat'?-5.68:0,z); this.heading=heading; this.speed=0; this.siren=false;
    this._velocity=new THREE.Vector2(); this._wakeClock=0; this._pitch=0; this._roll=0; this._shake=0; this._skids=[];
    this.mesh.rotation.y=heading; scene.add(this.mesh);
  }
  _collide(world, oldX, oldZ, oldHeading) {
    const spec=VEHICLE_SPECS[this.kind], boat=this.kind==='boat'; let hit=false, nx=0, nz=0;
    for(const off of spec.circles) {
      const x=this.position.x-Math.sin(this.heading)*off, z=this.position.z-Math.cos(this.heading)*off;
      const blocked=(boat&&world.waterBlocked?.(x,z,spec.radius*.55))||(!boat&&world.landBlocked?.(x,z,spec.radius*.55));
      if(blocked) {
        hit=true;
        // Probe the mask on both axes to estimate the face normal of a wall/building.
        const e=Math.max(.8,spec.radius*.65), blockedCell=v=>boat?(v!==1&&v!==3):(v===2||v===9);
        const bx=blockedCell(cellAt(x+e,z)), ax=blockedCell(cellAt(x-e,z));
        const bz=blockedCell(cellAt(x,z+e)), az=blockedCell(cellAt(x,z-e));
        if(bx!==ax){nx=ax?1:-1;} if(bz!==az){nz=az?1:-1;}
        if(Math.abs(this._velocity.x*nx+this._velocity.y*nz)<.01){nx=this.position.x-oldX;nz=this.position.z-oldZ;}
        const nd=Math.hypot(nx,nz)||1;nx/=nd;nz/=nd;break;
      }
      const p=new THREE.Vector3(x,0,z);
      if(world.resolveCircle?.(p,spec.radius,boat?(world.boatColliders||[]):(world.colliders||[]))) { hit=true;nx=p.x-x;nz=p.z-z;const nd=Math.hypot(nx,nz)||1;nx/=nd;nz/=nd;break; }
    }
    if(!boat && !hit){
      const others=[...(world.trafficCars||[]),...(world.otherVehicles||[])];
      for(const other of others){
        if(!other?.position||other.mesh===this.mesh)continue;
        const dx=this.position.x-other.position.x,dz=this.position.z-other.position.z,min=spec.radius+(other.radius||2.3)*.65,d2=dx*dx+dz*dz;
        if(d2>=min*min)continue;
        const d=Math.max(.001,Math.sqrt(d2));nx=dx/d;nz=dz/d;
        const mass=spec.mass||1, otherMass=other.mass||1, rel=(this._velocity.x-(other.velocity?.x||other._velocity?.x||0))*nx+(this._velocity.y-(other.velocity?.z||other._velocity?.y||0))*nz;
        if(rel<0){const impulse=-(1.25*rel)/(1/mass+1/otherMass);this._velocity.x+=nx*impulse/mass;this._velocity.y+=nz*impulse/mass;
          if(other._velocity){other._velocity.x-=nx*impulse/otherMass;other._velocity.y-=nz*impulse/otherMass;}
          if(other.velocity){other.velocity.x-=nx*impulse/otherMass;other.velocity.z-=nz*impulse/otherMass;}}
        const push=(min-d)*.58;this.position.x+=nx*push;this.position.z+=nz*push;
        if(other.mesh?.position){other.mesh.position.x-=nx*push*.7;other.mesh.position.z-=nz*push*.7;}
        hit=true;break;
      }
    }
    if(hit){
      if((world.landBlocked?.(this.position.x,this.position.z,spec.radius*.45))) { this.position.x=oldX;this.position.z=oldZ; }
      const vn=this._velocity.x*nx+this._velocity.y*nz;
      if(vn<0){const restitution=boat ? .18 : .24,bounce=vn*restitution;this._velocity.x-=(1+restitution)*vn*nx;this._velocity.y-=(1+restitution)*vn*nz;this.speed=Math.sign(this.speed)*Math.max(0,Math.abs(this.speed)-Math.abs(bounce)*.35);}
      this._shake=Math.min(.42,Math.abs(this.speed)*.012+.12);
    }
    return hit;
  }
  update(dt,input={},world={},t=0) {
    const spec=VEHICLE_SPECS[this.kind], boat=this.kind==='boat'; dt=Math.min(dt,.05);
    const throttle=(input.forward?1:0)-(input.back?1:0);
    const targetSpeed=throttle>0?spec.maxSpeed:throttle<0?-spec.maxSpeed*.38:0;
    const response=throttle===0?(input.handbrake?2.3:1.25):throttle*this.speed<0?spec.brake:spec.accel;
    this.speed+=THREE.MathUtils.clamp(targetSpeed-this.speed,-response*dt,response*dt);
    const steer=(input.left?1:0)-(input.right?1:0); // +heading = turn left (counter-clockwise from above)
    const speedRatio=THREE.MathUtils.clamp(Math.abs(this.speed)/spec.maxSpeed,0,1);
    const steerScale=THREE.MathUtils.clamp(Math.abs(this.speed)/2.7,.12,1)*(1-speedRatio*.56);
    const yaw=steer*spec.turn*steerScale*dt*Math.sign(this.speed||1);
    this.heading+=yaw;
    const fwd=new THREE.Vector2(-Math.sin(this.heading),-Math.cos(this.heading));
    const side=new THREE.Vector2(-Math.cos(this.heading),Math.sin(this.heading));
    const longitudinal=this._velocity.x*fwd.x+this._velocity.y*fwd.y;
    const lateralVel=this._velocity.x*side.x+this._velocity.y*side.y;
    const hb=!!input.handbrake&&!boat, grip=spec.grip*(hb?.24:1)*(1-speedRatio*.35);
    // Longitudinal drive follows heading; lateral tyre friction removes slip. Handbrake
    // sharply releases rear grip, letting momentum carry the car into a controllable slide.
    const forwardSpeed=THREE.MathUtils.damp(longitudinal,this.speed,8,dt);
    const sideSpeed=THREE.MathUtils.damp(lateralVel,0,grip,dt);
    this._velocity.set(fwd.x*forwardSpeed+side.x*sideSpeed,fwd.y*forwardSpeed+side.y*sideSpeed);
    const oldX=this.position.x,oldZ=this.position.z,oldHeading=this.heading;
    this.position.x+=this._velocity.x*dt;this.position.z+=this._velocity.y*dt;
    if(boat)this.position.y=-5.66+Math.sin(t*2.4+this.position.z*.025)*.12;
    const collision=this._collide(world,oldX,oldZ,oldHeading);
    const lateral=this._velocity.x*(-Math.cos(this.heading))+this._velocity.y*Math.sin(this.heading);
    const drift=Math.abs(lateral)>2.2&&Math.abs(this.speed)>7;
    if(drift&&input.handbrake&&!boat)this._makeSkid(t,dt,lateral);
    this._updateSkids(dt);
    this._pitch=THREE.MathUtils.damp(this._pitch,boat?THREE.MathUtils.clamp(-this.speed*.003,-.14,.11):THREE.MathUtils.clamp(-throttle*.055-(input.back?.035:0),-.12,.14),5,dt);
    const targetRoll=boat?Math.sin(t*1.3+this.position.z*.018)*.055:THREE.MathUtils.clamp(-steer*this.speed*.008-(lateral*.014),-.16,.16);
    this._roll=THREE.MathUtils.damp(this._roll,targetRoll,4.8,dt); this._shake=Math.max(0,this._shake-dt*.8);
    this.mesh.rotation.y=this.heading;
    this.mesh.rotation.z=this._roll;
    this.mesh.rotation.x=this._pitch+(boat?Math.sin(t*2.2+this.position.z*.02)*.025:0);
    this.mesh.position.y=boat?(-5.66+Math.sin(t*2.4+this.position.z*.025)*.13):Math.sin(t*11+this.position.x*.2)*Math.min(.055,Math.abs(this.speed)*.0018);
    for(const w of this.mesh.userData.wheels||[]) w.rotation.x+=this.speed*dt*1.7;
    this._animateLights(t);
    if(boat&&Math.abs(this.speed)>3)this._wake(dt,t);
    if(boat&&Math.abs(this.speed)>9)this._spray(dt,t);
    if(!boat&&world.npcs){
      for(const entry of world.npcs){
        const dx=entry.position.x-this.position.x,dz=entry.position.z-this.position.z,d=Math.hypot(dx,dz),min=spec.radius+.82;
        if(d<min&&d>.001){
          const nx=dx/d,nz=dz/d,force=Math.min(8,3+Math.abs(this.speed)*.48)/(spec.mass||1);
          entry.position.x+=nx*(min-d+.08)-nx*force*dt*.18; entry.position.z+=nz*(min-d+.08)-nz*force*dt*.18;
          entry.stumbleUntil=t+1.55; entry.stumbleX=-nx; entry.stumbleZ=-nz;
          this._velocity.x-=nx*force*.12; this._velocity.y-=nz*force*.12;
        }
      }
    }
    return collision;
  }
  _makeSkid(t,dt,lateral){
    this._skidClock=(this._skidClock||0)-dt;if(this._skidClock>0)return;this._skidClock=.07;
    for(const side of [-1,1]){
      const mark=new THREE.Mesh(new THREE.PlaneGeometry(.24,.78),new THREE.MeshBasicMaterial({color:0x171716,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}));
      const sx=this.position.x+Math.cos(this.heading)*side*.72,sz=this.position.z-Math.sin(this.heading)*side*.72;
      mark.position.set(sx,.045,sz);mark.rotation.x=-Math.PI/2;mark.rotation.z=this.heading+Math.atan2(lateral,this.speed)*.35;this.scene.add(mark);this._skids.push({mesh:mark,age:0});
    }
  }
  _updateSkids(dt){for(let i=this._skids.length-1;i>=0;i--){const s=this._skids[i];s.age+=dt;s.mesh.material.opacity=Math.max(0,.48*(1-s.age/8));if(s.age>8){this.scene.remove(s.mesh);s.mesh.geometry.dispose();s.mesh.material.dispose();this._skids.splice(i,1);}}}
  _animateLights(t){
    const lights=this.mesh.userData.lightMeshes;if(!lights)return;
    lights.forEach((l,i)=>{const on=this.siren&&Math.sin(t*15+(i*Math.PI))>0;l.material.emissiveIntensity=on?2.8:.08;l.material.color.set(on?(i?'#ff3040':'#228bff'):'#53606a');});
  }
  _wake(dt,t){
    this._wakeClock-=dt;if(this._wakeClock>0)return;this._wakeClock=.12;
    const g=this.mesh.userData.wake;if(g.length>20){const o=g.shift();this.scene.remove(o);o.geometry.dispose();o.material.dispose();}
    const puff=new THREE.Mesh(new THREE.SphereGeometry(.17+Math.random()*.1,7,5),new THREE.MeshBasicMaterial({color:0xd9f1f3,transparent:true,opacity:.45,depthWrite:false}));
    const behind=new THREE.Vector3(Math.sin(this.heading)*2.9,0,Math.cos(this.heading)*2.9);puff.position.set(this.position.x+behind.x,-5.83,this.position.z+behind.z);this.scene.add(puff);g.push(puff);
    for(const p of g){p.scale.multiplyScalar(1.008);p.material.opacity*=.986;}
  }
  _spray(dt,t){this._sprayClock=(this._sprayClock||0)-dt;if(this._sprayClock>0)return;this._sprayClock=.055;const puff=new THREE.Mesh(new THREE.SphereGeometry(.13+Math.random()*.13,7,5),new THREE.MeshBasicMaterial({color:0xe6fbff,transparent:true,opacity:.66,depthWrite:false}));const b=new THREE.Vector3(Math.sin(this.heading)*3.2,0,Math.cos(this.heading)*3.2);puff.position.set(this.position.x+b.x,-5.73,this.position.z+b.z);this.scene.add(puff);this.mesh.userData.wake.push(puff);}
  idle(dt,t){ this._animateLights(t); if(this.kind==='boat')this.position.y=-5.66+Math.sin(t*2.4+this.position.z*.025)*.12; this.mesh.rotation.y=this.heading; }
}
