# Iconfont assets

Linear outline icons built from SVG sources in `svg/`.

## Regenerate

```bash
cd qimeng-miniprogram
npx fantasticon static/iconfont/svg -o static/iconfont -n iconfont -t woff2 -t woff -t ttf -g css --normalize
```

Then copy unicode rules from `iconfont.css` into `iconfont.wxss` if class names change.

## WeChat path rules

- `@font-face` lives in `iconfont-face.wxss` as **base64** (WeChat devtools block `url('/static/...ttf')`).
- After regenerating `iconfont.ttf`, rebuild face file:
  `base64 -i static/iconfont/iconfont.ttf | tr -d '\\n' | pbcopy` then paste into `iconfont-face.wxss`, or run:
  `B64=\$(base64 -i static/iconfont/iconfont.ttf | tr -d '\\n'); printf '%s' \"@font-face{font-family:iconfont;src:url('data:font/truetype;charset=utf-8;base64,\$B64') format('truetype');}\" > static/iconfont/iconfont-face.wxss`
- Do **not** use `./iconfont.woff2` in page wxss (breaks on each page path).
- Glyph rules live in `iconfont.wxss`; import both face + glyphs from `app.wxss`.
- Use `<view class="iconfont icon-xxx">` instead of `<text>` (component wxss forbids tag selectors).

## Icon classes

| Class | Usage |
|-------|--------|
| `icon-contacts` | Tab / 人脉空状态 |
| `icon-task` | Tab / 我发布空状态 |
| `icon-user` | Tab 我的 |
| `icon-search` | 搜索框 |
| `icon-mail` | 信封 / 邮箱 |
| `icon-phone` | 电话 |
| `icon-lock` | 隐私 |
| `icon-friends` | 好友 / 好友申请 |
| `icon-recommend` | 推荐 |
| `icon-notification` | 系统通知 |
| `icon-task-list` | 任务列表 |
| `icon-activity` | 活动 |
| `icon-community` | 圈子 / 贡献 |
