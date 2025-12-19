/**
 * Face Verify - ES Module 入口
 * 
 * 使用方式:
 * import FaceVerify from 'humanfacecheck';
 * 
 * FaceVerify.init({
 *     photoUrl: 'https://example.com/photo.jpg',
 *     enableLiveness: true,
 *     onSuccess: (result) => console.log('成功', result),
 *     onFail: (result) => console.log('失败', result)
 * });
 */

// 导出配置和状态
export { state as State, config as Config, resetVerificationState, resetLivenessState } from './config.js';

// 导出工具函数
export { normalizeDescriptor, calculateSimilarity, getSmoothSimilarity, isMobileDevice, resizeCanvas } from './utils.js';

// 导出模型加载
export { loadModels, preWarmModels, precompileShaders } from './modelLoader.js';

// 导出活体检测
export { 
    detectMouthOpen, 
    detectHeadShake, 
    startLivenessDetection, 
    resetLivenessDetection,
    processLivenessDetection 
} from './livenessDetection.js';

// 导出人脸检测
export { detectFaces } from './faceDetection.js';

// 导出摄像头
export { initializeCamera } from './camera.js';

// 导出注册
export { registerFace, registerFaceFromFile } from './registration.js';

// 导出回调管理
export { setCallbacks, triggerSuccess, triggerFail, triggerProgress, parseUrlParams } from './callbacks.js';

// 导出主模块
export { FaceVerify } from './main.js';

// 默认导出 FaceVerify
export { default } from './main.js';
