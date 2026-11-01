import * as THREE from 'three';

const materials=new Map(), geometries=new Map();
function material(color,roughness=.72,metalness=0){const key=`${color}|${roughness}|${metalness}`;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));return materials.get(key);}
function geo(key,create){if(!geometries.has(key))geometries.set(key,create());return geometries.get(key);}
function part(parent,geometry,mat,position,name=''){const m=new THREE.Mesh(geometry,mat);m.position.set(...position);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function capsule(parent,r,length,mat,pos,name=''){return part(parent,geo(`capsule:${r}:${length}`,()=>new THREE.CapsuleGeometry(r,length,4,10)),mat,pos,name);}
function hatFor(head,type,hair){
 const brim=material(type==='police'?0x20272b:type==='captain'?0x173a50:type==='cowboy'?0x8c6034:0x292528),crown=material(type==='police'?0x252d32:type==='captain'?0x193d53:type==='cowboy'?0x96663a:0x302c31);
 if(!type)return;
 if(type==='cap'){part(head,geo('hatcap',()=>new THREE.SphereGeometry(.23,18,12,0,Math.PI*2,0,Math.PI*.52)),crown,[0,.13,0]);const v=part(head,geo('capvisor',()=>new THREE.SphereGeometry(.16,16,10)),brim,[0,.1,-.12]);v.scale.set(1,.15,1.35);}
 else if(type==='police'){part(head,geo('policecrown',()=>new THREE.CylinderGeometry(.215,.235,.19,20)),crown,[0,.13,0]);part(head,geo('policebrim',()=>new THREE.CylinderGeometry(.30,.30,.045,24)),brim,[0,.055,0]);part(head,geo('policebadge',()=>new THREE.BoxGeometry(.075,.095,.035)),material(0xd9b548,.38),[0,.15,-.221]);}
 else if(type==='captain'){part(head,geo('captainbrim',()=>new THREE.CylinderGeometry(.235,.235,.07,24)),brim,[0,.12,0]);part(head,geo('captaincrown',()=>new THREE.SphereGeometry(.225,20,12,0,Math.PI*2,0,Math.PI*.52)),crown,[0,.15,0]);part(head,geo('captainbadge',()=>new THREE.BoxGeometry(.12,.09,.035)),material(0xe2bd60,.4),[0,.13,-.226]);}
 else if(type==='tophat'){part(head,geo('topbrim',()=>new THREE.CylinderGeometry(.30,.30,.05,24)),brim,[0,.07,0]);part(head,geo('topcrown',()=>new THREE.CylinderGeometry(.19,.21,.34,20)),crown,[0,.255,0]);}
 else if(type==='cowboy'){part(head,geo('cowcrown',()=>new THREE.CylinderGeometry(.19,.23,.15,20)),crown,[0,.18,0]);const wide=part(head,geo('cowbrim',()=>new THREE.CylinderGeometry(.40,.37,.055,24)),brim,[0,.105,0]);wide.scale.z=.78;part(head,geo('hatband',()=>new THREE.BoxGeometry(.40,.045,.035)),material(0x5a2e1d),[0,.15,-.01]);}
 else if(type==='beanie'){part(head,geo('beanie',()=>new THREE.SphereGeometry(.235,20,14)),crown,[0,.13,.005]);part(head,geo('beaniecuff',()=>new THREE.CylinderGeometry(.23,.235,.09,20)),brim,[0,.065,0]);part(head,geo('beaniepom',()=>new THREE.SphereGeometry(.045,12,10)),crown,[0,.36,0]);}
}

export function makeHuman(look={}){
 const group=new THREE.Group();group.name='human';
 const skin=material(look.skin??0xc98962,.75),hair=material(look.hair??0x38291f,.9),shirt=material(look.shirt??0x477f82,.7),pants=material(look.pants??0x29374a,.8),shoe=material(0x292521,.7),eye=material(0x241d1b,.35),white=material(0xf1eee5,.4);
 // A rounded, natural silhouette: feet at 0, crown at approximately 1.78m.
 part(group,geo('torso-form',()=>new THREE.CapsuleGeometry(.255,.43,5,14)),shirt,[0,1.12,0],'torso');
 part(group,geo('pelvis',()=>new THREE.SphereGeometry(1,18,12)),pants,[0,.78,0],'hips').scale.set(.245,.17,.16);
 capsule(group,.07,.1,skin,[0,1.43,0],'neck');
 const legL=new THREE.Group(),legR=new THREE.Group();legL.position.set(-.125,.72,0);legR.position.set(.125,.72,0);group.add(legL,legR);
 const knees={};
 for(const [limb,key] of [[legL,'L'],[legR,'R']]){
   capsule(limb,.105,.29,pants,[0,-.205,0],'thigh');const knee=new THREE.Group();knee.position.set(0,-.42,0);limb.add(knee);knees[key]=knee;
   part(knee,geo('knee',()=>new THREE.SphereGeometry(.105,14,10)),pants,[0,0,0],'knee');capsule(knee,.078,.28,pants,[0,-.2,0],'shin');
   const foot=part(knee,geo('shoeform',()=>new THREE.SphereGeometry(1,16,12)),shoe,[0,-.41,-.055],'shoe');foot.scale.set(.09,.07,.16);
 }
 const armL=new THREE.Group(),armR=new THREE.Group();armL.position.set(-.29,1.37,0);armR.position.set(.29,1.37,0);group.add(armL,armR);
 const elbows={};
 for(const [limb,key] of [[armL,'L'],[armR,'R']]){
   capsule(limb,.083,.24,shirt,[0,-.16,0],'upper-arm');const elbow=new THREE.Group();elbow.position.set(0,-.33,0);limb.add(elbow);elbows[key]=elbow;
   part(elbow,geo('elbow',()=>new THREE.SphereGeometry(.079,12,10)),shirt,[0,0,0],'elbow');capsule(elbow,.064,.23,skin,[0,-.16,0],'forearm');part(elbow,geo('hand',()=>new THREE.SphereGeometry(.073,14,12)),skin,[0,-.34,-.006],'hand');
 }
 const head=new THREE.Group();head.position.set(0,1.55,0);group.add(head);
 part(head,geo('head',()=>new THREE.SphereGeometry(.205,24,18)),skin,[0,0,0],'face');
 for(const s of [-1,1]){part(head,geo('ear',()=>new THREE.SphereGeometry(.045,14,10)),skin,[s*.196,-.015,0],'ear');part(head,geo('eye-white',()=>new THREE.SphereGeometry(.036,14,10)),white,[s*.071,.02,-.179],'eye-white');part(head,geo('eyeball',()=>new THREE.SphereGeometry(.022,12,10)),eye,[s*.071,.02,-.205],'eye');const brow=part(head,geo('brow',()=>new THREE.CapsuleGeometry(.012,.07,2,6)),hair,[s*.071,.075,-.18],'brow');brow.rotation.z=s*.14;}
 const nose=part(head,geo('nose',()=>new THREE.SphereGeometry(.036,14,12)),skin,[0,-.025,-.208],'nose');nose.scale.set(.72,.82,.75);
 const mouth=part(head,geo('mouth',()=>new THREE.TorusGeometry(.046,.006,6,16,Math.PI)),material(0x783d38),[0,-.085,-.182],'mouth');mouth.rotation.z=Math.PI;
 // Hair cap with a shaped fringe and rear volume, kept below optional hats.
 part(head,geo('hair-cap',()=>new THREE.SphereGeometry(.211,22,14,0,Math.PI*2,0,Math.PI*.49)),hair,[0,.073,.006],'hair');part(head,geo('hair-back',()=>new THREE.SphereGeometry(.205,18,12,0,Math.PI*2,0,Math.PI*.5)),hair,[0,-.025,.075],'hair-back');part(head,geo('fringe',()=>new THREE.SphereGeometry(.13,16,10)),hair,[0,.12,-.145],'fringe').scale.set(1,.43,.42);
 hatFor(head,look.hat,hair);
 group.userData.parts={torso:group.children[0],knees,elbows};
 group.scale.set(look.width??1,look.height??1,look.width??1);
 if(look.bag){const bag=part(group,geo('satchel',()=>new THREE.BoxGeometry(.29,.36,.13)),material(look.bagColor??0x6b4430),[.25,1.02,.16],'satchel');bag.rotation.z=-.12;const strap=capsule(group,.018,.58,material(0x332b25),[.12,1.22,.07],'bag-strap');strap.rotation.z=-.35;}
 if(look.umbrella){const shaft=capsule(group,.018,1.16,material(0x282b32),[.48,.73,.04],'umbrella-shaft');shaft.rotation.z=-.08;const canopy=part(group,geo('umbrella-canopy',()=>new THREE.ConeGeometry(.52,.23,18)),material(look.umbrellaColor??0x31556c),[.48,1.39,.04],'umbrella-canopy');canopy.rotation.x=Math.PI;}
 if(look.phone){const phone=part(group,geo('phone',()=>new THREE.BoxGeometry(.09,.16,.025)),material(0x15191e,.3),[.36,.91,-.13],'phone');phone.rotation.x=-.2;}
 return {group,legL,legR,armL,armR,head,knees,elbows};
}

export function animateHuman(h,phase,amount=0){
 if(!h)return;const a=THREE.MathUtils.clamp(amount,0,1),stride=.62*a,swing=Math.sin(phase)*stride,bob=Math.abs(Math.sin(phase*2));
 h.legL.rotation.x=swing;h.legR.rotation.x=-swing;h.legL.rotation.z=.025*a;h.legR.rotation.z=-.025*a;
 if(h.knees){h.knees.L.rotation.x=Math.max(0,-Math.sin(phase))*.42*a;h.knees.R.rotation.x=Math.max(0,Math.sin(phase))*.42*a;}
 h.armL.rotation.x=-swing*.82;h.armR.rotation.x=swing*.82;h.armL.rotation.z=-.08-.025*a;h.armR.rotation.z=.08+.025*a;
 if(h.elbows){h.elbows.L.rotation.x=-.12-.16*a;h.elbows.R.rotation.x=-.12-.16*a;}
 h.head.rotation.y=Math.sin(phase*.5)*.035*a;h.head.rotation.x=-.025*a+Math.sin(phase*2)*.012*a;
 const torso=h.group.userData.parts?.torso;if(torso){torso.rotation.z=-Math.sin(phase)*.035*a;torso.rotation.x=.025*a;}
 h.group.position.y=.012+bob*.045*a+(1-a)*Math.sin(phase*.75)*.012;
}
