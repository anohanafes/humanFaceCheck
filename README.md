# humanFaceCheck

轻量级浏览器端人脸识别验证系统，支持活体检测、网络图片注册、跨项目交互。

[![npm version](https://img.shields.io/npm/v/humanfacecheck.svg)](https://www.npmjs.com/package/humanfacecheck)
[![GitHub](https://img.shields.io/badge/GitHub-anohanafes-blue?logo=github)](https://github.com/anohanafes/humanFaceCheck)
[![Gitee](https://img.shields.io/badge/Gitee-wang--qiuning-red?logo=gitee)](https://gitee.com/wang-qiuning/human-face-check)

## 功能特性

- 🎯 **人脸注册** - 支持本地上传或网络图片 URL
- 🔒 **活体检测** - 动作验证，有效防止照片/视频欺骗攻击
- ✅ **实时验证** - 摄像头实时比对，快速完成身份确认
- 📷 **图片对比模式** - 纯图片比对，无需摄像头权限
- 🌐 **跨项目集成** - 支持 iframe 嵌入、postMessage 通信，多种结果返回方式

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

### 集成方式

#### 1. URL 参数（适合跳转场景）

```
# 摄像头模式（默认）
https://your-domain.com/index.html?photo=https://example.com/avatar.jpg

# 图片对比模式
https://your-domain.com/index.html?photo=https://example.com/avatar.jpg&mode=photo
```

#### 2. JS API 调用（适合 SPA 集成）

```javascript
// 摄像头模式（默认）
FaceVerify.init({
  photoUrl: 'https://example.com/avatar.jpg',
  enableLiveness: true,  // 是否启用活体检测，默认 true
  onSuccess: (result) => console.log('验证成功', result.similarity),
  onFail: (result) => console.log('验证失败', result.reason),
  onProgress: (step) => console.log('当前步骤', step)
});

// 图片对比模式（无需摄像头）
FaceVerify.init({
  photoUrl: 'https://example.com/avatar.jpg',
  mode: 'photo',
  onSuccess: (result) => console.log('验证成功', result.similarity),
  onFail: (result) => console.log('验证失败', result.reason)
});
```

#### 3. iframe 嵌入（适合跨项目集成）

```html
<iframe id="faceVerify" src="https://your-domain.com/index.html?mode=photo"></iframe>

<script>
const iframe = document.getElementById('faceVerify');

// 等待 iframe 加载完成后发送 base64 图片
iframe.onload = () => {
  iframe.contentWindow.postMessage({
    type: 'setPhoto',
    photo: 'data:image/jpeg;base64,/9j/4AAQ...', // base64 图片
    mode: 'photo'  // 可选：'photo' 或 'camera'
  }, '*');
};

// 监听验证结果
window.addEventListener('message', (e) => {
  if (e.data.type === 'faceVerifyResult') {
    console.log(e.data.success ? '验证通过' : '验证失败');
    console.log('相似度:', e.data.similarity);
  }
});
</script>
```

> 💡 **性能提示**：通过 URL 传入身份照片时，系统需要先下载图片，可能较慢。推荐使用 postMessage + base64 方式直接传递图片数据。

### 结果获取方式

验证完成后，结果会通过以下三种方式同时返回：

1. **回调函数** - 初始化时传入 `onSuccess` / `onFail`
2. **事件监听** - 监听 `faceVerifyResult` 事件（适合代码解耦场景）
3. **postMessage** - iframe 嵌入时自动向父窗口发送消息

```javascript
// 方式1：回调函数
FaceVerify.init({
  onSuccess: (result) => { /* ... */ },
  onFail: (result) => { /* ... */ }
});

// 方式2：事件监听
window.addEventListener('faceVerifyResult', (e) => {
  const { success, similarity, message } = e.detail;
});

// 方式3：postMessage（iframe 场景）
window.addEventListener('message', (e) => {
  if (e.data.type === 'faceVerifyResult') { /* ... */ }
});
```

### 两种验证模式对比

| 特性 | 摄像头模式（默认） | 图片对比模式 |
|-----|------------------|-------------|
| 摄像头权限 | 需要 | 不需要 |
| 活体检测 | 支持 | 不支持 |
| 安全性 | 较高 | 较低 |
| 适用场景 | 身份验证、签到 | 简单比对、低风险场景 |

> ⚠️ **安全提示**：图片对比模式没有活体检测，安全性较低，仅适用于低风险场景。

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

## 适用场景

- ✅ 内部系统身份确认
- ✅ 签到/打卡
- ✅ 普通 App 人脸登录
- ✅ 学习/演示

不适用于银行开户、实名认证等高安全场景，这类场景建议使用专业云服务。

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
