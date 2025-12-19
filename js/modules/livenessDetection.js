/**
 * 活体检测模块 - 张嘴和摇头检测
 */

import { state, config, resetLivenessState } from './config.js';

/**
 * 张嘴检测 - 基于嘴部关键点
 * 简化逻辑：检测到张嘴状态持续一段时间即可
 */
export function detectMouthOpen(landmarks) {
    if (!landmarks || landmarks.length < 68) return false;

    // 使用嘴巴外轮廓计算张嘴程度
    const upperLip = landmarks[51];         // 上唇中点
    const lowerLip = landmarks[57];         // 下唇中点
    const leftCorner = landmarks[48];
    const rightCorner = landmarks[54];

    // 计算嘴巴整体高度（上唇到下唇）
    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
    const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);

    if (mouthWidth === 0) return false;

    const mouthRatio = mouthHeight / mouthWidth;

    const now = Date.now();

    // 如果正在切换步骤，不处理
    if (state.livenessTransitioning) {
        return false;
    }

    if (!state.isLivenessActive || state.livenessStep !== 0) {
        return false;
    }

    const instruction = document.getElementById('liveness-instruction');
    
    // 使用配置的阈值
    const isOpen = mouthRatio > config.mouthOpenThreshold;
    
    if (isOpen) {
        if (!state.mouthWasOpen) {
            // 刚检测到张嘴
            state.mouthWasOpen = true;
            state.mouthOpenStartTime = now;
            if (instruction) {
                instruction.textContent = '检测到张嘴，请保持...';
            }
        } else {
            // 持续张嘴超过配置的时间算成功
            const elapsed = now - state.mouthOpenStartTime;
            if (elapsed > config.mouthOpenDuration) {
                state.mouthWasOpen = false;
                state.lastMouthOpenTime = now;
                return true;
            }
        }
    } else {
        // 闭嘴了，重置状态
        state.mouthWasOpen = false;
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

    // 使用配置的阈值
    let currentDirection = 0;

    if (ratio > config.headShakeThreshold.right) {
        currentDirection = 1;
    } else if (ratio < config.headShakeThreshold.left) {
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
            // 设置初始提示，后续由 detectMouthOpen 动态更新
            if (!state.mouthWasOpen) {
                instruction.textContent = '请张嘴';
            }
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
                    // 设置切换标志，防止提示被覆盖
                    state.livenessTransitioning = true;
                    
                    // 显示张嘴成功提示
                    const instruction = document.getElementById('liveness-instruction');
                    const stepMouth = document.getElementById('step-mouth');
                    const progressBar = document.getElementById('liveness-progress-bar');
                    
                    if (instruction) {
                        instruction.textContent = '✓ 张嘴验证成功！';
                        instruction.style.color = '#00ff99';
                        instruction.classList.remove('pulse');
                    }
                    if (stepMouth) {
                        stepMouth.classList.remove('active');
                        stepMouth.classList.add('completed');
                    }
                    if (progressBar) {
                        progressBar.style.width = '40%';
                    }
                    
                    // 延迟 1 秒进入下一步
                    setTimeout(() => {
                        state.livenessTransitioning = false;
                        if (instruction) {
                            instruction.style.color = '';
                        }
                        state.livenessStep = 1;
                        state.headShakeDirection = 0;
                        state.shakeSequence = [];
                        state.ratioBaseline = null;
                        updateLivenessUI();
                    }, 1000);
                } else {
                    updateLivenessUI();
                }
            }
            break;

        case 1:
            if (detectHeadShake(landmarks, faceBox)) {
                state.shakeCount++;
                if (state.shakeCount >= config.requiredShakes) {
                    // 设置切换标志
                    state.livenessTransitioning = true;
                    
                    // 显示摇头成功提示
                    const instruction = document.getElementById('liveness-instruction');
                    const stepShake = document.getElementById('step-shake');
                    
                    if (instruction) {
                        instruction.textContent = '✓ 转头验证成功！';
                        instruction.style.color = '#00ff99';
                        instruction.classList.remove('pulse');
                    }
                    if (stepShake) {
                        stepShake.classList.remove('active');
                        stepShake.classList.add('completed');
                    }
                    
                    state.livenessStep = 2;
                    
                    // 延迟 1 秒后完成活体检测
                    setTimeout(() => {
                        state.livenessTransitioning = false;
                        if (instruction) {
                            instruction.style.color = '';
                        }
                        // 只有在未失败的情况下才完成活体检测
                        if (!state.verificationFailed) {
                            completeLivenessDetection();
                        }
                    }, 1000);
                    return false;
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
