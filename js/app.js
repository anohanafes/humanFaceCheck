/**
 * 人脸识别验证系统 - 模块化版本
 * 
 * 模块结构:
 * - Config: 配置常量和全局状态
 * - Utils: 工具函数
 * - ModelLoader: 模型加载和预热
 * - LivenessDetection: 活体检测（张嘴、摇头）
 * - FaceDetection: 人脸检测和验证
 * - Camera: 摄像头初始化和视频渲染
 * - Registration: 人脸注册
 * - Main: 主入口
 * 
 * 外部调用方式:
 * 1. URL参数: ?photo=https://example.com/photo.jpg
 * 2. API调用: FaceVerify.init({ photoUrl: 'xxx', onSuccess: fn, onFail: fn })
 * 3. 事件监听: window.addEventListener('faceVerifyResult', fn)
 */

(function() {
    'use strict';

    // ==================== 回调管理 ====================
    const Callbacks = {
        onSuccess: null,    // 验证成功回调
        onFail: null,       // 验证失败回调
        onProgress: null,   // 进度回调
        
        // 触发成功回调
        triggerSuccess(data) {
            const result = {
                success: true,
                message: '验证通过',
                similarity: State.currentSimilarity,
                timestamp: Date.now(),
                ...data
            };
            
            // 触发回调函数
            if (this.onSuccess && typeof this.onSuccess === 'function') {
                this.onSuccess(result);
            }
            
            // 触发自定义事件
            window.dispatchEvent(new CustomEvent('faceVerifyResult', { detail: result }));
            
            // 如果在iframe中，向父窗口发送消息
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'faceVerifyResult', ...result }, '*');
            }
            
            return result;
        },
        
        // 触发失败回调
        triggerFail(data) {
            const result = {
                success: false,
                message: '验证失败',
                reason: data.reason || 'unknown',
                timestamp: Date.now(),
                ...data
            };
            
            if (this.onFail && typeof this.onFail === 'function') {
                this.onFail(result);
            }
            
            window.dispatchEvent(new CustomEvent('faceVerifyResult', { detail: result }));
            
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'faceVerifyResult', ...result }, '*');
            }
            
            return result;
        },
        
        // 触发进度回调
        triggerProgress(step, data) {
            const result = {
                step: step,
                timestamp: Date.now(),
                ...data
            };
            
            if (this.onProgress && typeof this.onProgress === 'function') {
                this.onProgress(result);
            }
            
            window.dispatchEvent(new CustomEvent('faceVerifyProgress', { detail: result }));
        }
    };

    // ==================== Config 模块 ====================
    const Config = {
        // 验证配置
        maxFailCount: 4,
        requiredMatchFrames: 3,
        maxDescriptors: 5,
        maxSimilarityFrames: 12,
        
        // 活体检测配置
        enableLiveness: true,       // 是否启用活体检测
        requiredMouthOpens: 1,
        requiredShakes: 1,
        livenessTimeout: 6000,      // 活体检测超时时间(ms)
        
        // 模型路径
        modelPath: './faceModels',
        
        // 检测配置
        detectionThrottle: {
            initial: 300,
            optimized: 200
        }
    };

    // 全局状态
    const State = {
        // 注册相关
        registeredDescriptor: null,
        registeredDescriptors: [],
        
        // 验证相关
        matchCount: 0,
        failCount: 0,
        currentSimilarity: 0,
        similarityHistory: [],
        detections: [],
        
        // 状态标志
        isVideoInitialized: false,
        isCanvasInitialized: false,
        isDetecting: false,
        verificationFailed: false,
        verificationSuccess: false,
        modelsLoaded: false,
        shadersCompiled: false,
        reportSent: false,
        
        // 活体检测相关
        livenessStep: 0,
        isLivenessActive: false,
        livenessStartTime: 0,      // 当前步骤开始时间
        livenessTimeoutId: null,   // 超时定时器ID
        
        // 张嘴检测
        mouthOpenCount: 0,
        lastMouthOpenTime: 0,
        mouthWasOpen: false,
        mouthBaseline: null,
        
        // 摇头检测
        shakeCount: 0,
        headShakeDirection: 0,
        shakeSequence: [],
        lastShakeTime: 0,
        ratioBaseline: null
    };

    function resetVerificationState() {
        State.matchCount = 0;
        State.failCount = 0;
        State.verificationFailed = false;
        State.verificationSuccess = false;
        State.reportSent = false;
        State.similarityHistory = [];
    }

    function resetLivenessState() {
        State.isLivenessActive = false;
        State.livenessStep = 0;
        State.mouthOpenCount = 0;
        State.mouthWasOpen = false;
        State.mouthBaseline = null;
        State.lastMouthOpenTime = 0;
        State.shakeCount = 0;
        State.headShakeDirection = 0;
        State.shakeSequence = [];
        State.lastShakeTime = 0;
        State.ratioBaseline = null;
    }

    // ==================== Utils 模块 ====================
    const Utils = {
        normalizeDescriptor(descriptor) {
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
        },

        calculateSimilarity(distance) {
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
        },

        getSmoothSimilarity(rawSimilarity) {
            State.similarityHistory.push(rawSimilarity);
            if (State.similarityHistory.length > Config.maxSimilarityFrames) {
                State.similarityHistory.shift();
            }
            if (State.similarityHistory.length < 3) return rawSimilarity;

            const sorted = [...State.similarityHistory].sort((a, b) => a - b);
            const medianSimilarity = sorted[Math.floor(sorted.length / 2)];
            const validValues = State.similarityHistory.filter(
                val => Math.abs(val - medianSimilarity) < 12
            );
            if (validValues.length === 0) return medianSimilarity;

            const avgSimilarity = validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
            return rawSimilarity * 0.5 + avgSimilarity * 0.5;
        },

        isMobileDevice() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        },

        resizeCanvas() {
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
    };

    // ==================== ModelLoader 模块 ====================
    const ModelLoader = {
        optimizeWebGLSettings() {
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
        },

        precompileShaders() {
            if (!window.tf || State.shadersCompiled) return false;
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
                    return tf.div(fc1, tf.norm(fc1, 'euclidean'));
                });

                if (tf.ENV.backend.numDataIds) {
                    tf.disposeVariables();
                }
                tempCanvas.remove();
                State.shadersCompiled = true;
                return true;
            } catch (e) {
                return false;
            }
        },

        async preWarmModels() {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 100;
                canvas.height = 100;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, 100, 100);

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
                        await faceapi.detectSingleFace(canvas,
                            new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 })
                        ).withFaceLandmarks().withFaceDescriptor();

                        if (tf.ENV && tf.ENV.backend && tf.ENV.backend.numDataIds) {
                            tf.disposeVariables();
                        }
                    } catch (e) {
                        await faceapi.detectSingleFace(canvas,
                            new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 })
                        ).withFaceLandmarks();
                    }
                }
                canvas.remove();
            } catch (e) {}
        },

        async loadModels() {
            if (State.modelsLoaded) return true;

            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (gl && window.tf) {
                    try {
                        tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
                        tf.env().set('WEBGL_PACK', true);
                        tf.env().set('WEBGL_PACK_DEPTHWISECONV', true);
                        tf.env().set('WEBGL_RENDER_FLOAT32_ENABLED', false);
                        this.optimizeWebGLSettings();
                        await tf.setBackend('webgl');
                        await tf.ready();
                    } catch (e) {}
                }
            } catch (e) {}

            const modelPaths = [Config.modelPath];
            let success = false;

            for (const modelPath of modelPaths) {
                try {
                    await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath);
                    document.getElementById('status').textContent = "正在加载模型 (50%)...";

                    await Promise.all([
                        faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
                        faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
                    ]);

                    localStorage.setItem('faceApiModelsLoaded', 'true');
                    State.modelsLoaded = true;
                    success = true;

                    document.getElementById('status').textContent = "模型已就绪，请上传您的身份照片";

                    setTimeout(() => {
                        this.precompileShaders();
                        this.preWarmModels();
                    }, 100);
                    break;
                } catch (e) {}
            }

            if (!success) {
                document.getElementById('status').textContent = "模型加载失败，请刷新页面重试";
            }
            return success;
        }
    };


    // ==================== LivenessDetection 模块 ====================
    const LivenessDetection = {
        detectMouthOpen(landmarks) {
            if (!landmarks || landmarks.length < 68) return false;

            const upperLip = landmarks[51];
            const lowerLip = landmarks[57];
            const leftCorner = landmarks[48];
            const rightCorner = landmarks[54];

            const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
            const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);
            if (mouthWidth === 0) return false;

            const mouthRatio = mouthHeight / mouthWidth;

            if (State.mouthBaseline === null || mouthRatio < State.mouthBaseline) {
                State.mouthBaseline = mouthRatio;
            }

            const OPEN_THRESHOLD = 0.4;
            const isOpen = mouthRatio > OPEN_THRESHOLD || 
                           (State.mouthBaseline && mouthRatio > State.mouthBaseline * 2.5);

            const now = Date.now();

            if (isOpen && !State.mouthWasOpen) {
                State.mouthWasOpen = true;
                if (State.isLivenessActive && State.livenessStep === 0) {
                    const instruction = document.getElementById('liveness-instruction');
                    if (instruction) {
                        instruction.textContent = `检测到张嘴... (${State.mouthOpenCount}/${Config.requiredMouthOpens})`;
                    }
                }
            } else if (!isOpen && State.mouthWasOpen) {
                State.mouthWasOpen = false;
                if (now - State.lastMouthOpenTime > 500) {
                    State.lastMouthOpenTime = now;
                    if (State.isLivenessActive && State.livenessStep === 0) {
                        const instruction = document.getElementById('liveness-instruction');
                        if (instruction) {
                            instruction.textContent = `张嘴成功! (${State.mouthOpenCount + 1}/${Config.requiredMouthOpens})`;
                        }
                    }
                    return true;
                }
            }
            return false;
        },

        detectHeadShake(landmarks, faceBox) {
            if (!landmarks || landmarks.length < 68 || !faceBox) return false;

            const noseX = landmarks[30].x;
            const leftEyeX = landmarks[36].x;
            const rightEyeX = landmarks[45].x;

            const leftDist = noseX - leftEyeX;
            const rightDist = rightEyeX - noseX;
            if (leftDist <= 0 || rightDist <= 0) return false;

            const ratio = leftDist / rightDist;

            if (State.ratioBaseline === null || (ratio > 0.85 && ratio < 1.15)) {
                State.ratioBaseline = ratio;
            }

            const RIGHT_TURN_THRESHOLD = 1.5;
            const LEFT_TURN_THRESHOLD = 0.67;

            let currentDirection = 0;
            if (ratio > RIGHT_TURN_THRESHOLD) {
                currentDirection = 1;
            } else if (ratio < LEFT_TURN_THRESHOLD) {
                currentDirection = -1;
            }

            if (currentDirection !== 0 && currentDirection !== State.headShakeDirection) {
                const now = Date.now();

                if (State.shakeSequence.length > 0) {
                    const lastActionTime = State.shakeSequence[State.shakeSequence.length - 1].time || 0;
                    if (now - lastActionTime > 3000) {
                        State.shakeSequence = [];
                    }
                }

                const lastDir = State.shakeSequence.length > 0 ? 
                                State.shakeSequence[State.shakeSequence.length - 1].dir : 0;

                if (currentDirection !== lastDir) {
                    State.shakeSequence.push({ dir: currentDirection, time: now });
                    State.headShakeDirection = currentDirection;

                    if (State.isLivenessActive && State.livenessStep === 1) {
                        const instruction = document.getElementById('liveness-instruction');
                        if (instruction) {
                            const directionText = currentDirection === 1 ? '向右' : '向左';
                            instruction.textContent = `检测到头部${directionText}转动...`;
                        }
                    }

                    if (State.shakeSequence.length >= 2) {
                        const dirs = State.shakeSequence.map(s => s.dir);
                        for (let i = 0; i < dirs.length - 1; i++) {
                            if (dirs[i] !== dirs[i + 1] && dirs[i] !== 0 && dirs[i + 1] !== 0) {
                                State.shakeSequence = [];
                                State.lastShakeTime = now;
                                return true;
                            }
                        }
                    }
                }
            }
            return false;
        },

        start() {
            State.isLivenessActive = true;
            State.livenessStep = 0;
            State.mouthOpenCount = 0;
            State.mouthWasOpen = false;
            State.mouthBaseline = null;
            State.lastMouthOpenTime = 0;
            State.shakeCount = 0;
            State.headShakeDirection = 0;
            State.shakeSequence = [];
            State.ratioBaseline = null;
            State.livenessStartTime = Date.now();

            const livenessGuide = document.getElementById('liveness-guide');
            const faceGuide = document.getElementById('face-guide');
            livenessGuide.classList.remove('display-none');
            faceGuide.classList.add('display-none');

            this.updateUI();
            this.startTimeout();
        },

        // 启动超时计时器
        startTimeout() {
            this.clearTimeout();
            State.livenessStartTime = Date.now();
            State.livenessTimeoutId = setTimeout(() => {
                if (State.isLivenessActive && State.livenessStep < 2) {
                    console.log('活体检测超时，重新开始');
                    this.onTimeout();
                }
            }, Config.livenessTimeout);
        },

        // 清除超时计时器
        clearTimeout() {
            if (State.livenessTimeoutId) {
                clearTimeout(State.livenessTimeoutId);
                State.livenessTimeoutId = null;
            }
        },

        // 超时处理
        onTimeout() {
            const instruction = document.getElementById('liveness-instruction');
            if (instruction) {
                instruction.textContent = '检测超时，正在重新开始...';
                instruction.classList.remove('pulse');
            }

            // 1秒后重新开始
            setTimeout(() => {
                this.restart();
            }, 1000);
        },

        // 重新开始活体检测
        restart() {
            State.livenessStep = 0;
            State.mouthOpenCount = 0;
            State.mouthWasOpen = false;
            State.mouthBaseline = null;
            State.lastMouthOpenTime = 0;
            State.shakeCount = 0;
            State.headShakeDirection = 0;
            State.shakeSequence = [];
            State.ratioBaseline = null;

            this.updateUI();
            this.startTimeout();
        },

        updateUI() {
            const instruction = document.getElementById('liveness-instruction');
            const progressBar = document.getElementById('liveness-progress-bar');
            const stepMouth = document.getElementById('step-mouth');
            const stepShake = document.getElementById('step-shake');
            const stepNod = document.getElementById('step-nod');

            [stepMouth, stepShake, stepNod].forEach(step => {
                if (step) step.classList.remove('active', 'completed');
            });

            let progress = 0;

            switch (State.livenessStep) {
                case 0:
                    instruction.textContent = `请张嘴 (${State.mouthOpenCount}/${Config.requiredMouthOpens})`;
                    instruction.classList.add('pulse');
                    if (stepMouth) stepMouth.classList.add('active');
                    progress = (State.mouthOpenCount / Config.requiredMouthOpens) * 40;
                    break;
                case 1:
                    instruction.textContent = `请左右转头 (${State.shakeCount}/${Config.requiredShakes})`;
                    instruction.classList.add('pulse');
                    if (stepMouth) stepMouth.classList.add('completed');
                    if (stepShake) stepShake.classList.add('active');
                    progress = 40 + (State.shakeCount / Config.requiredShakes) * 40;
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
        },

        process(landmarks, faceBox) {
            if (!State.isLivenessActive || !landmarks) return false;

            switch (State.livenessStep) {
                case 0:
                    if (this.detectMouthOpen(landmarks)) {
                        State.mouthOpenCount++;
                        if (State.mouthOpenCount >= Config.requiredMouthOpens) {
                            State.livenessStep = 1;
                            State.headShakeDirection = 0;
                            State.shakeSequence = [];
                            State.ratioBaseline = null;
                            // 进入下一步，重置超时计时器
                            this.startTimeout();
                        }
                        this.updateUI();
                    }
                    break;
                case 1:
                    if (this.detectHeadShake(landmarks, faceBox)) {
                        State.shakeCount++;
                        if (State.shakeCount >= Config.requiredShakes) {
                            State.livenessStep = 2;
                            this.clearTimeout();  // 完成后清除超时
                            setTimeout(() => this.complete(), 1000);
                        }
                        this.updateUI();
                    }
                    break;
                case 2:
                    return true;
            }
            return false;
        },

        complete() {
            this.clearTimeout();
            State.isLivenessActive = false;
            const livenessGuide = document.getElementById('liveness-guide');
            const faceGuide = document.getElementById('face-guide');
            livenessGuide.classList.add('display-none');
            faceGuide.classList.remove('display-none');
            document.getElementById('status').textContent = "活体验证通过！请保持面部在框内，系统正在验证身份...";
        },

        reset() {
            this.clearTimeout();
            resetLivenessState();
            const livenessGuide = document.getElementById('liveness-guide');
            livenessGuide.classList.add('display-none');
        }
    };


    // ==================== FaceDetection 模块 ====================
    const FaceDetection = {
        async detect(video) {
            if (!State.registeredDescriptor || State.isDetecting || State.verificationFailed || State.verificationSuccess) {
                return State.detections;
            }

            // 根据配置决定是否启用活体检测
            if (Config.enableLiveness) {
                if (!State.isLivenessActive && State.livenessStep === 0 && State.registeredDescriptor) {
                    LivenessDetection.start();
                }
            } else {
                // 不启用活体检测时，直接标记为已完成
                if (State.livenessStep === 0) {
                    State.livenessStep = 2;
                }
            }

            try {
                State.isDetecting = true;
                const mobile = Utils.isMobileDevice();
                let newDetections = [];
                const hasTF = window.tf !== undefined;

                try {
                    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
                        inputSize: mobile ? 224 : 320,
                        scoreThreshold: mobile ? 0.4 : 0.45
                    });

                    if (hasTF) {
                        try {
                            const faceDetections = await faceapi.detectAllFaces(video, detectorOptions);
                            if (faceDetections.length > 0) {
                                newDetections = await faceapi.detectAllFaces(video, detectorOptions)
                                    .withFaceLandmarks()
                                    .withFaceDescriptors();
                            }
                            if (tf.ENV && tf.ENV.backend && tf.ENV.backend.numDataIds) {
                                tf.disposeVariables();
                            }
                        } catch (e) {
                            newDetections = await faceapi.detectAllFaces(video, detectorOptions)
                                .withFaceLandmarks()
                                .withFaceDescriptors();
                        }
                    } else {
                        newDetections = await faceapi.detectAllFaces(video, detectorOptions)
                            .withFaceLandmarks()
                            .withFaceDescriptors();
                    }
                } catch (e) {
                    try {
                        newDetections = await faceapi.detectAllFaces(video,
                            new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
                        ).withFaceLandmarks().withFaceDescriptors();
                    } catch (err) {
                        newDetections = [];
                    }
                }

                let maxSimilarity = 0;
                let results = [];

                if (newDetections.length === 0) {
                    State.failCount++;
                    if (State.failCount >= 5) {
                        State.failCount = Math.max(0, State.failCount - 1);
                    }
                } else {
                    let hasMatch = false;

                    newDetections.forEach(detection => {
                        if (State.isLivenessActive) {
                            const landmarks = detection.landmarks.positions;
                            const faceBox = detection.detection.box;
                            const canProceed = LivenessDetection.process(landmarks, faceBox);
                            if (!canProceed) return;
                        }

                        const normalizedDescriptor = Utils.normalizeDescriptor(detection.descriptor);
                        let bestDistance = faceapi.euclideanDistance(State.registeredDescriptor, normalizedDescriptor);

                        if (State.registeredDescriptors.length > 0) {
                            for (const regDesc of State.registeredDescriptors) {
                                const dist = faceapi.euclideanDistance(regDesc, normalizedDescriptor);
                                if (dist < bestDistance) bestDistance = dist;
                            }
                        }

                        const similarity = Utils.calculateSimilarity(bestDistance);

                        if (similarity > maxSimilarity) {
                            maxSimilarity = similarity;

                            if (similarity > 90 && State.registeredDescriptors.length < Config.maxDescriptors) {
                                let isUnique = true;
                                let minDiffDistance = 1.0;

                                for (const regDesc of State.registeredDescriptors) {
                                    const diffDist = faceapi.euclideanDistance(regDesc, normalizedDescriptor);
                                    minDiffDistance = Math.min(minDiffDistance, diffDist);
                                    if (diffDist < 0.18) {
                                        isUnique = false;
                                        break;
                                    }
                                }

                                if (isUnique && minDiffDistance >= 0.18) {
                                    State.registeredDescriptors.push(normalizedDescriptor);
                                    if (State.registeredDescriptors.length > Config.maxDescriptors) {
                                        State.registeredDescriptors.shift();
                                    }
                                }
                            }
                        }

                        const box = detection.detection.box;
                        const faceSize = Math.max(box.width, box.height);

                        let dynamicThreshold;
                        if (faceSize > 200) dynamicThreshold = 0.29;
                        else if (faceSize > 150) dynamicThreshold = 0.33;
                        else if (faceSize > 100) dynamicThreshold = 0.36;
                        else dynamicThreshold = 0.39;

                        if (bestDistance < dynamicThreshold) {
                            const margin = dynamicThreshold - bestDistance;
                            State.matchCount += (margin > 0.08) ? 2 : 1;
                            State.matchCount = Math.min(State.matchCount, Config.requiredMatchFrames + 1);
                            State.failCount = 0;
                            hasMatch = true;
                        } else {
                            if (bestDistance < dynamicThreshold + 0.05) {
                                State.matchCount = Math.max(0, State.matchCount - 1);
                            } else {
                                State.matchCount = Math.max(0, State.matchCount - 2);
                            }
                            if (!hasMatch) State.failCount++;
                        }

                        results.push({
                            box: box,
                            label: `${similarity.toFixed(1)}% (${bestDistance.toFixed(3)}) ${bestDistance < dynamicThreshold ? '✅' : '❌'}`
                        });
                    });
                }

                State.currentSimilarity = Utils.getSmoothSimilarity(maxSimilarity);

                const statusDiv = document.getElementById('status');
                const retryBtn = document.getElementById('retry-btn');

                if (State.matchCount >= Config.requiredMatchFrames) {
                    if (!State.reportSent) {
                        State.reportSent = true;
                        State.verificationSuccess = true;
                        statusDiv.textContent = "验证通过！";
                        statusDiv.style.color = "#00ff99";
                        retryBtn.style.display = 'none';
                        // 触发成功回调
                        Callbacks.triggerSuccess({
                            similarity: State.currentSimilarity,
                            matchCount: State.matchCount
                        });
                    }
                } else if (State.failCount >= Config.maxFailCount && !State.verificationFailed) {
                    State.verificationFailed = true;
                    State.reportSent = true;
                    statusDiv.textContent = "验证失败！请点击下方按钮重试";
                    statusDiv.style.color = "#ff4c4c";
                    statusDiv.classList.add('verification-failed');
                    retryBtn.style.display = 'block';
                    // 触发失败回调
                    Callbacks.triggerFail({
                        reason: 'verification_failed',
                        failCount: State.failCount,
                        similarity: State.currentSimilarity
                    });
                } else if (!State.verificationFailed) {
                    statusDiv.textContent = "请保持面部在框内，系统正在验证...";
                    statusDiv.style.color = "#5c9ce6";
                }

                State.detections = results;
                return results;
            } catch (e) {
                State.failCount++;
                return State.detections;
            } finally {
                State.isDetecting = false;
            }
        }
    };


    // ==================== Camera 模块 ====================
    const Camera = {
        async initialize() {
            const videoContainer = document.getElementById('video-container');
            videoContainer.classList.remove('display-none');

            const video = document.getElementById('video');
            const loading = document.getElementById('loading');
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');

            if (!video || !ctx) return;

            Utils.resizeCanvas();
            State.isCanvasInitialized = true;

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
                            if (readyFrameCount >= 3) clearInterval(drawFirstFrames);
                        } else {
                            ctx.fillStyle = '#0a2a42';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.fillStyle = '#4cffff';
                            ctx.font = '20px Arial';
                            ctx.textAlign = 'center';
                            ctx.fillText('摄像头准备中...', canvas.width / 2, canvas.height / 2);
                        }
                    } catch (e) {}
                }, 100);

                video.srcObject = stream;
                video.onloadedmetadata = () => Utils.resizeCanvas();

                video.onplaying = () => {
                    loading.classList.add('display-none');
                    State.isVideoInitialized = true;
                    this.startDetection(video);
                    document.getElementById('status').textContent = "请保持脸部在框内，系统正在验证...";

                    setTimeout(() => {
                        if (!State.shadersCompiled && window.tf) {
                            ModelLoader.precompileShaders();
                        }
                    }, 100);
                };

                try {
                    await video.play();
                    setTimeout(() => {
                        if (!State.isVideoInitialized) {
                            loading.classList.add('display-none');
                            State.isVideoInitialized = true;
                            this.startDetection(video);
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
        },

        startDetection(video) {
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            let lastDetectionTime = 0;
            let detectionThrottle = Config.detectionThrottle.initial;

            setTimeout(() => {
                detectionThrottle = Config.detectionThrottle.optimized;
            }, 5000);

            async function renderFrame() {
                try {
                    const now = performance.now();
                    if (State.registeredDescriptor && State.isCanvasInitialized && 
                        (now - lastDetectionTime > detectionThrottle) && !State.isDetecting) {
                        lastDetectionTime = now;

                        try {
                            const detectorOptions = new faceapi.TinyFaceDetectorOptions({
                                inputSize: 160,
                                scoreThreshold: 0.5
                            });
                            const faceDetections = await faceapi.detectAllFaces(video, detectorOptions);

                            if (faceDetections && faceDetections.length > 0) {
                                FaceDetection.detect(video).catch(() => {});
                            } else {
                                const statusDiv = document.getElementById('status');
                                if (!State.verificationFailed) {
                                    statusDiv.textContent = "未检测到人脸，请面向摄像头";
                                    statusDiv.style.color = "#ffaa00";
                                }
                                State.matchCount = 0;
                            }
                        } catch (e) {
                            FaceDetection.detect(video).catch(() => {});
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
    };


    // ==================== Registration 模块 ====================
    const Registration = {
        // 从网络URL加载图片并注册
        async registerFromUrl(photoUrl) {
            if (!photoUrl) {
                console.error('photoUrl is required');
                return false;
            }

            try {
                document.getElementById('status').textContent = "正在加载网络图片...";
                Callbacks.triggerProgress('loading', { photoUrl });

                // 隐藏上传按钮
                const controls = document.getElementById('controls');
                if (controls) controls.style.display = 'none';

                // 加载网络图片
                const img = await this.loadImageFromUrl(photoUrl);
                if (!img) {
                    document.getElementById('status').textContent = "图片加载失败，请检查图片地址";
                    Callbacks.triggerFail({ reason: 'image_load_failed', photoUrl });
                    return false;
                }

                // 处理图片并注册
                return await this.processAndRegister(img);
            } catch (e) {
                console.error('registerFromUrl error:', e);
                document.getElementById('status').textContent = "图片加载失败，请重试";
                Callbacks.triggerFail({ reason: 'image_load_error', error: e.message });
                return false;
            }
        },

        // 从URL加载图片
        async loadImageFromUrl(url) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';  // 支持跨域
                img.onload = () => resolve(img);
                img.onerror = () => {
                    console.error('Failed to load image:', url);
                    resolve(null);
                };
                img.src = url;
            });
        },

        // 处理图片并注册人脸
        async processAndRegister(img) {
            try {
                if (!State.modelsLoaded) {
                    document.getElementById('status').textContent = "正在加载模型，请稍候...";
                    await ModelLoader.loadModels();
                }

                if (!State.shadersCompiled && window.tf) {
                    setTimeout(() => ModelLoader.precompileShaders(), 0);
                }

                document.getElementById('status').textContent = "处理照片 (40%)...";
                Callbacks.triggerProgress('processing', { progress: 40 });

                const mobile = Utils.isMobileDevice();

                // 压缩图片
                const processedImg = await this.compressImage(img, mobile);

                document.getElementById('status').textContent = "检测面部特征 (60%)...";
                Callbacks.triggerProgress('detecting', { progress: 60 });

                // 检测人脸
                const detection = await this.detectFaceInImage(processedImg, mobile);

                if (detection) {
                    State.registeredDescriptor = Utils.normalizeDescriptor(detection.descriptor);
                    State.registeredDescriptors = [State.registeredDescriptor];
                    
                    document.getElementById('status').textContent = "注册成功！正在初始化摄像头...";
                    Callbacks.triggerProgress('registered', { progress: 90 });
                    
                    await Camera.initialize();
                    return true;
                } else {
                    document.getElementById('status').textContent = "未检测到人脸，请使用清晰的正面照片";
                    Callbacks.triggerFail({ reason: 'no_face_detected' });
                    return false;
                }
            } catch (e) {
                console.error('processAndRegister error:', e);
                document.getElementById('status').textContent = "照片处理失败，请重试";
                Callbacks.triggerFail({ reason: 'process_error', error: e.message });
                return false;
            }
        },

        // 压缩图片
        async compressImage(img, mobile) {
            try {
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
                const newImg = await new Promise((resolve) => {
                    const tempImg = new Image();
                    tempImg.onload = () => resolve(tempImg);
                    tempImg.src = dataUrl;
                });

                canvas.remove();
                return newImg;
            } catch (e) {
                return img;
            }
        },

        // 检测图片中的人脸
        async detectFaceInImage(img, mobile) {
            const hasTF = window.tf !== undefined;
            let detection = null;

            const preliminaryOptions = new faceapi.TinyFaceDetectorOptions({
                inputSize: mobile ? 224 : 320,
                scoreThreshold: 0.5
            });

            if (hasTF) {
                try {
                    const preliminaryDetection = await faceapi.detectSingleFace(img, preliminaryOptions);
                    if (preliminaryDetection) {
                        document.getElementById('status').textContent = "分析特征 (75%)...";
                        detection = await faceapi.detectSingleFace(img,
                            new faceapi.TinyFaceDetectorOptions({
                                inputSize: mobile ? 320 : 416,
                                scoreThreshold: 0.4
                            })
                        ).withFaceLandmarks().withFaceDescriptor();

                        if (tf.ENV && tf.ENV.backend && tf.ENV.backend.numDataIds) {
                            tf.disposeVariables();
                        }
                    }
                } catch (e) {}
            }

            if (!detection) {
                try {
                    detection = await faceapi.detectSingleFace(img,
                        new faceapi.TinyFaceDetectorOptions({
                            inputSize: mobile ? 320 : 416,
                            scoreThreshold: 0.4
                        })
                    ).withFaceLandmarks().withFaceDescriptor();
                } catch (e) {}
            }

            return detection;
        },

        // 从文件上传注册（原有功能）
        async registerFace(e) {
            e.preventDefault();

            try {
                if (!e.target.files || e.target.files.length === 0) return;

                document.getElementById('status').textContent = "正在处理照片，请稍候...";
                Callbacks.triggerProgress('uploading', { progress: 10 });

                const file = e.target.files[0];
                const imgUrl = URL.createObjectURL(file);
                
                const img = await new Promise((resolve) => {
                    const tempImg = new Image();
                    tempImg.onload = () => resolve(tempImg);
                    tempImg.onerror = () => resolve(null);
                    tempImg.src = imgUrl;
                });

                URL.revokeObjectURL(imgUrl);

                if (!img) {
                    document.getElementById('status').textContent = "图片加载失败，请重试";
                    return;
                }

                await this.processAndRegister(img);
            } catch (e) {
                console.log("registerFace error:", e);
                document.getElementById('status').textContent = "照片处理失败，请重试";
                Callbacks.triggerFail({ reason: 'upload_error', error: e.message });
            }
        }
    };

    // ==================== Main 模块 ====================
    const Main = {
        initializeUI() {
            document.getElementById('video-container').classList.add('display-none');
            Utils.resizeCanvas();
            window.addEventListener('resize', Utils.resizeCanvas);

            ModelLoader.loadModels().then(success => {
                if (success) {
                    document.getElementById('status').textContent = "模型已就绪，请上传您的身份照片";
                    // 检查URL参数中是否有图片地址
                    this.checkUrlParams();
                }
            });
        },

        // 检查URL参数
        checkUrlParams() {
            const urlParams = new URLSearchParams(window.location.search);
            const photoUrl = urlParams.get('photo') || urlParams.get('photoUrl') || urlParams.get('img');
            
            // 检查是否禁用活体检测: ?liveness=false 或 ?liveness=0
            const livenessParam = urlParams.get('liveness');
            if (livenessParam === 'false' || livenessParam === '0') {
                Config.enableLiveness = false;
                console.log('活体检测已禁用');
            }
            
            if (photoUrl) {
                console.log('从URL参数加载图片:', photoUrl);
                Registration.registerFromUrl(photoUrl);
            }
        },

        retryVerification() {
            resetVerificationState();
            LivenessDetection.reset();

            const statusDiv = document.getElementById('status');
            statusDiv.textContent = "请保持脸部在框内，系统正在验证...";
            statusDiv.style.color = "#5c9ce6";
            statusDiv.classList.remove('verification-failed');

            document.getElementById('retry-btn').style.display = 'none';
        },

        init() {
            if (localStorage.getItem('faceApiModelsLoaded')) {
                // 检测到模型缓存记录
            }

            setTimeout(() => {
                this.initializeUI();
            }, 100);
        }
    };

    // ==================== 初始化和全局导出 ====================
    window.addEventListener('DOMContentLoaded', () => Main.init());

    // 导出全局接口
    window.registerFace = (e) => Registration.registerFace(e);
    window.retryVerification = () => Main.retryVerification();

    /**
     * 对外暴露的API接口
     * 
     * 使用方式:
     * 1. URL参数: ?photo=https://example.com/photo.jpg
     * 
     * 2. API调用:
     *    FaceVerify.init({
     *        photoUrl: 'https://example.com/photo.jpg',
     *        onSuccess: (result) => console.log('验证成功', result),
     *        onFail: (result) => console.log('验证失败', result),
     *        onProgress: (progress) => console.log('进度', progress)
     *    });
     * 
     * 3. 事件监听:
     *    window.addEventListener('faceVerifyResult', (e) => {
     *        console.log(e.detail);  // { success: true/false, ... }
     *    });
     * 
     * 4. iframe通信 (自动):
     *    父页面监听: window.addEventListener('message', (e) => {
     *        if (e.data.type === 'faceVerifyResult') {
     *            console.log(e.data);
     *        }
     *    });
     */
    window.FaceVerify = {
        // 初始化并开始验证
        init(options = {}) {
            const { 
                photoUrl, 
                onSuccess, 
                onFail, 
                onProgress,
                enableLiveness = true,  // 是否启用活体检测，默认启用
                modelPath                // 自定义模型路径
            } = options;
            
            // 设置配置
            Config.enableLiveness = enableLiveness;
            if (modelPath) Config.modelPath = modelPath;
            
            // 设置回调
            if (onSuccess) Callbacks.onSuccess = onSuccess;
            if (onFail) Callbacks.onFail = onFail;
            if (onProgress) Callbacks.onProgress = onProgress;
            
            // 如果提供了图片URL，自动开始注册
            if (photoUrl) {
                // 等待模型加载完成
                const checkAndStart = () => {
                    if (State.modelsLoaded) {
                        Registration.registerFromUrl(photoUrl);
                    } else {
                        setTimeout(checkAndStart, 100);
                    }
                };
                checkAndStart();
            }
            
            return this;
        },
        
        // 设置是否启用活体检测
        setLivenessEnabled(enabled) {
            Config.enableLiveness = enabled;
            return this;
        },
        
        // 从URL注册人脸
        registerFromUrl(photoUrl) {
            return Registration.registerFromUrl(photoUrl);
        },
        
        // 设置回调
        onSuccess(callback) {
            Callbacks.onSuccess = callback;
            return this;
        },
        
        onFail(callback) {
            Callbacks.onFail = callback;
            return this;
        },
        
        onProgress(callback) {
            Callbacks.onProgress = callback;
            return this;
        },
        
        // 重试验证
        retry() {
            Main.retryVerification();
            return this;
        },
        
        // 获取当前状态
        getState() {
            return {
                isModelLoaded: State.modelsLoaded,
                isRegistered: !!State.registeredDescriptor,
                isLivenessActive: State.isLivenessActive,
                livenessStep: State.livenessStep,
                verificationFailed: State.verificationFailed,
                currentSimilarity: State.currentSimilarity
            };
        },
        
        // 版本信息
        version: '1.0.0'
    };

    // 调试接口
    window.livenessDetection = {
        start: () => LivenessDetection.start(),
        reset: () => LivenessDetection.reset(),
        isActive: () => State.isLivenessActive,
        getStep: () => State.livenessStep,
        skipAll: () => {
            if (State.isLivenessActive) {
                LivenessDetection.complete();
                console.log('跳过所有活体检测');
            }
        }
    };

})();
