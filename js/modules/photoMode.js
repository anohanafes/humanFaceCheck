/**
 * 图片对比模式 - 纯图片比对，无需摄像头
 */

import { state } from './config.js';
import { normalizeDescriptor } from './utils.js';
import { loadModels, preWarmModels } from './modelLoader.js';
import { triggerSuccess, triggerFail } from './callbacks.js';

// 图片模式状态
let photoModeActive = false;
let verifyUploadInput = null;

/**
 * 计算相似度
 */
function calculateSimilarity(distance) {
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
 * 从图片提取特征
 */
async function extractDescriptor(file) {
    const imgUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve) => {
        const tempImg = new Image();
        tempImg.onload = () => resolve(tempImg);
        tempImg.src = imgUrl;
    });

    const detection = await faceapi.detectSingleFace(
        img,
        new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.4
        })
    ).withFaceLandmarks().withFaceDescriptor();

    URL.revokeObjectURL(imgUrl);

    if (!detection) {
        return null;
    }

    return normalizeDescriptor(detection.descriptor);
}

/**
 * 初始化图片模式界面
 */
export function initPhotoModeUI() {
    // 隐藏摄像头区域
    const videoContainer = document.getElementById('video-container');
    if (videoContainer) {
        videoContainer.classList.add('display-none');
    }

    // 如果已有注册特征，直接显示验证按钮
    if (state.registeredDescriptor) {
        hideRegisterUpload();
        showVerifyButton();
        document.getElementById('status').textContent = "请点击按钮上传照片进行人脸识别";
    }
}

/**
 * 隐藏注册上传按钮
 */
function hideRegisterUpload() {
    const controls = document.getElementById('controls');
    if (controls) {
        controls.classList.add('display-none');
    }
}

/**
 * 显示注册上传按钮
 */
function showRegisterUpload() {
    const controls = document.getElementById('controls');
    if (controls) {
        controls.classList.remove('display-none');
    }
}


/**
 * 显示人脸识别按钮
 */
function showVerifyButton() {
    // 隐藏摄像头区域
    const videoContainer = document.getElementById('video-container');
    if (videoContainer) {
        videoContainer.classList.add('display-none');
    }

    // 检查是否已存在
    if (document.getElementById('verify-upload-container')) {
        document.getElementById('verify-upload-container').classList.remove('display-none');
        return;
    }

    // 创建人脸识别按钮
    const container = document.createElement('div');
    container.id = 'verify-upload-container';
    container.innerHTML = `
        <label class="upload-btn verify-upload-btn">
            🔍 人脸识别
            <input type="file" id="verify-upload" accept="image/*">
        </label>
    `;

    // 插入到 container 中
    const mainContainer = document.querySelector('.container');
    const statusDiv = document.getElementById('status');
    mainContainer.insertBefore(container, statusDiv);

    // 绑定事件
    verifyUploadInput = document.getElementById('verify-upload');
    verifyUploadInput.addEventListener('change', handleVerifyUpload);
}

/**
 * 隐藏人脸识别按钮
 */
function hideVerifyButton() {
    const container = document.getElementById('verify-upload-container');
    if (container) {
        container.classList.add('display-none');
    }
}

/**
 * 处理验证照片上传
 */
async function handleVerifyUpload(e) {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    await verifyPhoto(file);

    // 清空 input，允许重复上传同一文件
    e.target.value = '';
}

/**
 * 注册照片（图片模式）- 用于手动上传注册照片的场景
 */
export async function registerPhotoMode(file) {
    if (!file) return;

    try {
        document.getElementById('status').textContent = "正在处理照片...";

        if (!state.modelsLoaded) {
            document.getElementById('status').textContent = "正在加载模型...";
            await loadModels();
        }

        const descriptor = await extractDescriptor(file);

        if (descriptor) {
            state.registeredDescriptor = descriptor;
            state.registeredDescriptors = [descriptor];
            photoModeActive = true;

            // 隐藏注册按钮，显示验证按钮
            hideRegisterUpload();
            showVerifyButton();
            document.getElementById('status').textContent = "注册成功！请点击按钮上传照片进行人脸识别";
        } else {
            document.getElementById('status').textContent = "未检测到人脸，请重新上传";
        }
    } catch (e) {
        console.error('注册失败:', e);
        document.getElementById('status').textContent = "照片处理失败，请重试";
    }
}

/**
 * 从 base64 字符串提取特征
 */
async function extractDescriptorFromBase64(base64Str) {
    // 确保有正确的 data URL 前缀
    let dataUrl = base64Str;
    if (!base64Str.startsWith('data:')) {
        dataUrl = 'data:image/jpeg;base64,' + base64Str;
    }

    const img = await new Promise((resolve, reject) => {
        const tempImg = new Image();
        tempImg.onload = () => resolve(tempImg);
        tempImg.onerror = reject;
        tempImg.src = dataUrl;
    });

    // 使用较小的 inputSize 加快速度
    const detection = await faceapi.detectSingleFace(
        img,
        new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.4
        })
    ).withFaceLandmarks().withFaceDescriptor();

    if (!detection) {
        return null;
    }

    return normalizeDescriptor(detection.descriptor);
}

/**
 * 从网络URL注册照片（图片模式）
 */
