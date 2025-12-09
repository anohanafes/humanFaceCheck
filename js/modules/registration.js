/**
 * 人脸注册模块
 */

import { state } from './config.js';
import { normalizeDescriptor, isMobileDevice } from './utils.js';
import { loadModels, precompileShaders } from './modelLoader.js';
import { initializeCamera } from './camera.js';

/**
 * 注册照片处理
 */
export async function registerFace(e) {
    e.preventDefault();

    try {
        const startTime = performance.now();

        if (!e.target.files || e.target.files.length === 0) {
            return;
        }

        document.getElementById('status').textContent = "正在处理照片，请稍候...";

        if (!state.modelsLoaded) {
            document.getElementById('status').textContent = "正在加载模型，请稍候...";
            await loadModels();
        }

        if (!state.shadersCompiled && window.tf) {
            setTimeout(() => {
                precompileShaders();
            }, 0);
        }

        document.getElementById('status').textContent = "处理照片 (20%)...";

        const file = e.target.files[0];
        let img;
        const mobile = isMobileDevice();

        try {
            const imgUrl = URL.createObjectURL(file);
            img = await new Promise((resolve) => {
                const tempImg = new Image();
                tempImg.onload = () => resolve(tempImg);
                tempImg.src = imgUrl;
            });

            const MAX_WIDTH = mobile ? 480 : 640;
            const MAX_HEIGHT = mobile ? 360 : 480;

            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

            img = await new Promise((resolve) => {
                const newImg = new Image();
                newImg.onload = () => resolve(newImg);
                newImg.src = dataUrl;
            });

            URL.revokeObjectURL(imgUrl);
            canvas.remove();

            document.getElementById('status').textContent = "处理照片 (40%)...";
        } catch (e) {
            img = await faceapi.bufferToImage(file);
        }

        document.getElementById('status').textContent = "检测面部特征 (60%)...";

        const preliminaryDetectionOptions = new faceapi.TinyFaceDetectorOptions({
            inputSize: mobile ? 224 : 320,
            scoreThreshold: 0.5
        });

        let detection = null;
        const hasTF = window.tf !== undefined;

        if (hasTF) {
            try {
                const preliminaryDetection = await faceapi.detectSingleFace(
                    img,
                    preliminaryDetectionOptions
                );

                if (preliminaryDetection) {
                    document.getElementById('status').textContent = "分析特征 (75%)...";

                    detection = await faceapi.detectSingleFace(
                        img,
                        new faceapi.TinyFaceDetectorOptions({
                            inputSize: mobile ? 320 : 416,
                            scoreThreshold: 0.4
                        })
                    )
                        .withFaceLandmarks()
                        .withFaceDescriptor();

                    if (tf.ENV && tf.ENV.backend && tf.ENV.backend.numDataIds) {
                        tf.disposeVariables();
                    }
                }
            } catch (e) {
                // TensorFlow操作失败
            }
        }

        if (!detection) {
            try {
                detection = await faceapi.detectSingleFace(
                    img,
                    new faceapi.TinyFaceDetectorOptions({
                        inputSize: mobile ? 320 : 416,
                        scoreThreshold: 0.4
                    })
                )
                    .withFaceLandmarks()
                    .withFaceDescriptor();
            } catch (e) {
                // 备选检测方法失败
            }
        }

        document.getElementById('status').textContent = "分析特征完成 (90%)...";

        if (detection) {
            state.registeredDescriptor = normalizeDescriptor(detection.descriptor);
            state.registeredDescriptors = [state.registeredDescriptor];

            document.getElementById('status').textContent = "注册成功！正在初始化摄像头...";

            await initializeCamera();
        } else {
            document.getElementById('status').textContent = "未检测到人脸，请重新上传清晰的正面照片";
        }
    } catch (e) {
        console.log("registerFace error:", e);
        document.getElementById('status').textContent = "照片处理失败，请重试";
    }
}
