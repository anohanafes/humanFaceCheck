# humanFaceCheck

人脸识别验证系统，支持活体检测

## 功能特性

- 🎯 人脸注册 - 上传身份照片提取特征
- 🔒 活体检测 - 动作验证，防止照片欺骗
- ✅ 人脸验证 - 实时摄像头比对身份

## 安装

```bash
npm install humanfacecheck
```

## 使用方式

### 1. URL 参数调用

```
index.html?photo=https://example.com/photo.jpg
```

### 2. API 调用

```javascript
FaceVerify.init({
  photoUrl: 'https://example.com/photo.jpg',
  onSuccess: (result) => console.log('验证成功', result),
  onFail: (result) => console.log('验证失败', result)
});
```

### 3. 事件监听

```javascript
window.addEventListener('faceVerifyResult', (e) => {
  console.log(e.detail);
});
```

## 技术栈

- face-api.js
- TensorFlow.js
- TinyFaceDetector

## License

MIT
