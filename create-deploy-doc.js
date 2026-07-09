import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImportedXmlComponent,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
  ExternalHyperlink,
  UnderlineType,
} from "docx";

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Usage: node create.js /absolute/path/output.docx");
}

const outputDir = path.dirname(outputPath);
const assetDir = path.join(outputDir, "assets");
fs.mkdirSync(assetDir, { recursive: true });

const T = String.raw;

// Color palette
const palette = {
  dark: "1A237E",
  primary: "283593",
  accent: "C62828",
  light: "546E7A",
  border: "D8E0E3",
  fill: "E8EAF6",
  codeBg: "F5F5F5",
};

const font = { name: "Times New Roman", eastAsia: "SimSun" };

const run = (text, options = {}) =>
  new TextRun({
    text,
    font,
    size: 24,
    ...options,
  });

const para = (children, options = {}) =>
  new Paragraph({
    spacing: { after: 160, line: 360 },
    ...options,
    children: Array.isArray(children) ? children : [children],
  });

const bodyPara = (text, options = {}) =>
  para(run(text), {
    indent: { firstLine: convertInchesToTwip(0.33) },
    ...options,
  });

const heading = (text, level = 1) =>
  para(run(text, { bold: true, size: level === 1 ? 32 : 28, color: palette.dark }), {
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
  });

const heading3 = (text) =>
  para(run(text, { bold: true, size: 26, color: palette.primary }), {
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
  });

const cell = (text, options = {}) =>
  new TableCell({
    children: [para(run(text, { size: 22 }), { spacing: { after: 80, line: 280 } })],
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    ...options,
  });

const codeCell = (text, options = {}) =>
  new TableCell({
    children: [para(run(text, { size: 20, font: { name: "Consolas", eastAsia: "Consolas" } }), { spacing: { after: 60, line: 240 } })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: { type: ShadingType.CLEAR, fill: palette.codeBg },
    ...options,
  });

const xmlEscape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const toc = (entries) => {
  const cached = entries
    .map(({ title: entryTitle, level, page }) => {
      const indent = Math.max(0, level - 1) * 360;
      return `<w:p>
        <w:pPr>
          <w:pStyle w:val="TOC${level}"/>
          <w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs>
          <w:ind w:left="${indent}"/>
        </w:pPr>
        <w:r><w:t>${xmlEscape(entryTitle)}</w:t></w:r>
        <w:r><w:tab/></w:r>
        <w:r><w:t>${xmlEscape(page)}</w:t></w:r>
      </w:p>`;
    })
    .join("");

  return ImportedXmlComponent.fromXmlString(`<w:sdt xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:sdtPr><w:alias w:val="目录"/></w:sdtPr>
    <w:sdtContent>
      <w:p>
        <w:r>
          <w:fldChar w:fldCharType="begin" w:dirty="true"/>
          <w:instrText xml:space="preserve"> TOC \\o &quot;1-3&quot; \\h \\z \\u </w:instrText>
          <w:fldChar w:fldCharType="separate"/>
        </w:r>
      </w:p>
      ${cached}
      <w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
    </w:sdtContent>
  </w:sdt>`).root[0];
};

const noteBox = (title, lines) => {
  const children = [para(run(title, { bold: true, color: palette.accent, size: 22 }), { spacing: { after: 80 } })];
  for (const line of lines) {
    children.push(
      para(run("• " + line, { size: 22, color: palette.light }), { spacing: { after: 60 } })
    );
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [9000],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children,
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            shading: { type: ShadingType.CLEAR, fill: "FFF3E0" },
            borders: {
              top: { style: "single", size: 8, color: palette.accent },
              bottom: { style: "single", size: 8, color: palette.accent },
              left: { style: "single", size: 8, color: palette.accent },
              right: { style: "single", size: 8, color: palette.accent },
            },
          }),
        ],
      }),
    ],
  });
};

