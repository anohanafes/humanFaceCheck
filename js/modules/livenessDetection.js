/**
 * 活体检测模块 - 张嘴和摇头检测
 */

import { state, config, resetLivenessState } from './config.js';

/**
 * 张嘴检测 - 基于嘴部关键点
 */
export function detectMouthOpen(landmarks) {
    if (!landmarks || landmarks.length < 68) return false;

    const upperLip = landmarks[51];
    const lowerLip = landmarks[57];
    const leftCorner = landmarks[48];
    const rightCorner = landmarks[54];

    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
    const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);

    if (mouthWidth === 0) return false;

    const mouthRatio = mouthHeight / mouthWidth;

    if (state.mouthBaseline === null || mouthRatio < state.mouthBaseline) {
        state.mouthBaseline = mouthRatio;
    }

    const OPEN_THRESHOLD = 0.4;
    const isOpen = mouthRatio > OPEN_THRESHOLD || 
                   (state.mouthBaseline && mouthRatio > state.mouthBaseline * 2.5);

    if (state.isLivenessActive && state.livenessStep === 0 && Math.random() < 0.1) {
        console.log(`张嘴检测: ratio=${mouthRatio.toFixed(3)}, 基线=${state.mouthBaseline?.toFixed(3) || 'N/A'}, 状态=${isOpen ? '张嘴' : '闭嘴'}`);
    }

    const now = Date.now();

    if (isOpen && !state.mouthWasOpen) {
        state.mouthWasOpen = true;
        if (state.isLivenessActive && state.livenessStep === 0) {
            const instruction = document.getElementById('liveness-instruction');
            if (instruction) {
                instruction.textContent = `检测到张嘴... (${state.mouthOpenCount}/${config.requiredMouthOpens})`;
            }
        }
    } else if (!isOpen && state.mouthWasOpen) {
        state.mouthWasOpen = false;
        if (now - state.lastMouthOpenTime > 500) {
            console.log(`✓ 张嘴确认: ratio=${mouthRatio.toFixed(3)}`);
            state.lastMouthOpenTime = now;
            if (state.isLivenessActive && state.livenessStep === 0) {
                const instruction = document.getElementById('liveness-instruction');
                if (instruction) {
                    instruction.textContent = `张嘴成功! (${state.mouthOpenCount + 1}/${config.requiredMouthOpens})`;
                }
            }
            return true;
        }
    }

    return false;
}

/**
 * 摇头检测 - 固定阈值 + 动态基线
 */