export async function registerPhotoModeFromUrl(photoUrl) {
    try {
        // 先确保模型加载完成
        if (!state.modelsLoaded) {
            document.getElementById('status').textContent = "正在加载识别模型...";
            await loadModels();
        }

        // 预热模型（编译着色器）
        document.getElementById('status').textContent = "正在初始化识别引擎...";
        await preWarmModels();

        let descriptor;

        // 判断是 base64 还是 URL
        if (photoUrl.startsWith('data:') || photoUrl.length > 500) {
            // base64 图片，直接解析
            document.getElementById('status').textContent = "正在分析人脸特征...";
            descriptor = await extractDescriptorFromBase64(photoUrl);
        } else {
            // 网络 URL，需要下载
            document.getElementById('status').textContent = "正在下载预设照片...";

            // 加载网络图片（带超时提示）
            let downloadTimeout = setTimeout(() => {
                document.getElementById('status').textContent = "正在下载预设照片（网络较慢，请稍候）...";
            }, 3000);

            const response = await fetch(photoUrl, { mode: 'cors' });
            const blob = await response.blob();
            const file = new File([blob], 'photo.jpg', { type: blob.type });

            clearTimeout(downloadTimeout);

            document.getElementById('status').textContent = "正在分析人脸特征...";
            descriptor = await extractDescriptor(file);
        }

        if (descriptor) {
            state.registeredDescriptor = descriptor;
            state.registeredDescriptors = [descriptor];
            photoModeActive = true;

            // 隐藏注册按钮，显示验证按钮
            hideRegisterUpload();
            showVerifyButton();
            document.getElementById('status').textContent = "请点击按钮上传照片进行人脸识别";
        } else {
            document.getElementById('status').textContent = "预设照片未检测到人脸";
            triggerFail({ reason: '预设照片未检测到人脸' });
        }
    } catch (e) {
        console.error('加载照片失败:', e);
        document.getElementById('status').textContent = "照片加载失败";
        triggerFail({ reason: '照片加载失败' });
    }
}


/**
 * 验证照片
 */
export async function verifyPhoto(file) {
    if (!state.registeredDescriptor) {
        document.getElementById('status').textContent = "请先上传注册照片";
        return;
    }

    try {
        document.getElementById('status').textContent = "正在验证...";

        const descriptor = await extractDescriptor(file);

        if (!descriptor) {
            const result = {
                success: false,
                reason: '待验证照片未检测到人脸',
                similarity: 0,
                timestamp: Date.now()
            };
            document.getElementById('status').textContent = "待验证照片未检测到人脸";
            document.getElementById('status').style.color = '#ff6b6b';
            triggerFail(result);
            showRetryButton();
            return;
        }

        // 计算距离
        let minDistance = Infinity;
        for (const regDesc of state.registeredDescriptors) {
            const dist = faceapi.euclideanDistance(regDesc, descriptor);
            minDistance = Math.min(minDistance, dist);
        }

        const similarity = calculateSimilarity(minDistance);
        state.currentSimilarity = Math.round(similarity * 10) / 10;

        // 判定阈值
        const threshold = 0.35;
        const isMatch = minDistance < threshold;

        if (isMatch) {
            const result = {
                success: true,
                message: '验证通过',
                similarity: state.currentSimilarity,
                timestamp: Date.now()
            };
            document.getElementById('status').textContent = `验证通过！相似度: ${state.currentSimilarity}%`;
            document.getElementById('status').style.color = '#00ff99';
            triggerSuccess(result);
        } else {
            const result = {
                success: false,
                reason: '人脸不匹配',
                similarity: state.currentSimilarity,
                timestamp: Date.now()
            };
            document.getElementById('status').textContent = `验证失败，相似度: ${state.currentSimilarity}%`;
            document.getElementById('status').style.color = '#ff6b6b';
            triggerFail(result);
        }

        showRetryButton();

    } catch (e) {
        console.error('验证失败:', e);
        document.getElementById('status').textContent = "验证失败，请重试";
        triggerFail({ reason: '验证过程出错', timestamp: Date.now() });
        showRetryButton();
    }
}

/**
 * 显示重新验证按钮
 */
function showRetryButton() {
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.style.display = 'block';
        retryBtn.textContent = '重新验证';
    }
}

/**
 * 重置图片模式
 */
export function resetPhotoMode() {
    // 不清除注册特征，只重置界面状态
    hideVerifyButton();
    
    // 如果有注册特征，显示验证按钮；否则显示注册按钮
    if (state.registeredDescriptor) {
        showVerifyButton();
        document.getElementById('status').textContent = "请点击按钮上传照片进行人脸识别";
    } else {
        showRegisterUpload();
        document.getElementById('status').textContent = "请上传您的身份照片进行注册";
    }
    
    document.getElementById('status').style.color = "#5c9ce6";
    document.getElementById('retry-btn').style.display = 'none';
}

/**
 * 完全重置图片模式（包括清除注册特征）
 */
export function fullResetPhotoMode() {
    photoModeActive = false;
    state.registeredDescriptor = null;
    state.registeredDescriptors = [];
    hideVerifyButton();
    showRegisterUpload();
    document.getElementById('status').textContent = "请上传您的身份照片进行注册";
    document.getElementById('status').style.color = "#5c9ce6";
    document.getElementById('retry-btn').style.display = 'none';
}

/**
 * 检查是否为图片模式
 */
export function isPhotoMode() {
    return photoModeActive;
}

/**
 * 设置图片模式
 */
export function setPhotoMode(active) {
    photoModeActive = active;
    if (active) {
        initPhotoModeUI();
    }
}
