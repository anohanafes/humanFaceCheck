# humanFaceCheck

轻量级浏览器端人脸识别验证系统，支持活体检测、网络图片注册、跨项目交互。

[![npm version](https://img.shields.io/npm/v/humanfacecheck.svg)](https://www.npmjs.com/package/humanfacecheck)
[![GitHub](https://img.shields.io/badge/GitHub-anohanafes-blue?logo=github)](https://github.com/anohanafes/humanFaceCheck)
[![Gitee](https://img.shields.io/badge/Gitee-wang--qiuning-red?logo=gitee)](https://gitee.com/wang-qiuning/human-face-check)

## 功能特性

- 🎯 **人脸注册** - 支持本地上传或网络图片 URL
- 🔒 **活体检测** - 动作验证，有效防止照片/视频欺骗攻击
- ✅ **实时验证** - 摄像头实时比对，快速完成身份确认
- 🌐 **跨项目集成** - 支持 iframe 嵌入、postMessage 通信、事件回调

## 安装

```bash
npm install humanfacecheck
```

或直接引入：

```html
<script src="./faceTools/tf.min.js"></script>
<script src="./faceTools/face-api.js"></script>
<script type="module" src="./js/modules/main.js"></script>
```

## 使用方式

### 1. URL 参数（适合跳转场景）

```
https://your-domain.com/index.html?photo=https://example.com/avatar.jpg
```

### 2. API 调用（适合 SPA 集成）

```javascript
FaceVerify.init({
  photoUrl: 'https://example.com/avatar.jpg',
  enableLiveness: true,  // 是否启用活体检测，默认 true
  onSuccess: (result) => {
    console.log('验证成功', result.similarity);
  },
  onFail: (result) => {
    console.log('验证失败', result.reason);
  },
  onProgress: (step) => {
    console.log('当前步骤', step);
  }
});

// 禁用活体检测（仅人脸比对）
FaceVerify.init({
  photoUrl: 'https://example.com/avatar.jpg',
  enableLiveness: false
});
```

### 3. 事件监听（适合解耦场景）

```javascript
window.addEventListener('faceVerifyResult', (e) => {
  const { success, similarity, message } = e.detail;
  // 处理验证结果
});
```

### 4. iframe 嵌入（适合跨项目集成）

```html
<iframe id="faceVerify" src="https://your-domain.com/index.html?photo=xxx"></iframe>

<script>
window.addEventListener('message', (e) => {
  if (e.data.type === 'faceVerifyResult') {
    console.log(e.data.success ? '验证通过' : '验证失败');
  }
});
</script>
```

## 返回结果

```javascript
{
  success: true,           // 是否验证成功
  message: '验证通过',      // 结果描述
  similarity: 92.5,        // 相似度 (0-100)
  timestamp: 1702123456789 // 时间戳
}
```

## 配置参数

可在 `js/modules/config.js` 中调整以下参数：

| 参数 | 默认值 | 说明 |
|-----|-------|------|
| mouthOpenThreshold | 0.7 | 张嘴阈值，越大要求张嘴幅度越大 |
| mouthOpenDuration | 800 | 张嘴持续时间(ms) |
| headShakeThreshold.right | 1.5 | 向右转头阈值，越大要求幅度越大 |
| headShakeThreshold.left | 0.67 | 向左转头阈值，越小要求幅度越大 |
| maxFailCount | 4 | 最大连续失败次数 |
| requiredMatchFrames | 3 | 需要连续匹配成功的帧数 |

## 技术栈

- face-api.js - 人脸检测与特征提取
- TensorFlow.js - 深度学习推理
- TinyFaceDetector - 轻量级检测模型

## 文档

- [算法详解](./docs/ALGORITHM.md) - 核心算法原理和关键代码实现

## 致谢

- [face-api.js](https://github.com/justadudewhohacks/face-api.js) - 优秀的浏览器端人脸识别库
- [TensorFlow.js](https://github.com/tensorflow/tfjs) - 强大的 JavaScript 机器学习框架

## License

MIT
