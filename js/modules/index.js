/**
 * Face Verify - ES Module 入口
 * 
 * 使用方式:
 * import FaceVerify from 'face-verify';
 * 
 * FaceVerify.init({
 *     photoUrl: 'https://example.com/photo.jpg',
 *     enableLiveness: true,
 *     onSuccess: (result) => console.log('成功', result),
 *     onFail: (result) => console.log('失败', result)
 * });
 */

export { state as State, config as Config, resetVerificationState, resetLivenessState } from './config.js';
export { normalizeDescriptor, calculateSimilarity, getSmoothSimilarity, isMobileDevice, resizeCanvas } from './utils.js';
export { loadModels, preWarmModels, precompileShaders } from './modelLoader.js';
export { 
    detectMouthOpen, 
    detectHeadShake, 
    startLivenessDetection, 
    resetLivenessDetection,
    processLivenessDetection 
} from './livenessDetection.js';
export { detectFaces } from './faceDetection.js';
export { initializeCamera } from './camera.js';
export { registerFace } from './registration.js';

// 默认导出完整的 FaceVerify 对象
// 注意：ES Module 版本需要在支持模块的环境中使用
// 如果需要在浏览器中直接使用，请引入 js/app.js
export default {
    version: '1.0.0',
    
    // 这里只是类型定义，实际实现在 app.js 中
    // ES Module 版本主要用于类型提示和按需导入
    init: (options) => {
        console.warn('ES Module 版本暂不支持完整功能，请使用 js/app.js');
        return window.FaceVerify?.init(options);
    }
};
