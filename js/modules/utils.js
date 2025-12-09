/**
 * 工具函数模块
 */

import { state, config } from './config.js';

/**
 * 特征向量标准化函数，提高匹配稳定性
 */
export function normalizeDescriptor(descriptor) {
    let sum = 0;
    for (let i = 0; i < descriptor.length; i++) {
        sum += descriptor[i] * descriptor[i];
    }
    const magnitude = Math.sqrt(sum);

    if (magnitude === 0) return descriptor;

    const normalized = new Float32Array(descriptor.length);
    for (let i = 0; i < descriptor.length; i++) {
        normalized[i] = descriptor[i] / magnitude;
    }
    return normalized;
}

/**
 * 相似度计算函数，精细化调整，增强鉴别能力
 */
export function calculateSimilarity(distance) {
    if (distance > 0.45) {
        return Math.max(5, 25 - (distance - 0.45) * 100);
    } else if (distance > 0.38) {
        return Math.max(25, 55 - (distance - 0.38) * 430);
    } else if (distance > 0.30) {
        const ratio = (distance - 0.30) / 0.08;
        return 78 - ratio * 23;
    } else if (distance > 0.22) {
        const ratio = (distance - 0.22) / 0.08;
        return 92 - ratio * 14;
    } else {
        return 100 - distance * 36;
    }
}

/**
 * 获取平滑处理后的相似度
 */
export function getSmoothSimilarity(rawSimilarity) {
    state.similarityHistory.push(rawSimilarity);

    if (state.similarityHistory.length > config.maxSimilarityFrames) {
        state.similarityHistory.shift();
    }

    if (state.similarityHistory.length < 3) return rawSimilarity;

    const sorted = [...state.similarityHistory].sort((a, b) => a - b);
    const medianSimilarity = sorted[Math.floor(sorted.length / 2)];

    const validValues = state.similarityHistory.filter(
        val => Math.abs(val - medianSimilarity) < 12
    );

    if (validValues.length === 0) return medianSimilarity;

    const avgSimilarity = validValues.reduce((sum, val) => sum + val, 0) / validValues.length;

    return rawSimilarity * 0.5 + avgSimilarity * 0.5;
}

/**
 * 检测是否为移动设备
 */
export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * 调整Canvas大小
 */
export function resizeCanvas() {
    const videoContainer = document.getElementById('video-container');
    const canvas = document.getElementById('canvas');

    const containerWidth = videoContainer.clientWidth;
    const containerHeight = videoContainer.clientHeight;

    canvas.width = containerWidth;
    canvas.height = containerHeight;

    const faceGuide = document.getElementById('face-guide');
    if (faceGuide) {
        const guideWidth = Math.min(220, containerWidth * 0.55);
        const guideHeight = guideWidth * 1.27;
        faceGuide.style.width = `${guideWidth}px`;
        faceGuide.style.height = `${guideHeight}px`;
    }
}
