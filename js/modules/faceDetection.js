/**
 * 人脸检测和验证模块
 */

import { state, config } from './config.js';
import { normalizeDescriptor, calculateSimilarity, getSmoothSimilarity, isMobileDevice } from './utils.js';
import { startLivenessDetection, processLivenessDetection } from './livenessDetection.js';
import { triggerSuccess, triggerFail } from './callbacks.js';

/**
 * 人脸检测函数
 */
export async function detectFaces(video) {
    // 如果已发送报告（验证成功或失败），不再检测
    if (!state.registeredDescriptor || state.isDetecting || state.verificationFailed || state.reportSent) {
        return state.detections;
    }

    // 如果活体检测未激活，先启动活体检测
    if (!state.isLivenessActive && state.livenessStep === 0 && state.registeredDescriptor) {
        startLivenessDetection();
    }

    try {
        state.isDetecting = true;

        const mobile = isMobileDevice();
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
                newDetections = await faceapi.detectAllFaces(
                    video,
                    new faceapi.TinyFaceDetectorOptions({
                        inputSize: 320,
                        scoreThreshold: 0.35
                    })
                ).withFaceLandmarks().withFaceDescriptors();
            } catch (detectionError) {
                newDetections = [];
            }
        }

        let maxSimilarity = 0;
        let results = [];

        if (newDetections.length === 0) {
            // 只有在身份验证阶段才计算失败次数
            if (state.livenessStep >= 2 && !state.isLivenessActive) {
                state.failCount++;
            }
        } else {
            let hasMatch = false;

            newDetections.forEach(detection => {
                const landmarks = detection.landmarks.positions;
                const faceBox = detection.detection.box;
                
                // 活体检测进行中（step < 2 表示还没完成）
                if (state.isLivenessActive && state.livenessStep < 2) {
                    processLivenessDetection(landmarks, faceBox);
                    return;
                }
                
                // 活体检测未完成，跳过身份验证
                if (state.livenessStep < 2) {
                    return;
                }
                
                // 到这里说明活体检测已完成（livenessStep >= 2），开始身份验证
                const normalizedDescriptor = normalizeDescriptor(detection.descriptor);
                let bestDistance = 1.0;

                bestDistance = faceapi.euclideanDistance(state.registeredDescriptor, normalizedDescriptor);

                if (state.registeredDescriptors.length > 0) {
                    for (const regDesc of state.registeredDescriptors) {
                        const dist = faceapi.euclideanDistance(regDesc, normalizedDescriptor);
                        if (dist < bestDistance) {
                            bestDistance = dist;
                        }
                    }
                }

                const similarity = calculateSimilarity(bestDistance);

                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;

                    // 添加到特征库
                    if (similarity > 90 && state.registeredDescriptors.length < config.maxDescriptors) {
                        let isUnique = true;
                        let minDiffDistance = 1.0;

                        for (const regDesc of state.registeredDescriptors) {
                            const diffDist = faceapi.euclideanDistance(regDesc, normalizedDescriptor);
                            minDiffDistance = Math.min(minDiffDistance, diffDist);
                            if (diffDist < 0.18) {
                                isUnique = false;
                                break;
                            }
                        }

                        if (isUnique && minDiffDistance >= 0.18) {
                            state.registeredDescriptors.push(normalizedDescriptor);
                            if (state.registeredDescriptors.length > config.maxDescriptors) {
                                state.registeredDescriptors.shift();
                            }
                        }
                    }
                }

                const box = detection.detection.box;
                const faceSize = Math.max(box.width, box.height);

                let dynamicThreshold;
                if (faceSize > 200) {
                    dynamicThreshold = 0.29;
                } else if (faceSize > 150) {
                    dynamicThreshold = 0.33;
                } else if (faceSize > 100) {
                    dynamicThreshold = 0.36;
                } else {
                    dynamicThreshold = 0.39;
                }

                if (bestDistance < dynamicThreshold) {
                    const margin = dynamicThreshold - bestDistance;
                    if (margin > 0.08) {
                        state.matchCount += 2;
                    } else {
                        state.matchCount += 1;
                    }
                    state.matchCount = Math.min(state.matchCount, config.requiredMatchFrames + 1);
                    state.failCount = 0;
                    hasMatch = true;
                } else {
                    if (bestDistance < dynamicThreshold + 0.05) {
                        state.matchCount = Math.max(0, state.matchCount - 1);
                    } else {
                        state.matchCount = Math.max(0, state.matchCount - 2);
                    }
                    if (!hasMatch) state.failCount++;
                }

                results.push({
                    box: box,
                    label: `${similarity.toFixed(1)}% (${bestDistance.toFixed(3)}) ${bestDistance < dynamicThreshold ? '✅' : '❌'}`
                });
            });
        }

        const smoothedSimilarity = getSmoothSimilarity(maxSimilarity);
        state.currentSimilarity = smoothedSimilarity;

        const statusDiv = document.getElementById('status');
        const retryBtn = document.getElementById('retry-btn');

        if (state.matchCount >= config.requiredMatchFrames) {
            state.reportSent = true;
            statusDiv.textContent = "验证通过！";
            statusDiv.style.color = "#00ff99";
            retryBtn.style.display = 'none';
            // 触发成功回调
            triggerSuccess({ similarity: smoothedSimilarity });
        } else if (state.failCount >= config.maxFailCount && !state.verificationFailed) {
            state.verificationFailed = true;
            state.reportSent = true;
            statusDiv.textContent = "验证失败！请点击下方按钮重试";
            statusDiv.style.color = "#ff4c4c";
            statusDiv.classList.add('verification-failed');
            retryBtn.style.display = 'block';
            // 触发失败回调
            triggerFail({ reason: '人脸匹配失败', similarity: smoothedSimilarity });
        } else if (!state.verificationFailed) {
            statusDiv.textContent = "请保持面部在框内，系统正在验证...";
            statusDiv.style.color = "#5c9ce6";
        }

        state.detections = results;
        return results;
    } catch (e) {
        state.failCount++;
        return state.detections;
    } finally {
        state.isDetecting = false;
    }
}
