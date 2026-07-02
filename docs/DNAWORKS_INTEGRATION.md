# DNAWorks 策略接入

项目已支持将 DNAWorks 作为密码子优化策略。

## 1. 准备 DNAWorks

```bash
git clone https://github.com/davidhoover/DNAWorks.git
cd DNAWorks
make
```

编译成功后会生成 `dnaworks` 可执行文件。

## 2. 配置环境变量

在项目 `.env` 中配置：

```bash
DNAWORKS_EXECUTABLE_PATH=/absolute/path/to/DNAWorks/dnaworks
DNAWORKS_WORKDIR=/tmp
```

## 3. 调用策略

单条优化接口 `optimization.optimize` 与批量优化接口 `optimizationJobs.runBatch` 统一使用 DNAWorks。

示例请求字段：

```json
{
  "sequence": "ATGGCC...",
  "hostSpecies": "E. coli"
}
```

## 4. 行为说明

- 接口已不再使用 builtin 策略。
- 未配置可执行文件时，会返回明确错误信息。
- DNAWorks 执行完成后，系统会从输出日志中提取优化序列并返回统一结果结构。
