/**
 * 主入口模块 - 初始化和事件绑定
 */

import { state, config, resetVerificationState } from './config.js';
import { resizeCanvas } from './utils.js';
import { loadModels } from './modelLoader.js';
import { registerFace, registerFaceFromFile } from './registration.js';
import { resetLivenessDetection, startLivenessDetection, livenessDebug } from './livenessDetection.js';
import { setCallbacks, parseUrlParams, loadPhotoFromUrl, triggerSuccess, triggerFail } from './callbacks.js';
import { registerPhotoMode, registerPhotoModeFromUrl, verifyPhoto, resetPhotoMode, fullResetPhotoMode, isPhotoMode, setPhotoMode } from './photoMode.js';

/**
 * 初始化基础界面
 */
function initializeUI() {
    document.getElementById('video-container').classList.add('display-none');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 先检查 URL 参数设置模式（在模型加载前）
    const params = parseUrlParams();
    if (params.mode === 'photo') {
        setPhotoMode(true);
    }

    loadModels().then(success => {
        if (success) {
            document.getElementById('status').textContent = "模型已就绪，请上传您的身份照片";
            // 检查 URL 参数，自动加载图片
            checkUrlParams();
        }
    });
}

/**
 * 检查 URL 参数并自动加载图片
 */
async function checkUrlParams() {
    const params = parseUrlParams();
    
    // 检查是否为图片模式
    if (params.mode === 'photo') {
        setPhotoMode(true);
        
        // 图片模式下，如果有预设照片URL，直接加载
        if (params.photoUrl) {
            await registerPhotoModeFromUrl(params.photoUrl);
        }
        return;
    }
    
    // 摄像头模式
    if (params.photoUrl) {
        document.getElementById('status').textContent = "正在加载网络图片...";
        const file = await loadPhotoFromUrl(params.photoUrl);
        if (file) {
            await registerFaceFromFile(file);
        } else {
            document.getElementById('status').textContent = "网络图片加载失败，请手动上传";
        }
    }
}

/**
 * 重试验证
 */
function retryVerification() {
    // 图片模式重试
    if (isPhotoMode()) {
        resetPhotoMode();
        return;
    }
    
    // 摄像头模式重试
    resetVerificationState();
    resetLivenessDetection();

    const statusDiv = document.getElementById('status');
    statusDiv.textContent = "请保持脸部在框内，系统正在验证...";
    statusDiv.style.color = "#5c9ce6";
    statusDiv.classList.remove('verification-failed');

    document.getElementById('retry-btn').style.display = 'none';
    
    // 重新启动活体检测
    if (state.registeredDescriptor) {
        startLivenessDetection();
    }
}

/**
 * 初始化事件监听
 */
function initializeEventListeners() {
    // 文件上传事件
    const uploadInput = document.getElementById('upload');
    if (uploadInput) {
        uploadInput.addEventListener('change', async (e) => {
            e.preventDefault();
            if (!e.target.files || e.target.files.length === 0) return;
            
            const file = e.target.files[0];
            const params = parseUrlParams();
            
            // 根据模式选择注册方式
            if (params.mode === 'photo' || isPhotoMode()) {
                setPhotoMode(true);
                await registerPhotoMode(file);
            } else {
                await registerFaceFromFile(file);
            }
        });
    }

    // 重试按钮事件
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', retryVerification);
    }
}

/**
 * FaceVerify API - 供外部调用
 */
const FaceVerify = {
    version: '1.1.1',

    /**
     * 初始化并开始验证
     * @param {Object} options 配置选项
     * @param {string} options.photoUrl - 注册照片 URL
     * @param {string} options.mode - 验证模式: 'camera'(默认) 或 'photo'
     * @param {boolean} options.enableLiveness - 是否启用活体检测（默认 true，仅 camera 模式有效）
     * @param {Function} options.onSuccess - 验证成功回调
     * @param {Function} options.onFail - 验证失败回调
     * @param {Function} options.onProgress - 进度回调
     */
    async init(options = {}) {
        // 设置回调
        setCallbacks(options);

        // 设置模式
        if (options.mode === 'photo') {
            setPhotoMode(true);
        }

        // 设置活体检测开关（仅 camera 模式有效）
        if (options.enableLiveness === false) {
            config.requiredMouthOpens = 0;
            config.requiredShakes = 0;
        }

        // 如果提供了照片 URL，自动加载
        if (options.photoUrl) {
            if (options.mode === 'photo') {
                await registerPhotoModeFromUrl(options.photoUrl);
            } else {
                document.getElementById('status').textContent = "正在加载照片...";
                const file = await loadPhotoFromUrl(options.photoUrl);
                if (file) {
                    await registerFaceFromFile(file);
                } else {
                    document.getElementById('status').textContent = "照片加载失败";
                    triggerFail({ reason: '照片加载失败' });
                }
            }
        }

        return this;
    },

    /**
     * 重置验证状态
     */
    reset() {
        retryVerification();
    },

    /**
     * 获取当前状态
     */
    getState() {
        return {
            isLivenessActive: state.isLivenessActive,
            livenessStep: state.livenessStep,
            currentSimilarity: state.currentSimilarity,
            verificationFailed: state.verificationFailed,
            hasRegistered: !!state.registeredDescriptor
        };
    },

    // 内部方法，供模块调用
    _triggerSuccess: triggerSuccess,
    _triggerFail: triggerFail
};

/**
 * 页面加载完成后初始化
 */
window.addEventListener('DOMContentLoaded', function () {
    initializeUI();
    initializeEventListeners();
    initPostMessageListener();
});

/**
 * 初始化 postMessage 监听器（用于 iframe 接收父窗口发送的 base64 图片）
 */
function initPostMessageListener() {
    window.addEventListener('message', async (e) => {
        // 处理父窗口发送的预设照片
        if (e.data && e.data.type === 'setPhoto') {
            const { photo, mode } = e.data;
            if (!photo) return;

            // 如果指定了 photo 模式
            if (mode === 'photo') {
                setPhotoMode(true);
                await registerPhotoModeFromUrl(photo);
            } else {
                // 摄像头模式
                const file = await loadPhotoFromUrl(photo);
                if (file) {
                    await registerFaceFromFile(file);
                }
            }
        }
    });
}

// 导出全局接口
window.FaceVerify = FaceVerify;
window.registerFace = registerFace;
window.retryVerification = retryVerification;

// 调试接口
window.livenessDetection = {
    start: startLivenessDetection,
    reset: resetLivenessDetection,
    isActive: () => state.isLivenessActive,
    getStep: () => state.livenessStep,
    skipAll: livenessDebug.skipAll
};

export { FaceVerify };
export default FaceVerify;
