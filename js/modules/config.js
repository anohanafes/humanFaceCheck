/**
 * 配置常量和全局状态管理
 */

// 全局状态对象
export const state = {
    // 注册相关
    registeredDescriptor: null,      // 存储注册特征
    registeredDescriptors: [],       // 存储多个特征向量
    
    // 验证相关
    matchCount: 0,                   // 连续匹配成功次数
    failCount: 0,                    // 连续匹配失败次数
    currentSimilarity: 0,            // 当前匹配度
    similarityHistory: [],           // 存储历史相似度记录
    detections: [],                  // 存储最新的检测结果
    
    // 状态标志
    isVideoInitialized: false,       // 视频是否初始化
    isCanvasInitialized: false,      // Canvas是否初始化
    isDetecting: false,              // 检测中标志
    verificationFailed: false,       // 验证失败标志
    modelsLoaded: false,             // 模型加载状态
    shadersCompiled: false,          // 着色器编译状态
    reportSent: false,               // 是否已发送报告
    
    // 活体检测相关
    livenessStep: 0,                 // 0: 张嘴, 1: 摇头, 2: 验证
    isLivenessActive: false,
    livenessTransitioning: false,    // 步骤切换中，防止提示被覆盖
    
    // 张嘴检测
    mouthOpenCount: 0,
    lastMouthOpenTime: 0,
    mouthWasOpen: false,
    mouthBaseline: null,
    mouthOpenStartTime: 0,
    
    // 摇头检测
    shakeCount: 0,
    headShakeDirection: 0,
    shakeSequence: [],
    lastShakeTime: 0,
    ratioBaseline: null
};

// 配置常量
export const config = {
    // 验证配置
    maxFailCount: 4,                 // 最大失败次数
    requiredMatchFrames: 3,          // 需要连续匹配成功的帧数
    maxDescriptors: 5,               // 最多存储的特征向量数量
    maxSimilarityFrames: 12,         // 存储最近几帧的相似度
    
    // 活体检测配置
    requiredMouthOpens: 1,           // 需要张嘴次数
    requiredShakes: 1,               // 需要摇头次数
    mouthOpenThreshold: 0.7,         // 张嘴阈值 (嘴高/嘴宽比例，越大要求张嘴幅度越大)
    mouthOpenDuration: 800,          // 张嘴持续时间 (ms)
    headShakeThreshold: {            // 摇头阈值
        right: 1.5,                  // 向右转头阈值 (越大要求转头幅度越大)
        left: 0.67                   // 向左转头阈值 (越小要求转头幅度越大)
    },
    
    // 模型路径
    modelPath: './faceModels',
    
    // 检测配置
    detectionThrottle: {
        initial: 300,                // 初始检测间隔(ms)
        optimized: 200               // 优化后检测间隔(ms)
    }
};

// 重置验证状态
export function resetVerificationState() {
    state.matchCount = 0;
    state.failCount = 0;
    state.verificationFailed = false;
    state.similarityHistory = [];
    state.reportSent = false;
    state.isDetecting = false;
}

// 重置活体检测状态
export function resetLivenessState() {
    state.isLivenessActive = false;
    state.livenessStep = 0;
    state.livenessTransitioning = false;
    state.mouthOpenCount = 0;
    state.mouthWasOpen = false;
    state.mouthBaseline = null;
    state.lastMouthOpenTime = 0;
    state.mouthOpenStartTime = 0;
    state.shakeCount = 0;
    state.headShakeDirection = 0;
    state.shakeSequence = [];
    state.lastShakeTime = 0;
    state.ratioBaseline = null;
}
