/**
 * 摄像头初始化和视频渲染模块
 */

import { state, config } from './config.js';
import { resizeCanvas } from './utils.js';
import { precompileShaders } from './modelLoader.js';
import { detectFaces } from './faceDetection.js';

/**
 * 初始化摄像头
 */
export async function initializeCamera() {
    const videoContainer = document.getElementById('video-container');
    videoContainer.classList.remove('display-none');

    const video = document.getElementById('video');
    const loading = document.getElementById('loading');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    if (!video || !ctx) {
        return;
    }

    resizeCanvas();
    state.isCanvasInitialized = true;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            }
        });

        let readyFrameCount = 0;
        const drawFirstFrames = setInterval(() => {
            try {
                if (video.readyState >= 2) {
                    ctx.save();
                    ctx.scale(-1, 1);
                    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
                    ctx.restore();

                    readyFrameCount++;
                    if (readyFrameCount >= 3) {
                        clearInterval(drawFirstFrames);
                    }
                } else {
                    ctx.fillStyle = '#0a2a42';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#4cffff';
                    ctx.font = '20px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('摄像头准备中...', canvas.width / 2, canvas.height / 2);
                }
            } catch (e) {
                // 绘制帧错误
            }
        }, 100);

        video.srcObject = stream;

        video.onloadedmetadata = () => {
            resizeCanvas();
        };

        video.onplaying = () => {
            loading.classList.add('display-none');
            state.isVideoInitialized = true;

            startDetection(video);
            document.getElementById('status').textContent = "请保持脸部在框内，系统正在验证...";

            setTimeout(() => {
                if (!state.shadersCompiled && window.tf) {
                    precompileShaders();
                }
            }, 100);
        };

        try {
            await video.play();

            setTimeout(() => {
                if (!state.isVideoInitialized) {
                    loading.classList.add('display-none');
                    state.isVideoInitialized = true;
                    startDetection(video);
                }
            }, 3000);
        } catch (e) {
            document.getElementById('status').textContent = "视频播放失败，请重试";
        }
    } catch (err) {
        loading.classList.add('display-none');

        if (ctx) {
            ctx.fillStyle = '#990000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('摄像头访问失败!', canvas.width / 2, canvas.height / 2 - 20);
            ctx.fillText('请确保已授予摄像头权限', canvas.width / 2, canvas.height / 2 + 20);
        }
        document.getElementById('status').textContent = "摄像头访问失败，请检查权限设置";
    }
}

/**
 * 启动实时检测
 */
function startDetection(video) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return;
    }

    let lastDetectionTime = 0;
    let detectionThrottle = config.detectionThrottle.initial;

    setTimeout(() => {
        detectionThrottle = config.detectionThrottle.optimized;
    }, 5000);

    async function renderFrame() {
        try {
            const now = performance.now();
            if (state.registeredDescriptor && state.isCanvasInitialized && 
                (now - lastDetectionTime > detectionThrottle) && !state.isDetecting) {
                lastDetectionTime = now;

                try {
                    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
                        inputSize: 160,
                        scoreThreshold: 0.5
                    });

                    const faceDetections = await faceapi.detectAllFaces(video, detectorOptions);

                    if (faceDetections && faceDetections.length > 0) {
                        detectFaces(video).catch(e => {});
                    } else {
                        const statusDiv = document.getElementById('status');
                        if (!state.verificationFailed) {
                            statusDiv.textContent = "未检测到人脸，请面向摄像头";
                            statusDiv.style.color = "#ffaa00";
                        }
                        state.matchCount = 0;
                    }
                } catch (e) {
                    detectFaces(video).catch(e => {});
                }
            }

            if (video.readyState >= 2) {
                const canvasWidth = canvas.width;
                const canvasHeight = canvas.height;
                const videoWidth = video.videoWidth;
                const videoHeight = video.videoHeight;

                let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

                const canvasRatio = canvasWidth / canvasHeight;
                const videoRatio = videoWidth / videoHeight;

                if (videoRatio > canvasRatio) {
                    drawHeight = canvasHeight;
                    drawWidth = videoWidth * (canvasHeight / videoHeight);
                    offsetX = (canvasWidth - drawWidth) / 2;
                } else {
                    drawWidth = canvasWidth;
                    drawHeight = videoHeight * (canvasWidth / videoWidth);
                    offsetY = (canvasHeight - drawHeight) / 2;
                }

                ctx.clearRect(0, 0, canvasWidth, canvasHeight);

                ctx.save();
                ctx.scale(-1, 1);
                ctx.translate(-canvasWidth, 0);
                ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
                ctx.restore();
            } else {
                ctx.fillStyle = '#0a2a42';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#4cffff';
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('等待视频数据...', canvas.width / 2, canvas.height / 2);
            }
        } catch (e) {
            ctx.fillStyle = '#550000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('渲染错误: ' + e.message, canvas.width / 2, canvas.height / 2);
        }

        requestAnimationFrame(renderFrame);
    }

    renderFrame();
}
