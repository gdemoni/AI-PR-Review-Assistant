# Marp PPT 生成器

使用 Marp 将 Markdown 转换为专业的 PowerPoint 演示文稿。

## 用户输入

$ARGUMENTS

## 任务要求

请根据用户的输入内容，使用 Marp Markdown 格式生成演示文稿，然后转换为 PPTX 文件。

### 生成流程

1. **分析主题**：理解用户输入的主题和需求
2. **编写 Marp Markdown**：创建符合 Marp 格式的 Markdown 文件
3. **转换为 PPTX**：使用 Marp CLI 将 Markdown 转为 PPTX
4. **清理临时文件**：删除中间 Markdown 文件

### Marp Markdown 格式

```markdown
---
marp: true
theme: default
paginate: true
size: 16:9
style: |
  section {
    font-family: 'Microsoft YaHei', sans-serif;
  }
  h1 {
    color: #2563eb;
  }
  h2 {
    color: #1e40af;
  }
---

# 演示文稿标题

## 副标题

作者：XXX
日期：2024年

---

## 目录

1. 第一部分
2. 第二部分
3. 第三部分
4. 总结

---

## 第一部分：标题

- 要点一
- 要点二
- 要点三

---

## 总结

- 关键要点回顾
- 下一步行动

<!-- _class: lead -->
```

### 输出要求

1. 先生成 `slides.md` 文件（Marp 格式）
2. 使用命令 `marp slides.md --pptx --allow-local-files` 转换
3. 输出文件为 `slides.pptx`
4. 转换完成后删除中间文件 `slides.md`

### Marp 特性

- 支持 `---` 分隔幻灯片
- 支持 `<!-- _class: lead -->` 等注释指令
- 支持 CSS 样式自定义
- 支持 `paginate: true` 显示页码
- 支持多种主题（default、gaia、uncover）
