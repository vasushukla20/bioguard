// ═══════════════════════════════════════════════════════════════
// BioGuard — Simulation Page Controller
// Orchestrates 3D renderer, physics, charts, and UI
// ═══════════════════════════════════════════════════════════════

import SimulationRenderer from '../classes/SimulationRenderer.js';
import UIController from '../classes/UIController.js';
import ChartManager from '../classes/ChartManager.js';
import AnimationManager from '../classes/AnimationManager.js';
import PhysicsEngine from '../classes/PhysicsEngine.js';
import ScenarioLoader from '../classes/ScenarioLoader.js';
import { JOINTS, JOINT_LABELS } from '../utils/constants.js';
import { loadFromStorage, saveToStorage, getRiskColor, formatForce } from '../utils/helpers.js';
import { initNavbarAuth, requireAuth } from '../utils/auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // ── Initialize navbar auth ───────────────────────────────
    initNavbarAuth();
    
    // ── Load Profile ─────────────────────────────────────────
    let profile = loadFromStorage('profile');
    const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true';

    if (!profile) {
        // Default demo profile
        profile = {
            name: 'Demo User',
            age: 30,
            weight: 75,
            height: 175,
            body_type: 'mesomorph',
            health_conditions: []
        };
    }

    // ── Initialize Modules ───────────────────────────────────
    const scenarioLoader = new ScenarioLoader();
    const physics = new PhysicsEngine(profile);
    const charts = new ChartManager();
    const ui = new UIController();
    const anim = new AnimationManager();

    let currentScenario = null;
    let renderer = null;
    let showForceVectors = true;
    let lastAnalysis = null;
    let selectedJoint = "knee";

    // ── Initialize 3D Renderer ───────────────────────────────
    const container3d = document.getElementById('skeleton3d');
    if (container3d && typeof THREE !== 'undefined') {
        try {
            renderer = new SimulationRenderer(container3d);

            renderer.onJointClick = name => { selectedJoint = renderer.jointMeshes[name].userData.category; updateInspector(); };
            new ResizeObserver(() => renderer._onResize()).observe(container3d);
            // Joint hover callback
            renderer.onJointHover = (jointName) => {
                const hudBottom = document.getElementById('hudBottom');
                const hudInfo = document.getElementById('hudJointInfo');
                if (hudBottom && hudInfo && lastAnalysis) {
                    const category = Object.entries(renderer.trackedJoints || {})
                        .find(([cat, names]) => names.includes(jointName));
                    if (category) {
                        const [cat] = category;
                        const force = lastAnalysis.jointForces[cat];
                        const risk = lastAnalysis.riskScores[cat];
                        hudInfo.textContent = `${JOINT_LABELS[cat] || cat}: ${formatForce(force || 0)} | Risk: ${risk || 0}%`;
                        hudBottom.classList.add('visible');
                    }
                }
            };
        } catch (e) {
            console.warn('3D renderer init failed:', e);
            container3d.textContent = '3D unavailable: enable WebGL in your browser. Stress controls and reports still work.';
            renderer = null;
        }
    }

    // ── Initialize Scenario Cards ────────────────────────────
    const scenarioList = document.getElementById('scenarioList');
    const scenarios = scenarioLoader.getAllScenarios();
    
    // Use Fix #2: Safe card generation (XSS)
    const updateScenarioCards = (items) => {
        if (!scenarioList) return;
        scenarioList.innerHTML = '';
        items.forEach(scenario => {
            const card = document.createElement('div');
            card.className = 'scenario-card';
            card.dataset.id = scenario.id;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');

            const icon = document.createElement('div');
            icon.className = 'scenario-icon';
            icon.textContent = scenario.icon;

            const info = document.createElement('div');
            info.className = 'scenario-info';
            
            const name = document.createElement('div');
            name.className = 'scenario-name';
            name.textContent = scenario.name;

            const cat = document.createElement('div');
            cat.className = 'scenario-category';
            cat.textContent = scenario.category;

            info.appendChild(name);
            info.appendChild(cat);
            card.appendChild(icon);
            card.appendChild(info);
            
            card.addEventListener('click', () => onScenarioSelect(scenario.id));
            card.addEventListener('keydown', (e) => { if(e.key === 'Enter') onScenarioSelect(scenario.id); });
            
            scenarioList.appendChild(card);
        });
    };

    updateScenarioCards(scenarios);

    // ── Initialize Category Filters ──────────────────────────
    // Fix #9: Bind select once, use delegation
    const filterContainer = document.getElementById('categoryFilters');
    const categories = scenarioLoader.getCategories();
    
    if (filterContainer) {
        categories.forEach(cat => {
            const pill = document.createElement('button');
            pill.className = `filter-pill ${cat.id === 'all' ? 'active' : ''}`;
            pill.textContent = cat.label.toUpperCase();
            pill.dataset.category = cat.id;
            
            pill.addEventListener('click', () => {
                document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                
                const filtered = scenarioLoader.filterByCategory(cat.id);
                updateScenarioCards(filtered);
            });
            filterContainer.appendChild(pill);
        });
    }

    // ── Scenario Selection Handler ───────────────────────────
    function onScenarioSelect(scenarioId) {
        const scenario = scenarioLoader.loadScenario(scenarioId);
        if (!scenario) return;
        currentScenario = scenario;

        // Update active card state
        document.querySelectorAll('.scenario-card').forEach(c => {
            c.classList.toggle('active', c.dataset.id === scenarioId);
        });

        // Update HUD
        document.getElementById('hudIcon').textContent = currentScenario.icon;
        document.getElementById('hudName').textContent = currentScenario.name;

        // Set slider values to scenario defaults
        ui.setSliderValues(currentScenario.defaultAngles);

        // Pulse the run button
        const runBtn = document.getElementById('runSimBtn');
        if (runBtn) {
            runBtn.classList.add('pulse-ready');
            anim.pulse(runBtn, 1.05);
        }

        // Auto-run simulation
        runSimulation();
    }

    // ── Initialize Sliders ───────────────────────────────────
    ui.initSliders();
    ui.onSliderChange = () => { runSimulation(); };

    // ── Duration Presets ─────────────────────────────────────
    document.querySelectorAll('.duration-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.duration-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const slider = document.getElementById('durationSlider');
            if (slider) {
                slider.value = btn.dataset.value;
                slider.dispatchEvent(new Event('input'));
            }
        });
    });

    // ── Initialize Joint Risk Bars ───────────────────────────
    const jointRisksContainer = document.getElementById('jointRisks');
    if (jointRisksContainer) {
        JOINTS.forEach(joint => {
            const row = document.createElement('div');
            row.className = 'joint-risk-row';
            
            const name = document.createElement('div');
            name.className = 'joint-risk-name';
            name.textContent = JOINT_LABELS[joint];
            
            const bar = document.createElement('div');
            bar.className = 'joint-risk-bar';
            const fill = document.createElement('div');
            fill.className = 'joint-risk-fill';
            fill.id = `risk-${joint}`;
            fill.style.width = '0%';
            bar.appendChild(fill);
            
            const val = document.createElement('div');
            val.className = 'joint-risk-val';
            val.id = `riskval-${joint}`;
            val.textContent = '0';
            
            row.appendChild(name);
            row.appendChild(bar);
            row.appendChild(val);
            jointRisksContainer.appendChild(row);
        });
    }

    // ── Run Simulation ───────────────────────────────────────
    function runSimulation() {
        const formData = ui.getFormData();
        const angles = { trunk: formData.trunk, knee: formData.knee, hip: formData.hip };
        const loadWeight = formData.loadWeight;
        const duration = formData.duration;

        // Run backend physics
        const analysis = physics.getFullAnalysis(angles, loadWeight, duration);
        lastAnalysis = analysis;
        updateInspector();

        // Save session for report
        saveToStorage('lastSession', {
            scenario: currentScenario,
            angles,
            loadWeight,
            duration,
            analysis,
            timestamp: new Date().toISOString()
        });

        // ── Update 3D Viewer ─────────────────────────────────
        if (renderer) {
            renderer.updatePosture(angles);
            renderer.updateJointColors(analysis.riskScores);
            renderer.setStructureMode(document.getElementById("bodyLayer").value);
            renderer.renderForceVectors(analysis.jointForces, showForceVectors);
        }

        // ── Update Gauges ────────────────────────────────────
        ui.updateGauges(analysis.riskScores);

        // ── Update Force Chart ───────────────────────────────
        charts.createBarChart('forceChart', analysis.jointForces);

        // ── Update Risk Display ──────────────────────────────
        ui.updateRiskDisplay(analysis.riskScores);

        // Update per-joint risk bars
        JOINTS.forEach(joint => {
            const fill = document.getElementById(`risk-${joint}`);
            const val = document.getElementById(`riskval-${joint}`);
            const score = analysis.riskScores[joint] || 0;
            if (fill) {
                fill.style.width = `${score}%`;
                fill.style.background = getRiskColor(score);
            }
            if (val) {
                anim.countUp(val, score, 800);
            }
        });

        // ── Show Warnings ────────────────────────────────────
        const warningsContainer = document.getElementById('warningsContainer');
        if (warningsContainer) {
            warningsContainer.innerHTML = '';
            JOINTS.forEach(joint => {
                if (analysis.riskScores[joint] >= 70) {
                    // Use textContent for safety (XSS)
                    const card = document.createElement('div');
                    card.className = 'warning-card';
                    
                    const content = document.createElement('div');
                    content.className = 'warning-content';
                    
                    const title = document.createElement('div');
                    title.className = 'warning-title';
                    title.textContent = JOINT_LABELS[joint];
                    
                    const text = document.createElement('div');
                    text.className = 'warning-text';
                    text.textContent = `High stress detected (${analysis.riskScores[joint]}%). Consider reducing activity duration or modifying posture.`;
                    
                    content.appendChild(title);
                    content.appendChild(text);
                    card.appendChild(content);
                    warningsContainer.appendChild(card);
                }
            });
            if (warningsContainer.innerHTML === '') {
                warningsContainer.innerHTML = '<div class="empty-state">No critical stress detected.</div>';
            }
        }

        // ── Remove pulse from run button ─────────────────────
        const runBtn = document.getElementById('runSimBtn');
        if (runBtn) runBtn.classList.remove('pulse-ready');
    }

    function updateInspector() {
        if (!lastAnalysis) return;
        const force=lastAnalysis.jointForces[selectedJoint], score=lastAnalysis.riskScores[selectedJoint];
        document.getElementById('jointInspector').textContent = (JOINT_LABELS[selectedJoint] || selectedJoint) + ' · ' + Math.round(force) + ' N estimated force · ' + score + '/100 model stress index. Adjust posture and load to compare.';
    }
    document.getElementById('bodyLayer').addEventListener('change', e => renderer?.setStructureMode(e.target.value));
    document.getElementById('vectorsBtn').addEventListener('click', e => { showForceVectors=!showForceVectors; e.target.setAttribute('aria-pressed',showForceVectors); renderer?.renderForceVectors(lastAnalysis?.jointForces,showForceVectors); });
    document.getElementById('rotateBtn').addEventListener('click', e => { if(renderer?.controls) { renderer.controls.autoRotate=!renderer.controls.autoRotate; e.target.setAttribute('aria-pressed',renderer.controls.autoRotate); } });
    document.getElementById('resetPoseBtn').addEventListener('click', () => { ui.setSliderValues({trunk:0,knee:0,hip:0}); currentScenario=null; document.getElementById('hudName').textContent='Custom neutral posture'; document.querySelectorAll('.scenario-card').forEach(c=>c.classList.remove('active')); runSimulation(); });
    document.getElementById('exportDataBtn').addEventListener('click', () => { const url=URL.createObjectURL(new Blob([JSON.stringify(loadFromStorage('lastSession'),null,2)],{type:'application/json'})); const a=document.createElement('a'); a.href=url; a.download='bioguard-session.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); });
    // ── Run Button Click ─────────────────────────────────────
    const runBtn = document.getElementById('runSimBtn');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            ui.showLoading(runBtn);
            setTimeout(() => {
                runSimulation();
                ui.hideLoading(runBtn);
            }, 400);
        });
    }

    // ── Fix-It Mode Toggle ───────────────────────────────────
    const fixitBtn = document.getElementById('fixitBtn');
    if (fixitBtn) {
        fixitBtn.addEventListener('click', () => {
            fixitBtn.classList.toggle('active');
            if (renderer) {
                renderer.updateFixItMode(fixitBtn.classList.contains('active'));
            }
        });
    }

    // ── View Controls ────────────────────────────────────────
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (renderer) renderer.setCameraPosition(btn.dataset.view);
        });
    });

    // ── Mobile Tab System ────────────────────────────────────
    const tabs = document.querySelectorAll('.sim-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const panelId = tab.dataset.panel;
            document.querySelectorAll('.sim-left, .sim-center, .sim-right').forEach(p => {
                p.classList.remove('mobile-visible');
            });
            
            const target = document.getElementById(`panel${panelId.charAt(0).toUpperCase() + panelId.slice(1)}`);
            if (target) target.classList.add('mobile-visible');
        });
    });

    // ── Auto-run demo if demo mode ───────────────────────────
    onScenarioSelect('sitting_desk');
});
