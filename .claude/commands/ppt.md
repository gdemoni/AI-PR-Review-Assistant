# PPT 生成器

根据用户需求生成专业的 PowerPoint 演示文稿。

## 用户输入

$ARGUMENTS

## 任务要求

请根据用户的输入内容，生成一份完整的 PowerPoint 演示文稿（.pptx 文件）。

### 生成流程

1. **分析主题**：理解用户输入的主题和需求，确定演示文稿的结构
2. **设计大纲**：规划每张幻灯片的标题、内容和类型
3. **编写代码**：使用 `python-pptx` 库生成 PPTX 文件
4. **运行脚本**：执行 Python 脚本生成文件

### 幻灯片结构建议

- **封面页**：标题 + 副标题 + 作者/日期
- **目录页**（可选）：列出主要章节
- **内容页**：每页聚焦一个要点，使用要点列表或分栏布局
- **图表/图片页**（如适用）：数据可视化
- **总结页**：要点回顾
- **Q&A 页**（可选）：致谢/提问

### 代码规范

使用以下 Python 脚本模板生成 PPT：

```python
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

def create_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # --- 在此处添加幻灯片 ---
    # 使用 add_slide() 方法添加每张幻灯片

    output_path = "output.pptx"
    prs.save(output_path)
    print(f"PPT 已生成: {output_path}")
    return output_path

if __name__ == "__main__":
    create_presentation()
```

### 设计风格指南

- 使用统一的配色方案（推荐深色标题 + 浅色背景）
- 标题字体大小：28-36pt
- 正文字体大小：18-24pt
- 保持每页内容简洁，避免文字过多
- 使用 bullet points 组织内容
- 适当使用形状和颜色块增加视觉效果

### 输出要求

- 生成的文件保存为 `output.pptx`
- 使用 Python 的 `pptx` 库
- 确保脚本可以直接运行，无需额外配置
- 文件保存在当前工作目录下
