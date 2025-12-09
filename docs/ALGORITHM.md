# humanFaceCheck 算法详解

本文档详细说明人脸识别验证系统的核心算法原理和关键代码实现。

## 目录

- [整体流程](#整体流程)
- [人脸特征提取](#人脸特征提取)
- [特征向量归一化](#特征向量归一化)
- [欧氏距离计算](#欧氏距离计算)
- [相似度转换](#相似度转换)
- [动态阈值判定](#动态阈值判定)
- [连续帧验证机制](#连续帧验证机制)
- [相似度平滑处理](#相似度平滑处理)
- [多特征向量优化](#多特征向量优化)
- [活体检测](#活体检测)

---

## 整体流程

```
用户上传照片 → 提取特征向量 → 开启摄像头 → 活体检测 → 实时人脸比对 → 返回结果
```

1. **注册阶段**：从用户上传的照片中提取 128 维人脸特征向量
2. **活体检测**：要求用户完成指定动作，防止照片欺骗
3. **验证阶段**：实时检测摄像头画面，与注册特征进行比对
4. **结果判定**：连续多帧匹配成功则验证通过

---

## 人脸特征提取

使用 face-api.js 的 `faceRecognitionNet` 模型提取 128 维特征向量（descriptor）。

```javascript
// 检测人脸并提取特征
const detection = await faceapi.detectSingleFace(
    image,
    new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5
    })
).withFaceLandmarks().withFaceDescriptor();

// detection.descriptor 即为 128 维 Float32Array
```

---

## 特征向量归一化

将特征向量归一化为单位向量，消除光照等因素影响，使欧氏距离计算更稳定。

```javascript
normalizeDescriptor(descriptor) {
    // 计算向量模长
    let sum = 0;
    for (let i = 0; i < descriptor.length; i++) {
        sum += descriptor[i] * descriptor[i];
    }
    const magnitude = Math.sqrt(sum);
    if (magnitude === 0) return descriptor;

    // 归一化：每个分量除以模长
    const normalized = new Float32Array(descriptor.length);
    for (let i = 0; i < descriptor.length; i++) {
        normalized[i] = descriptor[i] / magnitude;
    }
    return normalized;
}
```

**原理**：归一化后的向量模长为 1，两个归一化向量的欧氏距离范围为 [0, 2]。

---

## 欧氏距离计算

使用欧氏距离衡量两个特征向量的差异程度。

```javascript
// face-api.js 内置方法
const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
```

**欧氏距离公式**：

```
d = √(Σ(a[i] - b[i])²)
```

- 距离越小，表示两张人脸越相似
- 距离为 0 表示完全相同
- 归一化后距离范围：0 ~ 2

---

## 相似度转换

将欧氏距离转换为 0-100 的相似度百分比，便于用户理解。

```javascript
calculateSimilarity(distance) {
    if (distance > 0.45) {
        // 距离 > 0.45：相似度 5% ~ 25%
        return Math.max(5, 25 - (distance - 0.45) * 100);
    } else if (distance > 0.38) {
        // 距离 0.38 ~ 0.45：相似度 25% ~ 55%
        return Math.max(25, 55 - (distance - 0.38) * 430);
    } else if (distance > 0.30) {
        // 距离 0.30 ~ 0.38：相似度 55% ~ 78%
        const ratio = (distance - 0.30) / 0.08;
        return 78 - ratio * 23;
    } else if (distance > 0.22) {
        // 距离 0.22 ~ 0.30：相似度 78% ~ 92%
        const ratio = (distance - 0.22) / 0.08;
        return 92 - ratio * 14;
    } else {
        // 距离 < 0.22：相似度 92% ~ 100%
        return 100 - distance * 36;
    }
}
```

**距离与相似度对照表**：

| 欧氏距离 | 相似度 | 匹配程度 |
|---------|-------|---------|
| 0.15 | ~95% | 极高匹配 |
| 0.20 | ~93% | 高匹配 |
| 0.25 | ~88% | 较高匹配 |
| 0.30 | ~78% | 中等匹配 |
| 0.35 | ~65% | 较低匹配 |
| 0.40 | ~47% | 低匹配 |
| 0.45 | ~25% | 极低匹配 |

---

## 动态阈值判定

根据检测到的人脸大小动态调整匹配阈值，适应不同距离下的检测精度。

```javascript
const box = detection.detection.box;
const faceSize = Math.max(box.width, box.height);

let dynamicThreshold;
if (faceSize > 200) {
    dynamicThreshold = 0.29;      // 大脸：严格阈值
} else if (faceSize > 150) {
    dynamicThreshold = 0.33;      // 中大脸
} else if (faceSize > 100) {
    dynamicThreshold = 0.36;      // 中脸
} else {
    dynamicThreshold = 0.39;      // 小脸：宽松阈值
}

// 判定是否匹配
const isMatch = bestDistance < dynamicThreshold;
```

**设计原理**：

- 人脸越大（离摄像头越近），图像质量越高，特征提取越准确，使用更严格的阈值
- 人脸越小（离摄像头越远），图像质量下降，适当放宽阈值

| 人脸大小 | 阈值 | 对应最低相似度 |
|---------|------|--------------|
| > 200px | 0.29 | ~80% |
| > 150px | 0.33 | ~72% |
| > 100px | 0.36 | ~65% |
| ≤ 100px | 0.39 | ~58% |

---

## 连续帧验证机制

要求连续多帧匹配成功才判定验证通过，避免单帧误判。

```javascript
// 配置
const Config = {
    requiredMatchFrames: 3,  // 需要连续匹配成功的帧数
    maxFailCount: 4          // 最大连续失败次数
};

// 匹配成功时
if (bestDistance < dynamicThreshold) {
    const margin = dynamicThreshold - bestDistance;
    // 匹配余量大时加速计数
    State.matchCount += (margin > 0.08) ? 2 : 1;
    State.matchCount = Math.min(State.matchCount, Config.requiredMatchFrames + 1);
    State.failCount = 0;
} else {
    // 匹配失败时递减计数
    if (bestDistance < dynamicThreshold + 0.05) {
        State.matchCount = Math.max(0, State.matchCount - 1);  // 接近阈值，慢速递减
    } else {
        State.matchCount = Math.max(0, State.matchCount - 2);  // 远离阈值，快速递减
    }
    State.failCount++;
}

// 判定最终结果
if (State.matchCount >= Config.requiredMatchFrames) {
    // 验证通过
} else if (State.failCount >= Config.maxFailCount) {
    // 验证失败
}
```

**机制说明**：

- `matchCount`：连续匹配成功计数，达到 3 则通过
- `failCount`：连续失败计数，达到 4 则失败
- 匹配余量大（距离远小于阈值）时，计数 +2 加速通过
- 接近阈值边界时，计数变化较慢，增加稳定性

---

## 相似度平滑处理

对多帧相似度进行平滑处理，减少抖动，提供稳定的显示值。

```javascript
getSmoothSimilarity(rawSimilarity) {
    // 存储历史记录
    State.similarityHistory.push(rawSimilarity);
    if (State.similarityHistory.length > Config.maxSimilarityFrames) {
        State.similarityHistory.shift();
    }
    
    // 数据不足时直接返回
    if (State.similarityHistory.length < 3) return rawSimilarity;

    // 计算中位数
    const sorted = [...State.similarityHistory].sort((a, b) => a - b);
    const medianSimilarity = sorted[Math.floor(sorted.length / 2)];
    
    // 过滤异常值（偏离中位数超过 12 的值）
    const validValues = State.similarityHistory.filter(
        val => Math.abs(val - medianSimilarity) < 12
    );
    
    if (validValues.length === 0) return medianSimilarity;

    // 计算有效值的平均值
    const avgSimilarity = validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
    
    // 当前值与平均值加权混合
    return rawSimilarity * 0.5 + avgSimilarity * 0.5;
}
```

**处理步骤**：

1. 维护最近 12 帧的相似度历史
2. 计算中位数，过滤偏离过大的异常值
3. 当前值与历史平均值各占 50% 权重

---

## 多特征向量优化

在验证过程中动态收集高质量特征，提高后续匹配准确率。

```javascript
// 当相似度 > 90% 且特征库未满时
if (similarity > 90 && State.registeredDescriptors.length < Config.maxDescriptors) {
    let isUnique = true;
    let minDiffDistance = 1.0;

    // 检查与已有特征的差异
    for (const regDesc of State.registeredDescriptors) {
        const diffDist = faceapi.euclideanDistance(regDesc, normalizedDescriptor);
        minDiffDistance = Math.min(minDiffDistance, diffDist);
        if (diffDist < 0.18) {
            isUnique = false;  // 与已有特征太相似，不添加
            break;
        }
    }

    // 添加差异足够大的新特征
    if (isUnique && minDiffDistance >= 0.18) {
        State.registeredDescriptors.push(normalizedDescriptor);
        if (State.registeredDescriptors.length > Config.maxDescriptors) {
            State.registeredDescriptors.shift();  // 超出上限时移除最旧的
        }
    }
}
```

**优化效果**：

- 最多存储 5 个不同角度/表情的特征向量
- 新特征必须与已有特征距离 ≥ 0.18，确保多样性
- 验证时取所有特征中的最小距离，提高容错率

---

## 活体检测

通过检测用户动作（张嘴、转头）防止照片/视频欺骗。

### 张嘴检测

```javascript
detectMouthOpen(landmarks) {
    // 获取嘴部关键点
    const upperLip = landmarks[51];   // 上嘴唇
    const lowerLip = landmarks[57];   // 下嘴唇
    const leftCorner = landmarks[48]; // 左嘴角
    const rightCorner = landmarks[54];// 右嘴角

    // 计算嘴部张开比例
    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
    const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);
    const mouthRatio = mouthHeight / mouthWidth;

    // 建立基线（闭嘴状态）
    if (State.mouthBaseline === null || mouthRatio < State.mouthBaseline) {
        State.mouthBaseline = mouthRatio;
    }

    // 判定张嘴：比例 > 0.4 或相对基线增大 2.5 倍
    const OPEN_THRESHOLD = 0.4;
    const isOpen = mouthRatio > OPEN_THRESHOLD || 
                   (State.mouthBaseline && mouthRatio > State.mouthBaseline * 2.5);
    
    return isOpen;
}
```

### 转头检测

```javascript
detectHeadShake(landmarks, faceBox) {
    // 获取关键点
    const noseX = landmarks[30].x;      // 鼻尖
    const leftEyeX = landmarks[36].x;   // 左眼外角
    const rightEyeX = landmarks[45].x;  // 右眼外角

    // 计算鼻子到两眼的距离比
    const leftDist = noseX - leftEyeX;
    const rightDist = rightEyeX - noseX;
    const ratio = leftDist / rightDist;

    // 判定转头方向
    const RIGHT_TURN_THRESHOLD = 1.5;  // 向右转
    const LEFT_TURN_THRESHOLD = 0.67;  // 向左转

    let currentDirection = 0;
    if (ratio > RIGHT_TURN_THRESHOLD) {
        currentDirection = 1;   // 向右
    } else if (ratio < LEFT_TURN_THRESHOLD) {
        currentDirection = -1;  // 向左
    }

    // 检测方向变化（左→右 或 右→左）
    // 连续检测到方向变化即判定为摇头
}
```

**活体检测流程**：

1. 张嘴检测：要求完成 1 次张嘴动作
2. 转头检测：要求完成 1 次左右转头
3. 超时处理：单步骤超过 6 秒自动重新开始

---

## 返回结果结构

```javascript
{
    success: true,              // 是否验证成功
    message: '验证通过',         // 结果描述
    similarity: 92.5,           // 平滑后的相似度 (0-100)
    matchCount: 3,              // 连续匹配成功帧数
    timestamp: 1702123456789    // 时间戳
}
```

---

## 配置参数说明

```javascript
const Config = {
    // 验证配置
    maxFailCount: 4,           // 最大连续失败次数
    requiredMatchFrames: 3,    // 需要连续匹配成功的帧数
    maxDescriptors: 5,         // 最多存储的特征向量数量
    maxSimilarityFrames: 12,   // 相似度平滑窗口大小
    
    // 活体检测配置
    enableLiveness: true,      // 是否启用活体检测
    requiredMouthOpens: 1,     // 需要张嘴次数
    requiredShakes: 1,         // 需要转头次数
    livenessTimeout: 6000,     // 单步骤超时时间(ms)
    
    // 检测配置
    detectionThrottle: {
        initial: 300,          // 初始检测间隔(ms)
        optimized: 200         // 优化后检测间隔(ms)
    }
};
```
