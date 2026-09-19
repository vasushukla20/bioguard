import SimulationRenderer from './SimulationRenderer.js';
import { getRiskColor } from '../utils/helpers.js';

// Anatomical source meshes with a lightweight illustrative posture rig.
// This rig visualizes inputs; it is not a validated musculoskeletal solver.
export default class AnatomyRenderer extends SimulationRenderer {
    _init() {
        super._init();
        this.renderer.outputEncoding=THREE.sRGBEncoding;
        this.camera.position.set(0,.95,3.7);
        this.controls?.target.set(0,.95,0);
        this.controls?.update();
    }
    _buildBody() {
        this.bodyGroup = new THREE.Group();
        this.scene.add(this.bodyGroup);
        this.bodyParts = [];
        this.structureMode = 'combined';
        this.currentAngles = { trunk: 0, knee: 0, hip: 0 };
        this._createJointOverlays();
        Object.entries(this.trackedJoints).forEach(([category,names]) => names.forEach(name => {
            const proxy = new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
            proxy.position.copy(this.jointOverlays[name].position);
            proxy.userData={jointName:name,category,isTracked:true};
            this.jointMeshes[name]=proxy;this.bodyGroup.add(proxy);
        }));
        this.status = document.createElement('div');
        this.status.className='anatomy-status'; this.status.setAttribute('role','status');
        this.status.textContent='Loading anatomical muscles and skeleton…'; this.container.append(this.status);
        this.container.dataset.anatomyState='loading';
        new THREE.GLTFLoader().load('models/bioguard-anatomy.glb', gltf => {
            try { this._bindAnatomy(gltf.scene); }
            catch(error) { this._loadError(error); }
        }, event => { if(event.total) this.status.textContent=`Loading anatomy · ${Math.round(event.loaded/event.total*100)}%`; }, error => this._loadError(error));
    }
    _loadError(error) {
        console.error('Anatomy load failed',error);
        this.container.dataset.anatomyState='error';
        this.status.textContent='Anatomy could not load. Reload the page to retry; stress calculations and reports remain available.';
    }
    _bindAnatomy(source) {
        this.anatomyGroup=new THREE.Group();this.scene.add(this.anatomyGroup);
        this.rig={};const bone=(name,parent,x,y,z)=>{const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);this.rig[name]=b;return b;};
        const pelvis=bone('pelvis',this.anatomyGroup,0,.95,0);
        bone('spine',pelvis,0,0,0);
        for(const side of ['l','r']){
            const thigh=bone('thigh_'+side,pelvis,side==='l'?-.1:.1,0,0);
            const shin=bone('shin_'+side,thigh,0,-.43,0);
            bone('foot_'+side,shin,0,-.40,0);
        }
        const names=Object.keys(this.rig),bones=Object.values(this.rig);
        this.anatomyGroup.updateMatrixWorld(true);
        const skeleton=new THREE.Skeleton(bones);
        this.anatomyMeshes=[];
        source.updateMatrixWorld(true);
        source.traverse(obj=>{
            if(!obj.isMesh)return;
            const geometry=obj.geometry.clone().applyMatrix4(obj.matrixWorld);
            const position=geometry.attributes.position;
            const indices=new Uint16Array(position.count*4),weights=new Float32Array(position.count*4);
            const smooth=(v,a,b)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
            for(let i=0;i<position.count;i++){
                const x=position.getX(i),y=position.getY(i),side=x<0?'l':'r';let entries;
                // Arms stay with the trunk; lower limbs blend across hip/knee/ankle.
                if(y>.98 || (Math.abs(x)>.22 && y>.70)) entries=[['spine',1]];
                else if(y>.88){const t=smooth(y,.88,.98);entries=[['thigh_'+side,1-t],['spine',t]];}
                else if(y>.57)entries=[['thigh_'+side,1]];
                else if(y>.47){const t=smooth(y,.47,.57);entries=[['shin_'+side,1-t],['thigh_'+side,t]];}
                else if(y>.17)entries=[['shin_'+side,1]];
                else if(y>.09){const t=smooth(y,.09,.17);entries=[['foot_'+side,1-t],['shin_'+side,t]];}
                else entries=[['foot_'+side,1]];
                entries.forEach(([name,w],j)=>{indices[i*4+j]=names.indexOf(name);weights[i*4+j]=w;});
            }
            geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
            geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
            const material=obj.material.clone();material.skinning=true;material.side=THREE.DoubleSide;material.roughness=.68;
            const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name=obj.name;
            mesh.userData.layer=obj.name.toUpperCase().includes('SKELETON')?'skeleton':'muscles';
            mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
            this.anatomyGroup.add(mesh);mesh.bind(skeleton);this.anatomyMeshes.push(mesh);
        });
        if(this.anatomyMeshes.length<2)throw new Error('Expected separate muscle and skeleton meshes');
        this.status.remove();this.container.dataset.anatomyState='ready';
        this.container.dataset.anatomyMeshes=String(this.anatomyMeshes.length);
        this.updatePosture(this.currentAngles);this.setStructureMode(this.structureMode);
        this.updateJointColors(this.lastScores || {});
        if(this.lastForces)this.renderForceVectors(this.lastForces,this.lastShowVectors);
    }
    setStructureMode(mode) {
        this.structureMode=mode;
        for(const mesh of this.anatomyMeshes || []){
            const muscle=mesh.userData.layer==='muscles';
            mesh.visible=mode==='skeleton'?!muscle:mode==='muscles'?muscle:true;
            mesh.material.transparent=muscle && mode==='xray';
            mesh.material.opacity=muscle && mode==='xray'?.16:1;
            mesh.material.depthWrite=!(muscle && mode==='xray');
            mesh.material.wireframe=mode==='wireframe';
        }
    }
    updatePosture(angles) {
        this.currentAngles={...angles};
        if(!this.rig)return;
        const trunk=THREE.MathUtils.degToRad(angles.trunk||0),hip=THREE.MathUtils.degToRad(angles.hip||0),knee=THREE.MathUtils.degToRad(angles.knee||0);
        const thighAngle=hip-trunk,shinAngle=thighAngle-knee;
        this.rig.pelvis.position.set(0,.12+.43*Math.cos(thighAngle)+.40*Math.cos(shinAngle),-.43*Math.sin(thighAngle)-.40*Math.sin(shinAngle));
        this.rig.spine.rotation.x=trunk;
        for(const side of ['l','r']){
            this.rig['thigh_'+side].rotation.x=-thighAngle;
            this.rig['shin_'+side].rotation.x=knee;
            this.rig['foot_'+side].rotation.x=shinAngle;
        }
        this.anatomyGroup.updateMatrixWorld(true);
        const pos=(b)=>b.getWorldPosition(new THREE.Vector3());
        for(const side of ['l','r']){
            this.jointMeshes['hip_'+side].position.copy(pos(this.rig['thigh_'+side]));
            this.jointMeshes['knee_'+side].position.copy(pos(this.rig['shin_'+side]));
            this.jointMeshes['ankle_'+side].position.copy(pos(this.rig['foot_'+side]));
            this.jointMeshes['shoulder_'+side].position.copy(this.rig.spine.localToWorld(new THREE.Vector3(side==='l'?-.215:.215,.48,0)));
        }
        this.jointMeshes.spine_mid.position.copy(this.rig.spine.localToWorld(new THREE.Vector3(0,.27,-.055)));
        for(const [name,proxy] of Object.entries(this.jointMeshes))this.jointOverlays[name].position.copy(proxy.position);
        this.bodyGroup.children.filter(o=>o.userData.isRing).forEach(o=>o.position.copy(this.jointMeshes[o.userData.jointName].position));
        this.scene.updateMatrixWorld(true);
    }
    updateJointColors(scores) {
        this.lastScores=scores;
        for(const [category,names] of Object.entries(this.trackedJoints))for(const name of names){
            const overlay=this.jointOverlays[name],score=scores[category]||0;
            overlay.material.color.set(getRiskColor(score));overlay.material.opacity=this.rig?.pelvis ? .18+score*.003 : 0;
            overlay.material.depthTest=false;overlay.scale.setScalar(.65+score*.003);
        }
    }
    renderForceVectors(forces,show=true) {
        this.lastForces=forces;this.lastShowVectors=show;
        super.renderForceVectors(forces,show && !!this.rig);
    }
    updateFixItMode(enabled) {
        this.fixItMode=enabled;
        if(this.neutralReference){this.scene.remove(this.neutralReference);this.neutralReference.geometry.dispose();this.neutralReference.material.dispose();this.neutralReference=null;}
        if(!enabled)return;
        const pairs=[[[0,.95,0],[0,1.6,0]],[[-.24,1.52,0],[.24,1.52,0]],[[-.24,1.52,0],[-.29,.88,0]],[[.24,1.52,0],[.29,.88,0]],[[-.1,.95,0],[-.1,.12,0]],[[.1,.95,0],[.1,.12,0]],[[-.1,.95,0],[.1,.95,0]]];
        this.neutralReference=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pairs.flat().map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:0x5bffc0,transparent:true,opacity:.55,depthTest:false}));
        this.scene.add(this.neutralReference);
    }
    destroy(){
        super.destroy();
        this.anatomyMeshes?.forEach(m=>{m.geometry.dispose();m.material.dispose();});
        this.anatomyMeshes?.[0]?.skeleton.dispose();
    }
}
