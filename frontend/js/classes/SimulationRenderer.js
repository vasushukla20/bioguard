// ═══════════════════════════════════════════════════════════════
// BioGuard — Simulation Renderer (Three.js)
// Smooth anatomical human body with dynamic joint stress coloring
// Inspired by 3DHBGen parametric body style
// ═══════════════════════════════════════════════════════════════

import { getRiskColor, getRiskLevel } from '../utils/helpers.js';
import { JOINTS } from '../utils/constants.js';

export default class SimulationRenderer {
    constructor(canvasElement) {
        this.container = canvasElement;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.bodyGroup = null;
        this.jointMeshes = {};
        this.jointOverlays = {};
        this.forceArrows = [];
        this.fixItMode = false;
        this.ghostBody = null;
        this.animId = null;
        this.hoveredJoint = null;
        this.onJointHover = null;
        this.onJointClick = null;
        this.trackedJoints = {
            shoulder: ['shoulder_l', 'shoulder_r'],
            spine: ['spine_mid'],
            hip: ['hip_l', 'hip_r'],
            knee: ['knee_l', 'knee_r'],
            ankle: ['ankle_l', 'ankle_r']
        };

        this._init();
    }

    _init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0f1e);
        this.scene.fog = new THREE.FogExp2(0x0a0f1e, 0.015);

        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
        this.camera.position.set(0, 1.0, 4.5);
        this.camera.lookAt(0, 1.0, 0);

        // Renderer with shadows
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x0a0f1e, 1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.container.appendChild(this.renderer.domElement);

        // Orbit Controls
        if (THREE.OrbitControls) {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.08;
            this.controls.minDistance = 2;
            this.controls.maxDistance = 10;
            this.controls.target.set(0, 1.0, 0);
            this.controls.maxPolarAngle = Math.PI * 0.85;
            this.controls.update();
        }

        // Lighting — soft medical lab feel
        this._createLighting();

        // Ground plane with shadow
        this._createGround();

        // Build anatomical body
        this._buildBody();

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Events
        this.renderer.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.renderer.domElement.addEventListener('click', (e) => this._onClick(e));
        this.renderer.domElement.addEventListener('dblclick', () => this.resetCamera());
        window.addEventListener('resize', () => this._onResize());

        // Start
        this.animate();
    }

    // ── Lighting Setup ───────────────────────────────────────
    _createLighting() {
        // Ambient — soft base
        const ambient = new THREE.AmbientLight(0x334466, 0.6);
        this.scene.add(ambient);

        // Hemisphere light — sky/ground
        const hemi = new THREE.HemisphereLight(0x88aacc, 0x112244, 0.4);
        this.scene.add(hemi);

        // Main directional — front-right, casts shadows
        const dirMain = new THREE.DirectionalLight(0xddeeff, 0.9);
        dirMain.position.set(3, 6, 4);
        dirMain.castShadow = true;
        dirMain.shadow.mapSize.width = 1024;
        dirMain.shadow.mapSize.height = 1024;
        dirMain.shadow.camera.near = 0.5;
        dirMain.shadow.camera.far = 20;
        dirMain.shadow.camera.left = -3;
        dirMain.shadow.camera.right = 3;
        dirMain.shadow.camera.top = 3;
        dirMain.shadow.camera.bottom = -1;
        dirMain.shadow.bias = -0.001;
        this.scene.add(dirMain);

        // Fill light — left, softer
        const dirFill = new THREE.DirectionalLight(0x8899bb, 0.3);
        dirFill.position.set(-3, 4, 2);
        this.scene.add(dirFill);

        // Rim/back light — subtle cyan
        const dirRim = new THREE.DirectionalLight(0x00f5ff, 0.2);
        dirRim.position.set(0, 3, -4);
        this.scene.add(dirRim);

        // Subtle point light near floor for glow
        const floorGlow = new THREE.PointLight(0x00f5ff, 0.15, 8);
        floorGlow.position.set(0, 0.05, 0);
        this.scene.add(floorGlow);
    }

    // ── Ground Plane ─────────────────────────────────────────
    _createGround() {
        // Shadow-receiving ground
        const groundGeo = new THREE.PlaneGeometry(20, 20);
        const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Subtle grid lines
        const gridHelper = new THREE.GridHelper(10, 20, 0x00f5ff, 0x00f5ff);
        gridHelper.material.opacity = 0.04;
        gridHelper.material.transparent = true;
        gridHelper.position.y = 0.001;
        this.scene.add(gridHelper);

        // Ground marker crosses (like the reference)
        this._addGroundMarkers();
    }

    _addGroundMarkers() {
        const markerMat = new THREE.MeshBasicMaterial({
            color: 0x00f5ff,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide
        });

        const positions = [
            [-0.8, 0.002, -0.6], [0.8, 0.002, -0.6],
            [0, 0.002, 0.8], [-0.6, 0.002, 0.4], [0.6, 0.002, 0.4]
        ];

        positions.forEach(pos => {
            // Cross shape
            const h = new THREE.PlaneGeometry(0.15, 0.04);
            const v = new THREE.PlaneGeometry(0.04, 0.15);
            const mh = new THREE.Mesh(h, markerMat);
            const mv = new THREE.Mesh(v, markerMat);
            mh.rotation.x = -Math.PI / 2;
            mv.rotation.x = -Math.PI / 2;
            mh.position.set(...pos);
            mv.position.set(...pos);
            this.scene.add(mh, mv);
        });
    }

    // ── Build Anatomical Human Body ──────────────────────────
    _buildBody() {
        this.bodyGroup = new THREE.Group();

        // Material — smooth matte, like the reference
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xd8d0c4,        // warm bone-white
            roughness: 0.65,
            metalness: 0.05,
            flatShading: false
        });

        // ─── HEAD ────────────────────────────────────
        const headGeo = new THREE.SphereGeometry(0.105, 32, 24);
        headGeo.scale(1, 1.15, 0.95);
        const head = this._makeMesh(headGeo, bodyMat, 0, 1.72, 0);

        // Neck
        const neckGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16);
        const neck = this._makeMesh(neckGeo, bodyMat, 0, 1.60, 0);

        // ─── TORSO ───────────────────────────────────
        // Upper torso (chest) — wider
        const chestGeo = this._createTorsoSegment(0.19, 0.18, 0.22, 0.11, 0.25);
        const chest = this._makeMesh(chestGeo, bodyMat, 0, 1.44, 0);

        // Mid torso (waist) — narrower
        const waistGeo = this._createTorsoSegment(0.18, 0.15, 0.15, 0.09, 0.16);
        const waist = this._makeMesh(waistGeo, bodyMat, 0, 1.22, 0);

        // Lower torso (pelvis) — wider hips
        const pelvisGeo = this._createTorsoSegment(0.15, 0.20, 0.20, 0.10, 0.14);
        const pelvis = this._makeMesh(pelvisGeo, bodyMat, 0, 1.04, 0);

        // ─── ARMS ────────────────────────────────────
        const makeArm = (side) => {
            const s = side === 'l' ? -1 : 1;

            // Shoulder cap
            const shoulderGeo = new THREE.SphereGeometry(0.055, 16, 12);
            const shoulder = this._makeMesh(shoulderGeo, bodyMat, s * 0.24, 1.52, 0);
            shoulder.userData = { jointName: `shoulder_${side}`, isTracked: true, category: 'shoulder' };

            // Upper arm
            const upperArmGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.30, 12);
            const upperArm = this._makeMesh(upperArmGeo, bodyMat, s * 0.26, 1.35, 0);

            // Elbow
            const elbowGeo = new THREE.SphereGeometry(0.038, 12, 10);
            const elbow = this._makeMesh(elbowGeo, bodyMat, s * 0.27, 1.19, 0);

            // Forearm
            const forearmGeo = new THREE.CylinderGeometry(0.032, 0.025, 0.28, 12);
            const forearm = this._makeMesh(forearmGeo, bodyMat, s * 0.28, 1.04, 0);

            // Hand
            const handGeo = new THREE.SphereGeometry(0.03, 10, 8);
            handGeo.scale(1, 1.3, 0.7);
            const hand = this._makeMesh(handGeo, bodyMat, s * 0.29, 0.88, 0);

            return [shoulder, upperArm, elbow, forearm, hand];
        };

        // ─── LEGS ────────────────────────────────────
        const makeLeg = (side) => {
            const s = side === 'l' ? -1 : 1;

            // Hip joint
            const hipGeo = new THREE.SphereGeometry(0.065, 16, 12);
            const hip = this._makeMesh(hipGeo, bodyMat, s * 0.10, 0.95, 0);
            hip.userData = { jointName: `hip_${side}`, isTracked: true, category: 'hip' };

            // Upper leg (thigh)
            const thighGeo = new THREE.CylinderGeometry(0.065, 0.05, 0.40, 16);
            const thigh = this._makeMesh(thighGeo, bodyMat, s * 0.10, 0.73, 0);

            // Knee
            const kneeGeo = new THREE.SphereGeometry(0.048, 14, 10);
            const knee = this._makeMesh(kneeGeo, bodyMat, s * 0.10, 0.52, 0);
            knee.userData = { jointName: `knee_${side}`, isTracked: true, category: 'knee' };

            // Lower leg (shin)
            const shinGeo = new THREE.CylinderGeometry(0.045, 0.035, 0.38, 14);
            const shin = this._makeMesh(shinGeo, bodyMat, s * 0.10, 0.32, 0);

            // Ankle
            const ankleGeo = new THREE.SphereGeometry(0.035, 12, 8);
            const ankle = this._makeMesh(ankleGeo, bodyMat, s * 0.10, 0.12, 0);
            ankle.userData = { jointName: `ankle_${side}`, isTracked: true, category: 'ankle' };

            // Foot
            const footGeo = new THREE.BoxGeometry(0.07, 0.04, 0.14);
            footGeo.translate(0, 0, 0.02);
            const footMat = bodyMat.clone();
            const foot = this._makeMesh(footGeo, footMat, s * 0.10, 0.02, 0.02);

            return [hip, thigh, knee, shin, ankle, foot];
        };

        // ─── SPINE marker (invisible mesh for interaction)
        const spineGeo = new THREE.SphereGeometry(0.06, 12, 10);
        const spineMat = bodyMat.clone();
        spineMat.transparent = true;
        spineMat.opacity = 0;
        const spineMid = this._makeMesh(spineGeo, spineMat, 0, 1.22, -0.06);
        spineMid.userData = { jointName: 'spine_mid', isTracked: true, category: 'spine' };

        // Assemble
        const parts = [
            head, neck, chest, waist, pelvis, spineMid,
            ...makeArm('l'), ...makeArm('r'),
            ...makeLeg('l'), ...makeLeg('r')
        ];

        parts.forEach(mesh => {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.bodyGroup.add(mesh);

            // Track joint meshes
            if (mesh.userData.isTracked) {
                this.jointMeshes[mesh.userData.jointName] = mesh;
            }
        });

        this.bodyParts = parts;
        this.restPose = parts.map(m => ({ position:m.position.clone(), quaternion:m.quaternion.clone() }));
        this.scene.add(this.bodyGroup);

        // ─── Joint Stress Overlay Spheres ────────────
        this._createJointOverlays();
    }

    _createTorsoSegment(topW, botW, topD, botD, height) {
        // Create a box-ish shape with rounded edges using a scaled cylinder
        // For a smoother look, use a lathe or extruded shape
        const shape = new THREE.Shape();
        const w = topW, h = height;

        // Use a CylinderGeometry with elliptical scaling
        const geo = new THREE.CylinderGeometry(1, 1, height, 20, 1);

        // Scale vertices for torso shape
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);

            // Interpolate between top and bottom dimensions
            const t = (y / height) + 0.5; // 0 at bottom, 1 at top
            const widthAtY = botW + (topW - botW) * t;
            const depthAtY = botD + (topD - topD * 0.7) * t + topD * 0.3;

            // Apply organic shape
            const angle = Math.atan2(z, x);
            const r = Math.sqrt(x * x + z * z);
            pos.setX(i, Math.cos(angle) * r * widthAtY);
            pos.setZ(i, Math.sin(angle) * r * depthAtY);
        }
        geo.computeVertexNormals();
        return geo;
    }

    _makeMesh(geo, mat, x, y, z) {
        const mesh = new THREE.Mesh(geo, mat.clone());
        mesh.position.set(x, y, z);
        mesh.userData = { isTracked: false };
        return mesh;
    }

    // ── Joint Stress Overlays ────────────────────────────────
    _createJointOverlays() {
        const overlayPositions = {
            shoulder_l: [-0.24, 1.52, 0],
            shoulder_r: [0.24, 1.52, 0],
            spine_mid: [0, 1.22, -0.04],
            hip_l: [-0.10, 0.95, 0],
            hip_r: [0.10, 0.95, 0],
            knee_l: [-0.10, 0.52, 0],
            knee_r: [0.10, 0.52, 0],
            ankle_l: [-0.10, 0.12, 0],
            ankle_r: [0.10, 0.12, 0]
        };

        Object.entries(overlayPositions).forEach(([name, pos]) => {
            // Glowing overlay sphere
            const geo = new THREE.SphereGeometry(0.06, 16, 12);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x00ff88,
                transparent: true,
                opacity: 0,
                depthWrite: false
            });
            const overlay = new THREE.Mesh(geo, mat);
            overlay.position.set(...pos);
            overlay.renderOrder = 1;
            this.bodyGroup.add(overlay);
            this.jointOverlays[name] = overlay;

            // Pulsing ring
            const ringGeo = new THREE.RingGeometry(0.065, 0.08, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x00ff88,
                transparent: true,
                opacity: 0,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(...pos);
            ring.renderOrder = 2;
            ring.userData = { isRing: true, jointName: name };
            this.bodyGroup.add(ring);
        });
    }

    // ── Update Joint Colors Based on Risk ────────────────────
    updateJointColors(riskScores) {
        if (!riskScores) return;

        Object.entries(this.trackedJoints).forEach(([category, jointNames]) => {
            const score = riskScores[category] || 0;
            const level = getRiskLevel(score);
            const color = new THREE.Color(level.color);
            const intensity = score >= 80 ? 0.7 : score >= 60 ? 0.5 : score >= 40 ? 0.35 : score >= 20 ? 0.2 : 0;

            jointNames.forEach(name => {
                // Color the body part
                const bodyMesh = this.jointMeshes[name];
                if (bodyMesh) {
                    bodyMesh.material.color.copy(color);
                    bodyMesh.material.emissive = color.clone().multiplyScalar(0.15);
                    bodyMesh.material.opacity = 1;
                    bodyMesh.material.transparent = false;
                }

                // Stress overlay glow
                const overlay = this.jointOverlays[name];
                if (overlay) {
                    overlay.material.color.copy(color);
                    overlay.material.opacity = intensity;
                    overlay.scale.setScalar(1 + intensity * 0.5);
                }
            });
        });

        // Also tint nearby body parts for smoother transitions
        this._tintNearbyParts(riskScores);
    }

    _tintNearbyParts(riskScores) {
        // Color body parts near high-risk joints
        const defaultColor = new THREE.Color(0xd8d0c4);
        this.bodyGroup.children.forEach(mesh => {
            if (!mesh.userData.isTracked && !mesh.userData.isRing && mesh.material && mesh.material.depthWrite === true) {
                // Reset to default if not a tracked joint
                if (mesh.material.color && mesh.material.opacity === 1) {
                    // Gradually blend back to default
                    mesh.material.color.lerp(defaultColor, 0.3);
                }
            }
        });
    }

    // ── Force Vector Arrows ──────────────────────────────────
    renderForceVectors(jointForces, show = true) {
        this.forceArrows.forEach(a => { this.scene.remove(a); a.line.material.dispose(); a.cone.material.dispose(); });
        this.forceArrows = [];
        if (!show || !jointForces) return;

        const maxForce = 5000;
        const arrowScale = 0.8;

        Object.entries(this.trackedJoints).forEach(([category, jointNames]) => {
            const force = jointForces[category] || 0;
            if (force < 200) return;

            const normalized = Math.min(force / maxForce, 1);
            const length = normalized * arrowScale + 0.1;
            const color = new THREE.Color(getRiskColor((force / maxForce) * 100));

            jointNames.forEach(name => {
                const overlay = this.jointOverlays[name];
                if (!overlay) return;
                const pos = overlay.getWorldPosition(new THREE.Vector3());

                const dir = new THREE.Vector3(0, -1, 0);
                const origin = pos.clone().add(new THREE.Vector3(0, length + 0.08, 0));
                const arrow = new THREE.ArrowHelper(dir, origin, length, color, 0.04, 0.025);
                arrow.userData = { forceArrow: true };

                // Make arrow line thicker with glow
                if (arrow.line) {
                    arrow.line.material.linewidth = 2;
                }
                this.scene.add(arrow);
                this.forceArrows.push(arrow);
            });
        });
    }

    // ── Fix-It Mode ──────────────────────────────────────────
    updateFixItMode(enabled) {
        this.fixItMode = enabled;

        if (this.ghostBody) {
            this.ghostBody.forEach(m => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
            this.ghostBody = null;
        }

        if (!enabled) return;

        // Ghost overlay — semi-transparent green wireframe of correct posture
        this.ghostBody = [];
        const ghostMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.08,
            wireframe: true,
            depthWrite: false
        });

        this.bodyGroup.children.forEach(child => {
            if (child.geometry && !child.userData.isRing) {
                const ghost = new THREE.Mesh(child.geometry.clone(), ghostMat);
                const rest = this.restPose[this.bodyParts.indexOf(child)];
                if (!rest) return;
                ghost.position.copy(rest.position);
                ghost.quaternion.copy(rest.quaternion);
                ghost.scale.copy(child.scale);
                this.scene.add(ghost);
                this.ghostBody.push(ghost);
            }
        });
    }

    // ── Camera ───────────────────────────────────────────────
    setCameraPosition(preset) {
        const presets = {
            front: { pos: [0, 1.0, 4.5], target: [0, 1.0, 0] },
            side:  { pos: [4.5, 1.0, 0], target: [0, 1.0, 0] },
            top:   { pos: [0, 5, 0.1],   target: [0, 1.0, 0] },
            back:  { pos: [0, 1.0, -4.5], target: [0, 1.0, 0] }
        };
        const p = presets[preset];
        if (!p) return;

        // Smooth camera transition
        const targetPos = new THREE.Vector3(...p.pos);
        const targetLook = new THREE.Vector3(...p.target);
        const startPos = this.camera.position.clone();
        const startTarget = this.controls ? this.controls.target.clone() : new THREE.Vector3();
        const duration = 600;
        const startTime = performance.now();

        const animateCamera = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

            this.camera.position.lerpVectors(startPos, targetPos, ease);
            if (this.controls) {
                this.controls.target.lerpVectors(startTarget, targetLook, ease);
                this.controls.update();
            }
            if (t < 1) requestAnimationFrame(animateCamera);
        };
        requestAnimationFrame(animateCamera);
    }

    
    setStructureMode(mode) {
        this.structureMode = mode;
        this.bodyParts.forEach((mesh, index) => {
            mesh.material.wireframe = mode === 'wireframe';
            mesh.material.transparent = mode === 'xray';
            mesh.material.opacity = mode === 'xray' ? 0.16 : 1;
            mesh.material.depthWrite = mode !== 'xray';
            if (index === 5) mesh.material.opacity = 0.45;
        });
        if (this.skeletonLines) this.skeletonLines.visible = mode === 'xray';
    }

    updatePosture(angles) {
        if (!this.bodyParts) return;
        const rad = value => THREE.MathUtils.degToRad(Number(value) || 0);
        const trunk = rad(angles.trunk), hip = rad(angles.hip), knee = rad(angles.knee);
        const thighAngle = hip - trunk, shinAngle = thighAngle - knee;
        const pelvisY = 0.12 + 0.43 * Math.cos(thighAngle) + 0.40 * Math.cos(shinAngle);
        const pelvisZ = -0.43 * Math.sin(thighAngle) - 0.40 * Math.sin(shinAngle);
        const pivot = new THREE.Vector3(0, pelvisY, pelvisZ);
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), trunk);
        this.bodyParts.forEach((m,i) => { m.position.copy(this.restPose[i].position); m.quaternion.copy(this.restPose[i].quaternion); });
        for(let i=0;i<16;i++) {
            const m=this.bodyParts[i];
            m.position.sub(new THREE.Vector3(0,0.95,0)).applyQuaternion(rotation).add(pivot);
            m.quaternion.copy(rotation);
        }
        const segments=[];
        const connect=(mesh,a,b) => {
            mesh.position.copy(a).add(b).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),a.clone().sub(b).normalize());
            segments.push(a,b);
        };
        for(let side=0;side<2;side++) {
            const i=16+side*6, x=side===0 ? -0.10 : 0.10;
            const a=new THREE.Vector3(x,pelvisY,pelvisZ);
            const b=a.clone().add(new THREE.Vector3(0,-0.43*Math.cos(thighAngle),0.43*Math.sin(thighAngle)));
            const c=b.clone().add(new THREE.Vector3(0,-0.40*Math.cos(shinAngle),0.40*Math.sin(shinAngle)));
            this.bodyParts[i].position.copy(a);
            this.bodyParts[i+2].position.copy(b);
            this.bodyParts[i+4].position.copy(c);
            this.bodyParts[i+5].position.copy(c).add(new THREE.Vector3(0,-0.10,0.02));
            connect(this.bodyParts[i+1],a,b); connect(this.bodyParts[i+3],b,c);
        }
        for (const [name,mesh] of Object.entries(this.jointMeshes)) this.jointOverlays[name].position.copy(mesh.position);
        this.bodyGroup.children.filter(m=>m.userData.isRing).forEach(m=>m.position.copy(this.jointMeshes[m.userData.jointName].position));
        const point=i=>this.bodyParts[i].position.clone();
        segments.push(pivot,point(1),point(6),point(11),point(16),point(22));
        for(const i of [6,11]) segments.push(point(i),point(i+2),point(i+2),point(i+4));
        // Schematic ribs provide structure without implying a clinical anatomical scan.
        for(let i=0;i<7;i++) {
            const y=0.28+i*0.045, width=0.16-Math.abs(i-3)*0.009;
            const pts=[[-width,y,0.01],[0,y-0.03,0.11],[width,y,0.01]];
            const v=pts.map(p=>new THREE.Vector3(...p).applyQuaternion(rotation).add(pivot));
            segments.push(v[0],v[1],v[1],v[2]);
        }
        if (!this.skeletonLines) {
            this.skeletonLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x9bfff4,depthTest:false,transparent:true,opacity:0.9}));
            this.skeletonLines.renderOrder=3; this.scene.add(this.skeletonLines);
        }
        this.skeletonLines.geometry.dispose();
        this.skeletonLines.geometry=new THREE.BufferGeometry().setFromPoints(segments);
        this.setStructureMode(this.structureMode || 'surface');
        this.scene.updateMatrixWorld(true);
    }

    resetCamera() { this.setCameraPosition('front'); }

    // ── Mouse Interaction ────────────────────────────────────
    _onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check tracked joint meshes
        const trackable = Object.values(this.jointMeshes);
        const intersects = this.raycaster.intersectObjects(trackable);

        // Reset previous hover
        Object.values(this.jointOverlays).forEach(o => {
            if (o.material.opacity > 0) {
                // keep stress color
            }
        });

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const name = hit.userData.jointName;
            this.hoveredJoint = name;
            this.renderer.domElement.style.cursor = 'pointer';

            // Pulse the overlay
            const overlay = this.jointOverlays[name];
            if (overlay) {
                overlay.scale.setScalar(1.8);
            }
            if (this.onJointHover) this.onJointHover(name);
        } else {
            this.hoveredJoint = null;
            this.renderer.domElement.style.cursor = 'grab';
        }
    }

    _onClick(event) {
        this._onMouseMove(event);
        if (this.hoveredJoint && this.onJointClick) {
            this.onJointClick(this.hoveredJoint);
        }
    }

    // ── Resize ───────────────────────────────────────────────
    _onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    // ── Render Loop ──────────────────────────────────────────
    animate() {
        this.animId = requestAnimationFrame(() => this.animate());
        const time = Date.now() * 0.001;

        // Animate overlay rings — face camera + pulse
        this.bodyGroup.children.forEach(child => {
            if (child.userData?.isRing) {
                child.lookAt(this.camera.position);
                if (child.material.opacity > 0) {
                    const pulse = 1 + Math.sin(time * 3) * 0.12;
                    child.scale.setScalar(pulse);
                }
            }
        });

        // Pulsing critical overlays
        Object.values(this.jointOverlays).forEach(overlay => {
            if (overlay.material.opacity >= 0.5) {
                overlay.material.opacity = 0.4 + Math.sin(time * 4) * 0.25;
            }
        });

        // Subtle idle breathing on body
        if (this.bodyGroup) {
            const breathe = 1 + Math.sin(time * 0.8) * 0.003;
            // Keep force vectors and anatomy aligned in world space.
        }

        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // ── Cleanup ──────────────────────────────────────────────
    destroy() {
        if (this.animId) cancelAnimationFrame(this.animId);
        this.renderer?.dispose();
        this.renderer?.domElement?.remove();
    }
}
