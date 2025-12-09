/**
 * 模型加载和预热模块
 */

import { state, config } from './config.js';

/**
 * 优化WebGL设置
 */
export function optimizeWebGLSettings() {
    if (!window.tf) return false;

    try {
        tf.env().set('WEBGL_SHADER_CACHING', true);
        tf.env().set('WEBGL_BUFFER_ALLOCATION_MODE', 'preallocated_and_dynamic');
        tf.env().set('WEBGL_SHADER_OPTIMIZATION_FLAG', 4);
        tf.env().set('WEBGL_AUTO_SQUARIFY_SHAPE_FLAG', true);
        tf.env().set('WEBGL_CONV_IM2COL', true);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 预编译着色器函数
 */
export function precompileShaders() {
    if (!window.tf || state.shadersCompiled) return false;

    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 64;
        tempCanvas.height = 64;
        const ctx = tempCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 64, 64);

        tf.tidy(() => {
            const inputTensor = tf.browser.fromPixels(tempCanvas);
            const normalized = tf.sub(tf.div(inputTensor, 127.5), 1.0);
            const conv1 = tf.conv2d(normalized, tf.ones([3, 3, 3, 8]), 1, 'same');
            const pool1 = tf.maxPool(conv1, 2, 2, 'same');
            const conv2 = tf.conv2d(pool1, tf.ones([3, 3, 8, 16]), 1, 'same');
            const pool2 = tf.maxPool(conv2, 2, 2, 'same');
            const flatten = tf.flatten(pool2);
            const fc1 = tf.matMul(flatten, tf.ones([flatten.shape[1], 32]));
            const l2norm = tf.div(fc1, tf.norm(fc1, 'euclidean'));
            return l2norm;
        });

        if (tf.ENV.backend.numDataIds) {
            tf.disposeVariables();
        }

        tempCanvas.remove();
        state.shadersCompiled = true;
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 预热模型函数
 */
export async function preWarmModels() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 100, 100);

        // 绘制简单的"脸部"轮廓
        ctx.fillStyle = '#ffdbac';
        ctx.beginPath();
        ctx.arc(50, 50, 30, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#333333';
        ctx.beginPath();
        ctx.arc(40, 40, 5, 0, Math.PI * 2);
        ctx.arc(60, 40, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(50, 60, 10, 0, Math.PI);
        ctx.stroke();

        await faceapi.detectSingleFace(
            canvas,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 })
        );

        if (window.tf) {
            try {
                await faceapi.detectSingleFace(
                    canvas,
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 })
                ).withFaceLandmarks();

                await faceapi.detectSingleFace(
                    canvas,
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 })
                ).withFaceLandmarks().withFaceDescriptor();

                if (tf.ENV && tf.ENV.backend && tf.ENV.backend.numDataIds) {
                    tf.disposeVariables();
                }
            } catch (e) {
                await faceapi.detectSingleFace(
                    canvas,
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 })
                ).withFaceLandmarks();
            }
        } else {
            await faceapi.detectSingleFace(
                canvas,
                new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 })
            ).withFaceLandmarks();
        }

        canvas.remove();
    } catch (e) {
        // 预热失败不影响主要功能
    }
}

/**
 * 加载模型
 */
export async function loadModels() {
    if (state.modelsLoaded) {
        return true;
    }

    // 检测并启用GPU加速
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        const hasWebGL = !!gl;

        if (hasWebGL && window.tf) {
            try {
                tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
                tf.env().set('WEBGL_PACK', true);
                tf.env().set('WEBGL_PACK_DEPTHWISECONV', true);
                tf.env().set('WEBGL_RENDER_FLOAT32_ENABLED', false);
                optimizeWebGLSettings();
                await tf.setBackend('webgl');
                await tf.ready();
            } catch (e) {
                // TensorFlow配置错误
            }
        }
    } catch (e) {
        // GPU初始化错误
    }

    const startTime = performance.now();
    const modelPaths = [config.modelPath];
    let modelPathSuccess = false;

    try {
        for (const modelPath of modelPaths) {
            try {
                await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath);

                const otherModelsPromise = Promise.all([
                    faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
                    faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
                ]);

                document.getElementById('status').textContent = "正在加载模型 (50%)...";
                await otherModelsPromise;

                localStorage.setItem('faceApiModelsLoaded', 'true');
                state.modelsLoaded = true;
                modelPathSuccess = true;

                document.getElementById('status').textContent = "模型已就绪，请上传您的身份照片";

                setTimeout(() => {
                    precompileShaders();
                    preWarmModels();
                }, 100);

                break;
            } catch (e) {
                // 加载失败，尝试下一个路径
            }
        }
    } catch (e) {
        // 加载模型时出错
    }

    if (!modelPathSuccess) {
        document.getElementById('status').textContent = "模型加载失败，请刷新页面重试";
        return false;
    }

    return true;
}