const tipBox = (lines) => {
  const children = [];
  for (const line of lines) {
    children.push(
      para(run("💡 " + line, { size: 22, color: palette.primary }), { spacing: { after: 60 } })
    );
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [9000],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children,
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            shading: { type: ShadingType.CLEAR, fill: "E3F2FD" },
            borders: {
              top: { style: "single", size: 6, color: palette.primary },
              bottom: { style: "single", size: 6, color: palette.primary },
              left: { style: "single", size: 6, color: palette.primary },
              right: { style: "single", size: 6, color: palette.primary },
            },
          }),
        ],
      }),
    ],
  });
};

const cmdTable = (rows) => {
  const widths = [5400, 3600];
  const headerRow = new TableRow({
    children: [
      cell("命令", {
        shading: { type: ShadingType.CLEAR, fill: palette.fill },
        width: { size: widths[0], type: WidthType.DXA },
      }),
      cell("说明", {
        shading: { type: ShadingType.CLEAR, fill: palette.fill },
        width: { size: widths[1], type: WidthType.DXA },
      }),
    ],
  });

  const dataRows = rows.map(([cmd, desc]) =>
    new TableRow({
      children: [
        codeCell(cmd, { width: { size: widths[0], type: WidthType.DXA } }),
        cell(desc, { width: { size: widths[1], type: WidthType.DXA } }),
      ],
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
};

const varTable = (rows) => {
  const widths = [2600, 4200, 2200];
  const headerRow = new TableRow({
    children: [
      cell("变量名", {
        shading: { type: ShadingType.CLEAR, fill: palette.fill },
        width: { size: widths[0], type: WidthType.DXA },
      }),
      cell("说明", {
        shading: { type: ShadingType.CLEAR, fill: palette.fill },
        width: { size: widths[1], type: WidthType.DXA },
      }),
      cell("示例值", {
        shading: { type: ShadingType.CLEAR, fill: palette.fill },
        width: { size: widths[2], type: WidthType.DXA },
      }),
    ],
  });

  const dataRows = rows.map(([name, desc, example]) =>
    new TableRow({
      children: [
        codeCell(name, { width: { size: widths[0], type: WidthType.DXA } }),
        cell(desc, { width: { size: widths[1], type: WidthType.DXA } }),
        codeCell(example, { width: { size: widths[2], type: WidthType.DXA } }),
      ],
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
};

// Document title
const docTitle = T`密码子优化与引物合成平台 — Windows Docker 部署指南`;
const docSubtitle = T`方案一：Docker 容器化部署（推荐）`;

const sections = [
  {
    title: T`一、项目概述`,
    level: 1,
    page: 3,
    children: [
      bodyPara(T`本项目是一个密码子优化与引物合成平台，包含前端 React 应用、后端 Express API 服务，以及 PostgreSQL 数据库。系统支持基因序列的密码子优化、引物设计与批量处理功能。`),
      bodyPara(T`技术栈：`),
      para(run(T`• 前端：React 19 + Vite + Tailwind CSS + shadcn/ui`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 后端：Node.js 20 + Express + tRPC + Drizzle ORM`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 数据库：PostgreSQL 16`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 密码子优化：DNAWorks（Fortran 编译器）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      bodyPara(T`部署方案一（Docker 容器化）将所有组件打包到 Docker 容器中，无需在 Windows 本地安装 Node.js、PostgreSQL 等环境，是最简单、最推荐的部署方式。`),
    ],
  },
  {
    title: T`二、前置条件`,
    level: 1,
    page: 4,
    children: [
      heading3(T`2.1 硬件要求`),
      bodyPara(T`最低配置：`),
      para(run(T`• 操作系统：Windows 10/11（64位，专业版或企业版）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 内存：4 GB 可用 RAM（建议 8 GB 以上）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 磁盘空间：至少 10 GB 可用空间（含 Docker 镜像和数据库）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 处理器：支持虚拟化（VT-x/AMD-V）的 64 位处理器`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      heading3(T`2.2 软件要求`),
      bodyPara(T`部署前请确认已安装以下软件：`),
      para(run(T`1. Git for Windows（版本 2.40+）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`2. Docker Desktop for Windows（版本 4.25+）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      bodyPara(T`Git 下载地址：`),
      para(
        new ExternalHyperlink({
          link: "https://git-scm.com/download/win",
          children: [run(T`https://git-scm.com/download/win`, { color: "0563C1", underline: { type: UnderlineType.SINGLE } })],
        }),
        { indent: { left: convertInchesToTwip(0.33) } }
      ),
      bodyPara(T`Docker Desktop 下载地址：`),
      para(
        new ExternalHyperlink({
          link: "https://www.docker.com/products/docker-desktop/",
          children: [run(T`https://www.docker.com/products/docker-desktop/`, { color: "0563C1", underline: { type: UnderlineType.SINGLE } })],
        }),
        { indent: { left: convertInchesToTwip(0.33) } }
      ),
      tipBox([T`Docker Desktop 安装时会自动启用 WSL2 后端，无需单独安装 WSL。`]),
      heading3(T`2.3 启用虚拟化（BIOS 设置）`),
      bodyPara(T`Docker 需要 CPU 虚拟化支持。请按以下步骤确认虚拟化已启用：`),
      para(run(T`1. 打开任务管理器 → 性能 → CPU → 查看"虚拟化"状态是否为"已启用"`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`2. 如未启用，请重启电脑进入 BIOS/UEFI 设置，启用 Intel VT-x 或 AMD-V`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`3. 保存并退出 BIOS，重新启动 Windows`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
    ],
  },
  {
    title: T`三、Docker Desktop 安装与配置`,
    level: 1,
    page: 5,
    children: [
      heading3(T`3.1 安装 Docker Desktop`),
      bodyPara(T`1. 下载 Docker Desktop 安装包（Docker Desktop Installer.exe）`),
      bodyPara(T`2. 双击安装包，按向导提示完成安装`),
      bodyPara(T`3. 安装过程中建议选择：`, { spacing: { after: 80 } }),
      para(run(T`• Use WSL 2 instead of Hyper-V（推荐）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.5) } }),
      para(run(T`• Add shortcut to desktop（可选）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.5) } }),
      bodyPara(T`4. 安装完成后，重启电脑（如提示）`),
      bodyPara(T`5. 启动 Docker Desktop，首次启动可能需要登录 Docker 账号（可跳过）`),
      heading3(T`3.2 验证 Docker 安装`),
      bodyPara(T`打开 PowerShell 或命令提示符（CMD），执行以下命令验证 Docker 是否正常工作：`),
      cmdTable([
        [T`docker --version`, T`查看 Docker 版本`],
        [T`docker compose version`, T`查看 Docker Compose 版本`],
      ]),
      para(run(T`如两条命令均返回版本号，说明 Docker 安装成功。`, { size: 24, color: palette.light, italics: true }), { spacing: { before: 120, after: 160 } }),
      heading3(T`3.3 配置 Docker 资源（可选）`),
      bodyPara(T`Docker Desktop 默认分配的资源可能不足。建议调整：`),
      para(run(T`1. 打开 Docker Desktop → Settings（设置）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`2. 选择 Resources → 调整：`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`   • CPUs: 至少 2 核（推荐 4 核）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.66) } }),
      para(run(T`   • Memory: 至少 4 GB（推荐 6 GB）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.66) } }),
      para(run(T`   • Disk: 至少 20 GB`, { size: 24 }), { indent: { left: convertInchesToTwip(0.66) } }),
      para(run(T`3. 点击 Apply & Restart 保存`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
    ],
  },
  {
    title: T`四、获取项目代码`,
    level: 1,
    page: 6,
    children: [
      heading3(T`4.1 克隆项目仓库`),
      bodyPara(T`打开 PowerShell，执行以下命令克隆项目到本地：`),
      cmdTable([
        [T`git clone <你的仓库地址>`, T`克隆项目代码`],
        [T`cd 密码子优化与引物合成`, T`进入项目目录`],
      ]),
      tipBox([T`如果项目已从其他渠道（如 U 盘、压缩包）拷贝到本地，可直接跳过 git clone 步骤，定位到项目目录即可。`]),
      heading3(T`4.2 查看项目结构`),
      bodyPara(T`进入项目目录后，确认以下关键文件存在：`),
      cmdTable([
        [T`docker-compose.yml`, T`Docker 编排配置文件`],
        [T`Dockerfile`, T`应用镜像构建文件`],
        [T`.env.example`, T`环境变量示例文件`],
        [T`package.json`, T`Node.js 依赖配置文件`],
      ]),
    ],
  },
  {
    title: T`五、配置环境变量`,
    level: 1,
    page: 7,
    children: [
      bodyPara(T`项目依赖环境变量进行配置。在 Windows PowerShell 中执行以下命令复制环境变量文件：`),
      cmdTable([
        [T`Copy-Item .env.example .env`, T`复制环境变量模板`],
      ]),
      bodyPara(T`复制后，.env 文件已包含默认配置，一般情况下无需修改即可运行。但建议了解以下核心配置项：`),
      varTable([
        [T`DATABASE_URL`, T`PostgreSQL 数据库连接地址`, T`postgresql://codon_tools_user:codon_tools_password@localhost:5434/codon_tools_db`],
        [T`DNAWORKS_EXECUTABLE_PATH`, T`DNAWorks 可执行文件路径（可选）`, T`（留空则禁用）`],
        [T`DNAWORKS_WORKDIR`, T`DNAWorks 临时工作目录（可选）`, T`（留空则禁用）`],
      ]),
      noteBox(T`⚠️ 注意事项：`, [
        T`Docker 部署模式下，DATABASE_URL 的 localhost 会被 Docker 内部网络解析，无需修改。`,
        T`DNAWorks 是密码子优化策略的可选组件，如不需要密码子优化功能，可暂时不配置。`,
      ]),
    ],
  },
  {
    title: T`六、启动 Docker 容器`,
    level: 1,
    page: 8,
    children: [
      heading3(T`6.1 一键构建并启动`),
      bodyPara(T`在项目根目录下，执行以下命令构建应用镜像并启动所有服务：`),
      cmdTable([
        [T`docker compose up -d --build`, T`构建镜像并在后台启动所有容器`],
      ]),
      bodyPara(T`命令执行后，Docker 会：`),
      para(run(T`1. 拉取 PostgreSQL 16 官方镜像（约 200 MB，首次下载）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`2. 构建应用镜像（基于 Node.js 20 + Alpine，包含前端构建产物）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`3. 启动 db 服务（PostgreSQL，端口映射 5434:5432）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`4. 启动 app 服务（应用服务，端口映射 3000:3000）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`5. 等待 db 健康检查通过，app 自动连接数据库`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      tipBox([T`首次构建可能需要 5-10 分钟，取决于网络速度和硬件性能。请耐心等待，不要中断。`, T`Docker 会自动缓存构建层，后续重新启动时速度会快很多。`]),
      heading3(T`6.2 查看启动状态`),
      bodyPara(T`执行以下命令查看容器运行状态：`),
      cmdTable([
        [T`docker compose ps`, T`查看容器状态`],
        [T`docker compose logs -f app`, T`实时查看应用日志`],
        [T`docker compose logs -f db`, T`实时查看数据库日志`],
      ]),
      bodyPara(T`当看到 app 日志中出现类似以下信息时，说明应用启动成功：`),
      para(run(T`Server running on port 3000`, { size: 20, font: { name: "Consolas", eastAsia: "Consolas" }, color: palette.light }), {
        shading: { type: ShadingType.CLEAR, fill: palette.codeBg },
        spacing: { before: 120, after: 120 },
        indent: { left: convertInchesToTwip(0.33) },
      }),
      heading3(T`6.3 服务端口说明`),
      bodyPara(T`容器启动后，以下端口在 Windows 主机上可用：`),
      varTable([
        [T`3000`, T`应用 Web 服务（前端 + API）`, T`http://localhost:3000`],
        [T`5434`, T`PostgreSQL 数据库（外部访问）`, T`localhost:5434`],
      ]),
    ],
  },
  {
    title: T`七、初始化数据库`,
    level: 1,
    page: 9,
    children: [
      bodyPara(T`首次启动后，数据库表结构尚未创建，需要执行初始化操作。`),
      heading3(T`7.1 创建表结构`),
      bodyPara(T`执行以下命令推送数据库表结构（Drizzle ORM）：`),
      cmdTable([
        [T`docker compose exec app pnpm db:push`, T`推送数据库 schema（自动创建表）`],
      ]),
      bodyPara(T`此命令会：`),
      para(run(T`• 根据 drizzle schema 自动创建所有数据库表`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 无需手动编写 SQL 建表语句`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 如果表已存在，会提示并跳过`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      heading3(T`7.2 导入种子数据`),
      bodyPara(T`执行以下命令导入系统初始数据和示例数据：`),
      cmdTable([
        [T`docker compose exec app pnpm db:seed`, T`导入种子数据`],
      ]),
      bodyPara(T`种子数据通常包括：`),
      para(run(T`• 默认用户账户（如有）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 密码子使用频率表`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 常见宿主物种配置`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      noteBox(T`⚠️ 注意：`, [
        T`初始化数据库优先使用 db:push，而非 db:migrate。`,
        T`历史迁移文件可能包含重复创建枚举类型的操作，直接运行 migrate 可能导致失败。`,
      ]),
    ],
  },
  {
    title: T`八、访问与验证`,
    level: 1,
    page: 10,
    children: [
      heading3(T`8.1 访问系统`),
      bodyPara(T`数据库初始化完成后，打开浏览器，访问：`),
      para(
        new ExternalHyperlink({
          link: "http://localhost:3000",
          children: [run(T`http://localhost:3000`, { color: "0563C1", underline: { type: UnderlineType.SINGLE }, size: 26 })],
        }),
        { spacing: { before: 120, after: 160 }, indent: { left: convertInchesToTwip(0.33) } }
      ),
      bodyPara(T`正常情况下，您应该看到系统的登录页面或主界面。`),
      heading3(T`8.2 验证功能`),
      bodyPara(T`建议按以下步骤验证系统功能是否正常：`),
      para(run(T`1. 页面加载：确认首页能正常加载，无 404 或 500 错误`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`2. 引物设计：尝试输入基因序列，执行引物设计功能`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`3. 密码子优化：如果配置了 DNAWorks，测试密码子优化功能`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`4. 数据持久化：创建一条记录后重启容器，确认数据未丢失`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      heading3(T`8.3 防火墙与端口占用检查`),
      bodyPara(T`如果无法访问，请检查以下问题：`),
      para(run(T`• 端口 3000 是否被其他程序占用？`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`  可用 PowerShell 命令检查：netstat -ano | findstr :3000`, { size: 24 }), { indent: { left: convertInchesToTwip(0.66) } }),
      para(run(T`• Windows 防火墙是否阻止了 Docker 端口映射？`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`  可暂时关闭防火墙测试，或在防火墙中允许 Docker 端口`, { size: 24 }), { indent: { left: convertInchesToTwip(0.66) } }),
      para(run(T`• Docker Desktop 的网络模式是否为 WSL2？`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`  建议保持 WSL2 后端模式，确保 localhost 映射正常`, { size: 24 }), { indent: { left: convertInchesToTwip(0.66) } }),
    ],
  },
  {
    title: T`九、常用运维命令速查`,
    level: 1,
    page: 11,
    children: [
      bodyPara(T`以下命令均在项目根目录下的 PowerShell 中执行。`),
      heading3(T`9.1 容器管理`),
      cmdTable([
        [T`docker compose up -d`, T`启动所有服务（后台模式）`],
        [T`docker compose up -d --build`, T`重新构建并启动服务`],
        [T`docker compose down`, T`停止并移除所有容器`],
        [T`docker compose down -v`, T`停止并移除容器 + 删除数据卷（数据丢失）`],
        [T`docker compose restart`, T`重启所有服务`],
        [T`docker compose ps`, T`查看容器运行状态`],
      ]),
      heading3(T`9.2 日志查看`),
      cmdTable([
        [T`docker compose logs -f app`, T`实时查看应用日志`],
        [T`docker compose logs -f db`, T`实时查看数据库日志`],
        [T`docker compose logs --tail 100 app`, T`查看应用最近 100 行日志`],
      ]),
      heading3(T`9.3 进入容器内部`),
      cmdTable([
        [T`docker compose exec app sh`, T`进入应用容器 Shell`],
        [T`docker compose exec db sh`, T`进入数据库容器 Shell`],
      ]),
      heading3(T`9.4 数据库备份与恢复`),
      cmdTable([
        [T`docker compose exec db pg_dump -U codon_tools_user codon_tools_db > backup.sql`, T`导出数据库备份`],
        [T`docker compose exec -T db psql -U codon_tools_user -d codon_tools_db < backup.sql`, T`从备份恢复数据库`],
      ]),
    ],
  },
  {
    title: T`十、常见问题排查`,
    level: 1,
    page: 12,
    children: [
      heading3(T`10.1 构建失败 / 镜像拉取超时`),
      noteBox(T`症状：`, [
        T`docker compose up -d --build 卡在 "pulling" 或 "building" 阶段`,
        T`报错：error pulling image configuration: ... i/o timeout`,
      ]),
      bodyPara(T`解决方案：`),
      para(run(T`1. 配置 Docker 镜像加速器（国内网络）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`   Docker Desktop → Settings → Docker Engine → 添加 registry-mirrors：`, { size: 24 }), { indent: { left: convertInchesToTwip(0.66) } }),
      para(run(T`   "https://docker.m.daocloud.io", "https://docker.1panel.live"`, { size: 20, font: { name: "Consolas", eastAsia: "Consolas" } }), { indent: { left: convertInchesToTwip(0.66) } }),
      para(run(T`2. 更换网络环境或使用代理`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`3. 手动拉取基础镜像：docker pull postgres:16-alpine`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      heading3(T`10.2 端口 3000 被占用`),
      noteBox(T`症状：`, [T`启动时报错：Bind for 0.0.0.0:3000 failed: port is already allocated`]),
      bodyPara(T`解决方案：`),
      para(run(T`1. 查找占用端口的进程：`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`   netstat -ano | findstr :3000`, { size: 20, font: { name: "Consolas", eastAsia: "Consolas" } }), { indent: { left: convertInchesToTwip(0.66) } }),
      para(run(T`2. 终止占用进程或修改 docker-compose.yml 中的端口映射：`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`   例如将 "3000:3000" 改为 "8080:3000"，然后访问 http://localhost:8080`, { size: 20, font: { name: "Consolas", eastAsia: "Consolas" } }), { indent: { left: convertInchesToTwip(0.66) } }),
      heading3(T`10.3 数据库连接失败`),
      noteBox(T`症状：`, [T`应用日志报错：connect ECONNREFUSED 或 database does not exist`]),
      bodyPara(T`解决方案：`),
      para(run(T`1. 检查 db 容器是否健康：docker compose ps`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`2. 检查数据库日志：docker compose logs -f db`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`3. 手动执行 db:push 和 db:seed 初始化`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`4. 检查 .env 中的 DATABASE_URL 是否与 docker-compose.yml 一致`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      heading3(T`10.4 前端页面空白或 404`),
      noteBox(T`症状：`, [T`访问 http://localhost:3000 显示空白页或 404`]),
      bodyPara(T`解决方案：`),
      para(run(T`1. 检查 build 是否成功：docker compose logs app | findstr "build"`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`2. 重新构建：docker compose down -v && docker compose up -d --build`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`3. 检查 Vite 构建产物是否已复制到 dist 目录`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      heading3(T`10.5 DNAWorks 策略不可用`),
      noteBox(T`症状：`, [T`密码子优化功能返回错误：DNAWorks executable not configured`]),
      bodyPara(T`DNAWorks 是密码子优化策略的可选组件。Docker 镜像中已自动编译安装了 DNAWorks，无需额外配置。如仍报错，请检查 Dockerfile 构建日志中 DNAWorks 编译是否成功。`),
      bodyPara(T`如需在本地环境（非 Docker）中配置 DNAWorks，请参考项目 docs/DNAWORKS_INTEGRATION.md 文档。`),
    ],
  },
  {
    title: T`十一、升级与维护`,
    level: 1,
    page: 14,
    children: [
      heading3(T`11.1 更新代码后重新部署`),
      bodyPara(T`当项目代码有更新时，按以下步骤重新部署：`),
      para(run(T`1. 拉取最新代码：git pull`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`2. 停止并移除旧容器：docker compose down -v`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`3. 重新构建并启动：docker compose up -d --build`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`4. 重新初始化数据库：docker compose exec app pnpm db:push && docker compose exec app pnpm db:seed`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      heading3(T`11.2 数据持久化说明`),
      bodyPara(T`Docker 部署模式下，数据库数据通过 Docker Volume 持久化存储：`),
      para(run(T`• Volume 名称：codon_tools_db_data`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 存储位置：Docker Desktop 管理的虚拟磁盘（不可直接访问）`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      para(run(T`• 数据保留：docker compose down 不会删除数据；docker compose down -v 会删除数据`, { size: 24 }), { indent: { left: convertInchesToTwip(0.33) } }),
      tipBox([T`如需长期保留数据，建议定期执行数据库导出命令（参见 9.4 节）备份到本地文件。`]),
    ],
  },
];

const children = [
  // Cover page
  para(run("", { size: 24 }), { spacing: { after: 0 }, pageBreakBefore: false }),
  para(run("", { size: 24 }), { spacing: { after: 0 } }),
  para(run("", { size: 24 }), { spacing: { after: 0 } }),
  para(run("", { size: 24 }), { spacing: { after: 0 } }),
  para(run("", { size: 24 }), { spacing: { after: 0 } }),
  para(run(docTitle, { bold: true, size: 40, color: palette.dark }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  para(run(docSubtitle, { size: 28, color: palette.primary }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
  }),
  para(run("═══════════════════════════════════════", { color: palette.border }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }),
  para(run(T`版本：v1.0`, { size: 24, color: palette.light }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }),
  para(run(T`日期：2025 年 7 月`, { size: 24, color: palette.light }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }),
  para(run(T`适用平台：Windows 10 / Windows 11`, { size: 24, color: palette.light }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }),
  para(run(T`部署方式：Docker 容器化（方案一）`, { size: 24, color: palette.light }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
  }),
  para(run("", { size: 24 }), { spacing: { after: 0 }, pageBreakBefore: true }),

  // TOC
  para(run(T`目录`, { bold: true, size: 32, color: palette.dark }), {
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
  }),
  para(run(T`右键目录，选择"更新域"以刷新页码。`, { italics: true, color: palette.light, size: 22 }), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }),
  toc(
    sections.map(({ title: entryTitle, level, page }) => ({
      title: entryTitle,
      level,
      page,
    })),
  ),
  para(run("", { size: 24 }), { spacing: { after: 0 }, pageBreakBefore: true }),
];

for (const section of sections) {
  children.push(heading(section.title, section.level));
  for (const child of section.children) {
    children.push(child);
  }
}

const doc = new Document({
  features: { updateFields: true },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: 1440,
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            para(run(T`密码子优化与引物合成平台 — 部署指南`, { bold: true, color: palette.primary, size: 20 }), {
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            para(
              new TextRun({ children: [PageNumber.CURRENT] }),
              {
                alignment: AlignmentType.CENTER,
              },
            ),
          ],
        }),
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
