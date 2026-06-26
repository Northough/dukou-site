# 原作指路https://github.com/heychim/dukou-site
施工中,应原作要求不作授权

## 改了什么：

### 1.增加了terminal

### 2.ombrebrain适配
ombrebrain指路https://github.com/P0luz/Ombre-Brain
  1. 进 设置 -> 记忆与上下文
  2. Memory Mode 选 Ombre
  3. 在 OmbreBrain Dashboard URL 填：
      - 云端：https://你的域名/dashboard
      - 本地：http://127.0.0.1:18001/dashboard
注意：： 
OmbreBrain 是被 dukou 用 iframe 嵌进去，而且两边不是同一个站点/同源，浏览器会把它当成第三方 iframe。SameSite=Lax
  的 cookie 在 iframe 里通常不会正常保存/发送，所以现象就是：

  - 密码明明对
  - 点登录后像没反应
  - 或刷新/跳转后又回登录页

  解决方案有三个：

  1. 最稳：把 OmbreBrain 放到 dukou 同一个域名下面的路径，需要云服务器+cloudflareTunnel
     例如：
     dukou：https://你的域名
     ombrebrain-dashboard：https://你的域名/ombre/dashboard
     这样 cookie 不再是第三方 iframe，登录会正常。

  2. 不改 OmbreBrain：dukou 里不 iframe 登录页，改成“打开 OmbreBrain dashboard”按钮
     这会跳到 OmbreBrain 自己页面，登录最稳定。

  3. 改 OmbreBrain cookie：设置 SameSite=None; Secure
     但这要改 OmbreBrain 后端，而且必须 HTTPS。
     大概就是改 /Ombre-Brain/server.py:735 附近：
        response.set_cookie(
            "ombre_session",
            token,
            httponly=True,
            samesite="none",
            secure=True,
            max_age=86400 * 7,
        )
  - 必须 HTTPS，secure=True 在纯 http://127.0.0.1 本地 iframe 里可能不好用。
  - 浏览器仍可能受第三方 cookie 策略影响，尤其是移动端 WebView。

### 3.增加了计时任务功能
教程致谢：小红书 http://xhslink.com/o/1keRn3ovzEK 

# 以下为原版readme.md内容
# Personal AI Chat Frontend Reference

这是一个个人 AI 陪伴 / 人机恋聊天前端参考项目。

当前仓库只包含前端示例，不包含后端、真实 API key、真实聊天记录、真实记忆库数据。

## 适合参考什么

- 私人聊天式 AI 前端结构
- React + Vite 移动端页面组织
- 聊天页气泡、输入框、引用、历史回看等交互
- 功能页动态、信箱、书影、日程、提醒、日记等模块组织
- mock 数据如何支撑前端独立运行
- localStorage / IndexedDB 如何承担本地状态
- 未来如何预留模型调用、记忆网关和后端接口

## 不包含什么

- 不包含真实后端
- 不包含真实记忆库
- 不包含 Supabase / Notion 数据
- 不包含 kiwi-mem 数据
- 不包含真实 API key
- 不包含真实聊天记录
- 不包含真实用户数据

## 默认模式

公开副本建议默认使用 mock 模式。

真实模型、后端、记忆库接入需要自行配置。不要把真实 API key 写进代码或提交到 Git。

## 素材声明

本项目中的部分视觉素材仅用于个人学习和私下测试，不随代码授予再分发、商用或二次授权许可。

如果你要正式发布、商用、公开分发自己的版本，请替换为你自己拥有授权的素材，并自行确认字体与图片素材授权。

## 运行方式

```bash
npm install
npm run dev
npm run build
```


## 本地点测

运行后打开终端显示的本地地址，通常是 `http://localhost:5173/`。

建议先点测：

- 入口页进入聊天页
- 聊天发送和 mock 回复
- 引用消息、历史搜索、窗口切换
- 功能页的动态、信箱、书影、日程、提醒、小机日记
- 设置页的 mock / direct_model / backend_gateway 说明

## 修改入口

更详细的前端架构、修改方式、边界、后端接入计划和功能联通说明见 `docs/FRONTEND_REFERENCE.md`。

## 上传前检查

上传公开仓库前确认不要包含：

- `node_modules/`
- `dist/`
- `.env` 或任何真实 API key
- 真实聊天记录、真实用户数据、真实记忆库导出

本仓库默认不授予正式开源许可证。如需正式开源，请先自行补充 LICENSE 并确认素材与字体授权。
