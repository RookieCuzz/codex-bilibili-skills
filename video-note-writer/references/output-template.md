# Output Template

Use this structure when generating a tutorial-style note.

```md
# 《{{视频标题}}》笔记

> 视频链接：{{视频链接}}
> 视频 ID：{{视频ID}}
> 分 P：{{分P信息}}
> 输出文件名：`《{{视频标题}}》笔记.md`
> 生成依据：`sectioned.md` + `subtitles.json` + 可选关键帧 + 可选外部资料
> 说明：正文中的“视频内容”和“知识拓展”需要分层展示。

## 一、先看结论

- 这期视频主要在讲什么：
- 最重要的 3 个结论：
- 如果只看一分钟，至少记住什么：

## 二、视频在讲什么

- 视频主题：
- 核心脉络：
- 适合谁看：
- 看完应掌握：

## 三、章节教程笔记

### 1. {{章节标题}}（{{起止时间}}）

![{{图注}}]({{图片路径}})

> 主图时间戳：{{主图时间戳}}

#### 这一段在讲什么

- ...

#### 为什么重要

- ...

#### 人话解释 / 小白讲解

- ...

#### 关键知识点

- ...

#### 公式与表格

- 无 / 或写出公式与表格

![{{图示图注}}]({{图示图片路径}})

> 图示时间戳：{{图示时间戳}}

#### 延伸知识

- ...

#### 容易误解的点

- ...

#### 本节证据

- 字幕：
- 画面：
- 外部资料：
- 待复核：

## 四、术语解释

- 术语 A：
- 术语 B：

## 五、重点公式与表格汇总

- 无 / 或汇总

## 六、一分钟复习版

- ...

## 七、待复核项

- ...
```

Notes:

- If a chapter has no suitable image, omit the image line instead of inventing one.
- If there are multiple strong images, keep only one main image per chapter unless the user asks for more.
- If a chapter has a dedicated formula, table, or diagram frame, place it near the relevant subsection instead of only at the top.
- If a formula comes from external verification rather than directly from the video, label it clearly.
- If visual evidence is missing, keep the gap explicit instead of pretending the image exists.
