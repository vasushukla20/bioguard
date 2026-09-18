// ═══════════════════════════════════════════════════════════════
// BioGuard — Report Page Controller
// Renders the full analysis report from saved session data
// ═══════════════════════════════════════════════════════════════

import ChartManager from '../classes/ChartManager.js';
import AnimationManager from '../classes/AnimationManager.js';
import { JOINTS, JOINT_LABELS, JOINT_SAFE_LIMITS } from '../utils/constants.js';
import { loadFromStorage, getRiskColor, getRiskLevel, formatForce, formatDuration } from '../utils/helpers.js';
import { initNavbarAuth } from '../utils/auth.js';

document.addEventListener('DOMContentLoaded', () => {
    // ── Initialize navbar auth ───────────────────────────────
    initNavbarAuth();
    
    const charts = new ChartManager();
    const anim = new AnimationManager();
    // Report data is loaded from localStorage (saved by simulation page)

    // ── Load Session Data ────────────────────────────────────
    const session = loadFromStorage('lastSession');
    const profile = loadFromStorage('profile');

    if (!session || !session.analysis) {
        // No data — show placeholder
        const container = document.querySelector('.report-container');
        if (container) {
            container.innerHTML = ''; // Clear
            const placeholder = document.createElement('div');
            placeholder.style.textAlign = 'center';
            placeholder.style.padding = '120px 24px';
            
            const icon = document.createElement('div');
            icon.style.fontSize = '64px';
            icon.style.marginBottom = '24px';
            icon.style.opacity = '0.3';
            icon.textContent = '📋';
            
            const title = document.createElement('h2');
            title.style.fontFamily = 'var(--font-display)';
            title.style.color = 'var(--text-dim)';
            title.style.letterSpacing = '3px';
            title.style.marginBottom = '16px';
            title.textContent = 'NO REPORT DATA';
            
            const text = document.createElement('p');
            text.style.color = 'var(--text-muted)';
            text.style.marginBottom = '32px';
            text.style.fontFamily = 'var(--font-mono)';
            text.style.fontSize = '12px';
            text.style.letterSpacing = '1px';
            text.textContent = 'Run a simulation first to generate a report.';
            
            const link = document.createElement('a');
            link.href = 'simulation.html';
            link.className = 'btn btn-primary';
            link.textContent = '▶ GO TO SIMULATION';
            
            placeholder.appendChild(icon);
            placeholder.appendChild(title);
            placeholder.appendChild(text);
            placeholder.appendChild(link);
            container.appendChild(placeholder);
        }
        return;
    }

    const { analysis, scenario, angles, loadWeight, duration, timestamp } = session;
    const { jointForces, riskScores, longTermProjection, recommendations, riskLevel, profileSummary } = analysis;

    // ── Report Header ────────────────────────────────────────
    const ts = document.getElementById('reportTimestamp');
    if (ts) {
        const date = new Date(timestamp);
        ts.textContent = `Generated: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
    }

    // ── Profile Summary ──────────────────────────────────────
    const rp = profileSummary || {};
    setText('rpName', rp.name || 'User');
    setText('rpAge', rp.age || '—');
    setText('rpBMI', rp.bmi ? rp.bmi.toFixed(1) : '—');
    setText('rpBodyType', (rp.bodyType || '—').charAt(0).toUpperCase() + (rp.bodyType || '').slice(1));

    // ── Simulation Summary ───────────────────────────────────
    // Modernized: No emojis in scenario name
    const scenarioName = scenario ? scenario.name : 'Custom Setup';
    setText('ssScenario', scenarioName);
    setText('ssDuration', formatDuration(duration || 60));
    setText('ssLoad', `${loadWeight || 0} kg`);
    setText('ssAngles', angles ? `T:${angles.trunk}° K:${angles.knee}° H:${angles.hip}°` : '—');

    // Overall risk
    const rbScore = document.getElementById('rbScore');
    if (rbScore) anim.countUp(rbScore, riskScores.overall, 1500);

    const rbBadge = document.getElementById('rbBadge');
    if (rbBadge) {
        rbBadge.className = `status-badge ${riskLevel}`;
        rbBadge.textContent = riskLevel.toUpperCase();
    }

    // ── Joint Accordion ──────────────────────────────────────
    const accordion = document.getElementById('jointAccordion');
    if (accordion) {
        accordion.innerHTML = ''; // Clear previous
        JOINTS.forEach(joint => {
            const score = riskScores[joint] || 0;
            const force = jointForces[joint] || 0;
            const level = getRiskLevel(score);
            const safeLimit = JOINT_SAFE_LIMITS[joint];
            const utilization = Math.round((force / safeLimit) * 100);

            // Joint-specific recommendations
            const jointRecs = recommendations?.filter(r => {
                const jLabel = JOINT_LABELS[joint].toLowerCase();
                return r.toLowerCase().includes(jLabel) || r.toLowerCase().includes(joint);
            }) || [];

            const item = document.createElement('div');
            item.className = 'accordion-item';
            
            const header = document.createElement('button');
            header.className = 'accordion-header';
            
            const info = document.createElement('div');
            info.className = 'joint-header-info';
            
            const dot = document.createElement('div');
            dot.className = 'joint-status-dot';
            dot.style.background = level.color;
            dot.style.boxShadow = `0 0 8px ${level.glow}`;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'joint-header-name';
            nameSpan.textContent = JOINT_LABELS[joint];
            
            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'joint-header-score';
            scoreSpan.style.color = level.color;
            scoreSpan.textContent = `${score}% risk`;
            
            const arrow = document.createElement('span');
            arrow.className = 'accordion-arrow';
            arrow.textContent = '▼';
            
            info.appendChild(dot);
            info.appendChild(nameSpan);
            info.appendChild(scoreSpan);
            header.appendChild(info);
            header.appendChild(arrow);
            
            const body = document.createElement('div');
            body.className = 'accordion-body';
            
            const content = document.createElement('div');
            content.className = 'accordion-content';
            
            const grid = document.createElement('div');
            grid.className = 'joint-detail-grid';
            
            const createDetail = (label, value, color) => {
                const d = document.createElement('div');
                d.className = 'joint-detail-item';
                const l = document.createElement('div');
                l.className = 'joint-detail-label';
                l.textContent = label;
                const v = document.createElement('div');
                v.className = 'joint-detail-value';
                v.textContent = value;
                if (color) v.style.color = color;
                d.appendChild(l);
                d.appendChild(v);
                return d;
            };
            
            grid.appendChild(createDetail('Force Applied', formatForce(force)));
            grid.appendChild(createDetail('Risk Score', `${score}/100`, level.color));
            grid.appendChild(createDetail('Safe Limit', formatForce(safeLimit)));
            grid.appendChild(createDetail('Utilization', `${utilization}%`, utilization > 80 ? '#ff3b3b' : utilization > 50 ? '#ffd700' : '#00ff88'));
            
            const statusItem = document.createElement('div');
            statusItem.className = 'joint-detail-item';
            statusItem.style.marginTop = '8px';
            const statusLabel = document.createElement('div');
            statusLabel.className = 'joint-detail-label';
            statusLabel.textContent = 'Status';
            const badge = document.createElement('div');
            badge.className = `status-badge ${level.label.toLowerCase().replace(' ', '-')}`;
            badge.style.marginTop = '6px';
            badge.textContent = level.label.toUpperCase();
            statusItem.appendChild(statusLabel);
            statusItem.appendChild(badge);
            
            content.appendChild(grid);
            content.appendChild(statusItem);
            
            if (jointRecs.length > 0) {
                const recsWrap = document.createElement('div');
                recsWrap.className = 'joint-detail-recs';
                recsWrap.style.marginTop = '12px';
                const recsLabel = document.createElement('div');
                recsLabel.className = 'joint-detail-label';
                recsLabel.style.marginBottom = '6px';
                recsLabel.textContent = 'Specific Recommendations';
                recsWrap.appendChild(recsLabel);
                
                jointRecs.forEach(r => {
                    const rDiv = document.createElement('div');
                    rDiv.style.padding = '4px 0';
                    rDiv.style.fontSize = '12px';
                    rDiv.style.color = 'var(--text-dim)';
                    rDiv.textContent = r;
                    recsWrap.appendChild(rDiv);
                });
                content.appendChild(recsWrap);
            }
            
            body.appendChild(content);
            item.appendChild(header);
            item.appendChild(body);

            header.addEventListener('click', () => {
                item.classList.toggle('open');
            });

            accordion.appendChild(item);
        });

        // Auto-open the highest risk joint
        const highestJoint = JOINTS.reduce((a, b) => (riskScores[a] > riskScores[b] ? a : b));
        const items = accordion.querySelectorAll('.accordion-item');
        const highIdx = JOINTS.indexOf(highestJoint);
        if (items[highIdx]) items[highIdx].classList.add('open');
    }

    // ── Projection Chart ─────────────────────────────────────
    if (longTermProjection) {
        // Find top 3 at-risk joints
        const topJoints = [...JOINTS]
            .sort((a, b) => (riskScores[b] || 0) - (riskScores[a] || 0))
            .slice(0, 3);

        const chartJoints = ['overall', ...topJoints];
        const projData = {
            ...longTermProjection,
            currentScores: riskScores
        };

        charts.createLineChart('projectionChart', projData, chartJoints);
    }

    // ── Recommendations ──────────────────────────────────────
    const recsList = document.getElementById('recommendationsList');
    if (recsList && recommendations) {
        recsList.innerHTML = ''; // Clear previous
        recommendations.forEach(rec => {
            const card = document.createElement('div');
            const isDanger = rec.includes('CRITICAL') || rec.includes('HIGH RISK');
            const isWarning = rec.includes('⚠️') || rec.includes('MODERATE');
            card.className = `recommendation-card${isDanger ? ' danger' : isWarning ? ' warning' : ''}`;

            // Modernized: No emojis in text
            const textContent = rec.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
            
            const iconSpan = document.createElement('span');
            iconSpan.className = 'rec-icon';
            iconSpan.textContent = isDanger ? '!' : isWarning ? '?' : '*';
            
            const textSpan = document.createElement('span');
            textSpan.className = 'rec-text';
            textSpan.textContent = textContent;

            card.appendChild(iconSpan);
            card.appendChild(textSpan);
            recsList.appendChild(card);
        });

        // Stagger animation
        anim.staggerIn(recsList, '.recommendation-card', 80, 'left');
    }

    // ── Download PDF ─────────────────────────────────────────
    const pdfBtn = document.getElementById('btnDownloadPdf');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', () => {
            pdfBtn.classList.add('loading');
            const originalText = pdfBtn.textContent;
            pdfBtn.textContent = '';

            setTimeout(() => {
                pdfBtn.classList.remove('loading');
                pdfBtn.textContent = originalText;
                window.print();
            }, 800);
        });
    }

    // ── Share Report ─────────────────────────────────────────
    const shareBtn = document.getElementById('btnShareReport');
    if (shareBtn) {
        shareBtn.textContent = 'EXPORT REPORT DATA';
        shareBtn.addEventListener('click', () => {
            const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
            const a=document.createElement('a'); a.href=url; a.download='bioguard-report.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
        });
    }

    // ── Helper ───────────────────────────────────────────────
    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
});
