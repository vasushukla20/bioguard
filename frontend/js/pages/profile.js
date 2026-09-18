// ═══════════════════════════════════════════════════════════════
// BioGuard — Profile Page Controller
// ═══════════════════════════════════════════════════════════════

import { HEALTH_CONDITIONS } from '../utils/constants.js';
import { saveToStorage, loadFromStorage, calculateBMI } from '../utils/helpers.js';
import { initNavbarAuth, requireAuth, getCurrentUser } from '../utils/auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // ── Initialize navbar auth ───────────────────────────────
    initNavbarAuth();
    
    // ── Get current user ─────────────────────────────────────
    const user = getCurrentUser();
    
    // ── Load existing profile if any ─────────────────────────
    const existingProfile = loadFromStorage('profile');
    
    // Profile state is managed locally and saved to localStorage
    const state = {
        name: existingProfile?.name || user?.name || '',
        age: existingProfile?.age || 25,
        weight: existingProfile?.weight || 70,
        height: existingProfile?.height || 170,
        body_type: existingProfile?.body_type || '',
        health_conditions: existingProfile?.health_conditions || []
    };

    // ── Form Prevention ──────────────────────────────────────
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', (e) => e.preventDefault());
    }

    // ── Initialize Sliders ───────────────────────────────────
    document.querySelectorAll('.range-slider').forEach(slider => {
        const container = slider.closest('.slider-container');
        const valueEl = container?.querySelector('.slider-value');
        const bubble = container?.querySelector('.slider-bubble');
        const suffix = slider.dataset.suffix || '';
        const field = {ageSlider:'age',weightSlider:'weight',heightSlider:'height'}[slider.id];
        if (field) slider.value=state[field];

        const update = () => {
            const val = slider.value;
            if (valueEl) valueEl.textContent = val + suffix;
            if (bubble) {
                const pct = (val - slider.min) / (slider.max - slider.min);
                bubble.style.left = (pct * slider.offsetWidth) + 'px';
                bubble.textContent = val + suffix;
            }
            const percent = ((val - slider.min) / (slider.max - slider.min)) * 100;
            slider.style.background = `linear-gradient(90deg, #00f5ff ${percent}%, #111d32 ${percent}%)`;
        };

        slider.addEventListener('input', () => {
            update();
            // Update state
            if (slider.id === 'ageSlider') state.age = parseInt(slider.value);
            if (slider.id === 'weightSlider') state.weight = parseInt(slider.value);
            if (slider.id === 'heightSlider') state.height = parseInt(slider.value);
            updateSilhouette();
            updateProgress();
        });

        update();
    });

    // ── Name Input ───────────────────────────────────────────
    const nameInput = document.getElementById('nameInput');
    if (nameInput) {
        // Pre-populate if we have existing data
        if (state.name) {
            nameInput.value = state.name;
        }
        nameInput.addEventListener('input', () => {
            state.name = nameInput.value.trim();
            updateProgress();
        });
    }
    
    // ── Body Type Cards ──────────────────────────────────────
    document.querySelectorAll('.body-type-card').forEach(card => {
        // Pre-select if existing profile
        if (state.body_type && card.dataset.type === state.body_type) {
            card.classList.add('selected');
            card.setAttribute('aria-checked', 'true');
            const label = document.getElementById('bodyTypeLabel');
            if (label) label.textContent = state.body_type.toUpperCase();
        }
        
        card.addEventListener('click', () => {
            document.querySelectorAll('.body-type-card').forEach(c => {
                c.classList.remove('selected');
                c.setAttribute('aria-checked', 'false');
            });
            card.classList.add('selected');
            card.setAttribute('aria-checked', 'true');
            state.body_type = card.dataset.type;
            const label = document.getElementById('bodyTypeLabel');
            if (label) label.textContent = card.dataset.type.toUpperCase();
            updateSilhouette();
            updateProgress();
        });
    });

    // ── Health Condition Chips ────────────────────────────────
    const chipsContainer = document.getElementById('healthChips');
    if (chipsContainer) {
        HEALTH_CONDITIONS.forEach(cond => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'health-chip';
            chip.dataset.condition = cond.id;
            chip.textContent = cond.name; // Use textContent for safety and clean look
            
            // Pre-select if existing profile
            if (state.health_conditions.includes(cond.id)) {
                chip.classList.add('active');
            }

            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                if (chip.classList.contains('active')) {
                    if (!state.health_conditions.includes(cond.id)) {
                        state.health_conditions.push(cond.id);
                    }
                } else {
                    state.health_conditions = state.health_conditions.filter(c => c !== cond.id);
                }
                updateConditionHighlights();
                updateProgress();
            });

            chipsContainer.appendChild(chip);
        });
        
        // Update condition highlights if pre-existing
        if (state.health_conditions.length > 0) {
            updateConditionHighlights();
        }
    }

    // ── Body Silhouette Drawing ──────────────────────────────
    const silCanvas = document.getElementById('silhouetteCanvas');
    const silCtx = silCanvas?.getContext('2d');
    let breathPhase = 0;

    function updateSilhouette() {
        if (!silCtx) return;
        const w = silCanvas.width;
        const h = silCanvas.height;
        silCtx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const breathOffset = Math.sin(breathPhase) * 1.5;

        // Body proportions based on type
        let shoulderW = 40, hipW = 30, waistW = 26, legGap = 14;
        if (state.body_type === 'ectomorph') {
            shoulderW = 32; hipW = 24; waistW = 20; legGap = 12;
        } else if (state.body_type === 'endomorph') {
            shoulderW = 48; hipW = 42; waistW = 38; legGap = 18;
        }

        // Draw body outline
        silCtx.strokeStyle = '#e8e0d0';
        silCtx.lineWidth = 2;
        silCtx.shadowBlur = 10;
        silCtx.shadowColor = '#e8e0d0';
        silCtx.globalAlpha = 0.8;

        // Head
        const headY = 50;
        const headR = 20;
        silCtx.beginPath();
        silCtx.arc(cx, headY, headR, 0, Math.PI * 2);
        silCtx.stroke();

        // Neck
        silCtx.beginPath();
        silCtx.moveTo(cx - 6, headY + headR);
        silCtx.lineTo(cx - 6, headY + headR + 15);
        silCtx.moveTo(cx + 6, headY + headR);
        silCtx.lineTo(cx + 6, headY + headR + 15);
        silCtx.stroke();

        // Torso
        const shoulderY = headY + headR + 15 + breathOffset;
        const waistY = shoulderY + 80;
        const hipY = waistY + 25;

        silCtx.beginPath();
        // Left side
        silCtx.moveTo(cx - shoulderW, shoulderY);
        silCtx.quadraticCurveTo(cx - waistW - 2, shoulderY + 40, cx - waistW, waistY);
        silCtx.quadraticCurveTo(cx - hipW + 2, waistY + 10, cx - hipW, hipY);
        // Right side
        silCtx.moveTo(cx + shoulderW, shoulderY);
        silCtx.quadraticCurveTo(cx + waistW + 2, shoulderY + 40, cx + waistW, waistY);
        silCtx.quadraticCurveTo(cx + hipW - 2, waistY + 10, cx + hipW, hipY);
        // Bottom
        silCtx.moveTo(cx - hipW, hipY);
        silCtx.lineTo(cx + hipW, hipY);
        // Shoulders
        silCtx.moveTo(cx - shoulderW, shoulderY);
        silCtx.lineTo(cx + shoulderW, shoulderY);
        silCtx.stroke();

        // Arms
        const armLen = 100;
        silCtx.beginPath();
        // Left arm
        silCtx.moveTo(cx - shoulderW, shoulderY);
        silCtx.quadraticCurveTo(cx - shoulderW - 10, shoulderY + armLen * 0.5, cx - shoulderW - 5, shoulderY + armLen);
        // Right arm
        silCtx.moveTo(cx + shoulderW, shoulderY);
        silCtx.quadraticCurveTo(cx + shoulderW + 10, shoulderY + armLen * 0.5, cx + shoulderW + 5, shoulderY + armLen);
        silCtx.stroke();

        // Legs
        const legTop = hipY;
        const kneeY = legTop + 80;
        const ankleY = kneeY + 80;

        silCtx.beginPath();
        // Left leg
        silCtx.moveTo(cx - legGap, legTop);
        silCtx.lineTo(cx - legGap - 3, kneeY);
        silCtx.lineTo(cx - legGap - 1, ankleY);
        // Foot
        silCtx.lineTo(cx - legGap - 12, ankleY + 10);
        // Right leg
        silCtx.moveTo(cx + legGap, legTop);
        silCtx.lineTo(cx + legGap + 3, kneeY);
        silCtx.lineTo(cx + legGap + 1, ankleY);
        // Foot
        silCtx.lineTo(cx + legGap + 12, ankleY + 10);
        silCtx.stroke();

        // Highlight joints affected by conditions
        const highlightedJoints = new Set();
        state.health_conditions.forEach(condId => {
            const cond = HEALTH_CONDITIONS.find(h => h.id === condId);
            if (cond && cond.affected) {
                cond.affected.forEach(j => highlightedJoints.add(j));
            }
        });

        const jointMap = {
            knee: [{ x: cx - legGap - 3, y: kneeY }, { x: cx + legGap + 3, y: kneeY }],
            hip: [{ x: cx - hipW, y: hipY }, { x: cx + hipW, y: hipY }],
            shoulder: [{ x: cx - shoulderW, y: shoulderY }, { x: cx + shoulderW, y: shoulderY }],
            spine: [{ x: cx, y: waistY - 20 }],
            ankle: [{ x: cx - legGap - 1, y: ankleY }, { x: cx + legGap + 1, y: ankleY }]
        };

        highlightedJoints.forEach(joint => {
            const positions = jointMap[joint] || [];
            positions.forEach(pos => {
                const pulse = Math.sin(breathPhase * 3) * 0.3 + 0.7;
                silCtx.globalAlpha = pulse;
                silCtx.fillStyle = '#ffd700';
                silCtx.shadowColor = '#ffd700';
                silCtx.shadowBlur = 15;
                silCtx.beginPath();
                silCtx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
                silCtx.fill();
            });
        });

        silCtx.globalAlpha = 1;
        silCtx.shadowBlur = 0;
    }

    // Breathing animation
    function animateBreath() {
        breathPhase += 0.02;
        updateSilhouette();
        requestAnimationFrame(animateBreath);
    }
    animateBreath();

    // ── Condition Highlights ─────────────────────────────────
    function updateConditionHighlights() {
        const container = document.getElementById('conditionHighlights');
        if (!container) return;
        container.innerHTML = '';
        state.health_conditions.forEach(condId => {
            const cond = HEALTH_CONDITIONS.find(h => h.id === condId);
            if (cond) {
                const el = document.createElement('div');
                el.className = 'condition-highlight';
                el.textContent = cond.name; // Use textContent for safety
                container.appendChild(el);
            }
        });
    }

    // ── Progress Tracking ────────────────────────────────────
    function updateProgress() {
        let progress = 0;

        // Basic info: 40%
        const basicFilled = (state.name.length > 0 ? 1 : 0) + 1 + 1 + 1; // name + age + weight + height
        progress += (Math.min(basicFilled, 4) / 4) * 40;

        // Body type: 30%
        if (state.body_type) progress += 30;

        // Health: 30%
        progress += 30; // Health conditions are optional.

        // Update progress bar
        const fill = document.getElementById('progressFill');
        if (fill) fill.style.width = `${progress}%`;

        // Update step indicators
        const step1 = document.getElementById('step1');
        const step2 = document.getElementById('step2');
        const step3 = document.getElementById('step3');
        const conn1 = document.getElementById('conn1');
        const conn2 = document.getElementById('conn2');

        if (state.name.length > 0) {
            if (step1) { step1.classList.add('done'); step1.classList.remove('active'); }
            if (conn1) conn1.classList.add('done');
            if (step2) step2.classList.add('active');
        }
        if (state.body_type) {
            if (step2) { step2.classList.add('done'); step2.classList.remove('active'); }
            if (conn2) conn2.classList.add('done');
            if (step3) step3.classList.add('active');
        }
        if (state.health_conditions.length > 0) {
            if (step3) { step3.classList.add('done'); step3.classList.remove('active'); }
        }

        // Enable submit button
        const btn = document.getElementById('btnSubmit');
        const canSubmit = state.name.length > 0 && state.body_type;
        if (btn) btn.disabled = !canSubmit;
    }

    // ── Submit ───────────────────────────────────────────────
    const submitBtn = document.getElementById('btnSubmit');
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            if (submitBtn.disabled) return;
            
            // Save to backend via ProfileManager if possible, or fallback to storage
            try {
                // In a real scenario, we might use profileManager.createProfile(state)
                // For this implementation, we ensure it's saved for the simulation page
                saveToStorage('profile', state);
            } catch (err) {
                console.error('Backend save failed:', err);
                saveToStorage('profile', state);
            }

            // Animate button
            submitBtn.classList.add('loading');
            submitBtn.textContent = '';
            setTimeout(() => {
                window.location.href = 'simulation.html';
            }, 800);
        });
    }

    // Initial state
    updateSilhouette();
    updateProgress();
});
