/**
 * 主入口模块 - 初始化和事件绑定
 */

import { state, resetVerificationState } from './config.js';
import { resizeCanvas } from './utils.js';
import { loadModels } from './modelLoader.js';
import { registerFace } from './registration.js';
import { resetLivenessDetection, livenessDebug } from './livenessDetection.js';

/**
 * 初始化基础界面
 */
function initializeUI() {
    document.getElementById('video-container').classList.add('display-none');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    loadModels().then(success => {
        if (success) {
            document.getElementById('status').textContent = "模型已就绪，请上传您的身份照片";
        }
    });
}

/**
 * 重试验证
 */
function retryVerification() {
    resetVerificationState();
    resetLivenessDetection();

    const statusDiv = document.getElementById('status');
    statusDiv.textContent = "请保持脸部在框内，系统正在验证...";
    statusDiv.style.color = "#5c9ce6";
    statusDiv.classList.remove('verification-failed');

    document.getElementById('retry-btn').style.display = 'none';
}

/**
 * 初始化事件监听
 */
function initializeEventListeners() {
    // 文件上传事件
    const uploadInput = document.getElementById('upload');
    if (uploadInput) {
        uploadInput.addEventListener('change', registerFace);
    }

    // 重试按钮事件
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', retryVerification);
    }
}

/**
 * 页面加载完成后初始化
 */
window.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem('faceApiModelsLoaded')) {
        // 检测到模型缓存记录
    }

    setTimeout(() => {
        initializeUI();
        initializeEventListeners();
    }, 100);
});

// 导出全局接口（调试用）
window.livenessDetection = {
    start: () => {
        const { startLivenessDetection } = require('./livenessDetection.js');
        startLivenessDetection();
    },
    reset: resetLivenessDetection,
    isActive: () => state.isLivenessActive,
    getStep: () => state.livenessStep,
    skipAll: livenessDebug.skipAll
};

// 导出 registerFace 供 HTML 内联调用
window.registerFace = registerFace;
window.retryVerification = retryVerification;