export function detectHeadShake(landmarks, faceBox) {
    if (!landmarks || landmarks.length < 68 || !faceBox) return false;

    const noseX = landmarks[30].x;
    const leftEyeX = landmarks[36].x;
    const rightEyeX = landmarks[45].x;

    const leftDist = noseX - leftEyeX;
    const rightDist = rightEyeX - noseX;

    if (leftDist <= 0 || rightDist <= 0) return false;

    const ratio = leftDist / rightDist;

    if (state.ratioBaseline === null || (ratio > 0.85 && ratio < 1.15)) {
        state.ratioBaseline = ratio;
    }

    const RIGHT_TURN_THRESHOLD = 1.5;
    const LEFT_TURN_THRESHOLD = 0.67;

    if (state.isLivenessActive && state.livenessStep === 1 && Math.random() < 0.1) {
        console.log(`摇头检测: Ratio=${ratio.toFixed(2)}, 基线=${state.ratioBaseline?.toFixed(2) || 'N/A'}`);
    }

    let currentDirection = 0;

    if (ratio > RIGHT_TURN_THRESHOLD) {
        currentDirection = 1;
    } else if (ratio < LEFT_TURN_THRESHOLD) {
        currentDirection = -1;
    }

    if (currentDirection !== 0 && currentDirection !== state.headShakeDirection) {
        const now = Date.now();

        if (state.shakeSequence.length > 0) {
            const lastActionTime = state.shakeSequence[state.shakeSequence.length - 1].time || 0;
            if (now - lastActionTime > 3000) {
                state.shakeSequence = [];
                console.log('动作间隔太久，重置摇头序列');
            }
        }

        const lastDir = state.shakeSequence.length > 0 ? 
                        state.shakeSequence[state.shakeSequence.length - 1].dir : 0;

        if (currentDirection !== lastDir) {
            state.shakeSequence.push({ dir: currentDirection, time: now });
            state.headShakeDirection = currentDirection;

            if (state.isLivenessActive && state.livenessStep === 1) {
                const instruction = document.getElementById('liveness-instruction');
                if (instruction) {
                    const directionText = currentDirection === 1 ? '向右' : '向左';
                    instruction.textContent = `检测到头部${directionText}转动...`;
                }
            }

            if (state.shakeSequence.length >= 2) {
                const dirs = state.shakeSequence.map(s => s.dir);
                for (let i = 0; i < dirs.length - 1; i++) {
                    if (dirs[i] !== dirs[i + 1] && dirs[i] !== 0 && dirs[i + 1] !== 0) {
                        console.log(`✓ 摇头确认: 序列=${dirs.join(',')}`);
                        state.shakeSequence = [];
                        state.lastShakeTime = now;
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

/**
 * 启动活体检测
 */
export function startLivenessDetection() {
    state.isLivenessActive = true;
    state.livenessStep = 0;
    state.mouthOpenCount = 0;
    state.mouthWasOpen = false;
    state.mouthBaseline = null;
    state.lastMouthOpenTime = 0;
    state.shakeCount = 0;
    state.headShakeDirection = 0;
    state.shakeSequence = [];
    state.ratioBaseline = null;

    const livenessGuide = document.getElementById('liveness-guide');
    const faceGuide = document.getElementById('face-guide');

    livenessGuide.classList.remove('display-none');
    faceGuide.classList.add('display-none');

    updateLivenessUI();
}

/**
 * 更新活体检测界面
 */
export function updateLivenessUI() {
    const instruction = document.getElementById('liveness-instruction');
    const progressBar = document.getElementById('liveness-progress-bar');
    const stepMouth = document.getElementById('step-mouth');
    const stepShake = document.getElementById('step-shake');
    const stepNod = document.getElementById('step-nod');

    [stepMouth, stepShake, stepNod].forEach(step => {
        if (step) step.classList.remove('active', 'completed');
    });

    let progress = 0;

    switch (state.livenessStep) {
        case 0:
            instruction.textContent = `请张嘴 (${state.mouthOpenCount}/${config.requiredMouthOpens})`;
            instruction.classList.add('pulse');
            if (stepMouth) stepMouth.classList.add('active');
            progress = (state.mouthOpenCount / config.requiredMouthOpens) * 40;
            break;

        case 1:
            instruction.textContent = `请左右转头 (${state.shakeCount}/${config.requiredShakes})`;
            instruction.classList.add('pulse');
            if (stepMouth) stepMouth.classList.add('completed');
            if (stepShake) stepShake.classList.add('active');
            progress = 40 + (state.shakeCount / config.requiredShakes) * 40;
            break;

        case 2:
            instruction.textContent = '活体验证通过，正在进行身份验证...';
            instruction.classList.remove('pulse');
            if (stepMouth) stepMouth.classList.add('completed');
            if (stepShake) stepShake.classList.add('completed');
            if (stepNod) stepNod.classList.add('active');
            progress = 100;
            break;
    }

    progressBar.style.width = progress + '%';
}

/**
 * 处理活体检测逻辑
 */
export function processLivenessDetection(landmarks, faceBox) {
    if (!state.isLivenessActive || !landmarks) {
        return false;
    }

    switch (state.livenessStep) {
        case 0:
            if (detectMouthOpen(landmarks)) {
                state.mouthOpenCount++;
                console.log(`✓ 张嘴检测成功! 当前次数: ${state.mouthOpenCount}/${config.requiredMouthOpens}`);
                if (state.mouthOpenCount >= config.requiredMouthOpens) {
                    state.livenessStep = 1;
                    console.log('✓ 张嘴验证完成，进入摇头检测阶段');
                    state.headShakeDirection = 0;
                    state.shakeSequence = [];
                    state.ratioBaseline = null;
                }
                updateLivenessUI();
            }
            break;

        case 1:
            if (detectHeadShake(landmarks, faceBox)) {
                state.shakeCount++;
                console.log(`✓ 摇头检测成功! 当前次数: ${state.shakeCount}/${config.requiredShakes}`);
                if (state.shakeCount >= config.requiredShakes) {
                    state.livenessStep = 2;
                    console.log('✓ 摇头验证完成，活体检测即将完成');
                    setTimeout(() => {
                        completeLivenessDetection();
                    }, 1000);
                }
                updateLivenessUI();
            }
            break;

        case 2:
            return true;
    }

    return false;
}

/**
 * 完成活体检测
 */
export function completeLivenessDetection() {
    state.isLivenessActive = false;

    const livenessGuide = document.getElementById('liveness-guide');
    const faceGuide = document.getElementById('face-guide');

    livenessGuide.classList.add('display-none');
    faceGuide.classList.remove('display-none');

    document.getElementById('status').textContent = "活体验证通过！请保持面部在框内，系统正在验证身份...";
}

/**
 * 重置活体检测
 */
export function resetLivenessDetection() {
    resetLivenessState();
    const livenessGuide = document.getElementById('liveness-guide');
    livenessGuide.classList.add('display-none');
}

// 导出调试接口
export const livenessDebug = {
    skipAll: () => {
        if (state.isLivenessActive) {
            completeLivenessDetection();
            console.log('跳过所有活体检测');
        }
    }
};
