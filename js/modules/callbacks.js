/**
 * 回调管理模块 - 处理验证结果的回调、事件和跨窗口通信
 */

import { state } from './config.js';

// 回调函数存储
const callbacks = {
    onSuccess: null,
    onFail: null,
    onProgress: null
};

/**
 * 设置回调函数
 */
export function setCallbacks(options = {}) {
    if (options.onSuccess) callbacks.onSuccess = options.onSuccess;
    if (options.onFail) callbacks.onFail = options.onFail;
    if (options.onProgress) callbacks.onProgress = options.onProgress;
}

/**
 * 触发成功回调
 */
export function triggerSuccess(data = {}) {
    const result = {
        success: true,
        message: '验证通过',
        similarity: state.currentSimilarity,
        timestamp: Date.now(),
        ...data
    };

    // 触发回调函数
    if (callbacks.onSuccess && typeof callbacks.onSuccess === 'function') {
        callbacks.onSuccess(result);
    }

    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('faceVerifyResult', { detail: result }));

    // 如果在 iframe 中，向父窗口发送消息
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'faceVerifyResult', ...result }, '*');
    }

    return result;
}

/**
 * 触发失败回调
 */
export function triggerFail(data = {}) {
    const result = {
        success: false,
        message: data.reason || '验证失败',
        similarity: state.currentSimilarity,
        timestamp: Date.now(),
        ...data
    };

    // 触发回调函数
    if (callbacks.onFail && typeof callbacks.onFail === 'function') {
        callbacks.onFail(result);
    }

    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('faceVerifyResult', { detail: result }));

    // 如果在 iframe 中，向父窗口发送消息
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'faceVerifyResult', ...result }, '*');
    }

    return result;
}

/**
 * 触发进度回调
 */
export function triggerProgress(step, data = {}) {
    const progress = {
        step,
        timestamp: Date.now(),
        ...data
    };

    if (callbacks.onProgress && typeof callbacks.onProgress === 'function') {
        callbacks.onProgress(progress);
    }

    // 触发进度事件
    window.dispatchEvent(new CustomEvent('faceVerifyProgress', { detail: progress }));

    return progress;
}

/**
 * 解析 URL 参数
 */
export function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        photoUrl: params.get('photo') || params.get('photoUrl'),
        enableLiveness: params.get('liveness') !== 'false'
    };
}

/**
 * 从 URL 加载图片并注册
 */
export async function loadPhotoFromUrl(url) {
    if (!url) return null;

    try {
        const response = await fetch(url, { mode: 'cors' });
        const blob = await response.blob();
        const file = new File([blob], 'photo.jpg', { type: blob.type });
        return file;
    } catch (e) {
        console.error('加载网络图片失败:', e);
        return null;
    }
}

/**
 * 重置回调
 */
export function resetCallbacks() {
    callbacks.onSuccess = null;
    callbacks.onFail = null;
    callbacks.onProgress = null;
}
