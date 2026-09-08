# 项目文件收口验证

## archive

- `.archive/manifest.json` 覆盖 11 个归档组或归档文件。
- `scripts/archive/`、`ops/`、`docs/.乾坤系统/` 已退出当前目录。
- 项目结构检查确认 156 个 live module 无归档引用，package 无归档入口。

证据：`structure.json`、`workflow-skills.txt`。

## qiankun

- 当前依据为 `docs/qiankun-api-docs-20260827.md`。
- 新文件与 Git 中原始 2026-08-27 文档的 SHA-256 一致。
- 当前代码与当前文档未引用旧目录或不存在的 2026-08-25 文档。

证据：`qiankun-path-check.json`、`monitor.txt`。

## preserved

`docs/.参考文档/`、`docs/.开发方案/`、`docs/.问题排查/` 共 58 个文件，前后路径、大小与内容 hash 完全一致。

证据：`preserved-directories.json`。

## contracts

项目合同 77 个正反例全部通过，覆盖第二归档目录、旧根目录复现、漏登记归档、归档运行入口、乾坤文档缺失或旧引用、Task/Manifest 缺对，以及 migration 编号冲突；现存两个 `015` 保持兼容。

证据：`project-contracts.txt`。

## regressions

- 工作流技能 smoke 通过，并确认未发生真实平台写入或 token 刷新。
- monitor 合同检查通过。
- 7 份当前说明文档中的 76 个本地链接全部有效。
- 项目启动、关闭前和关闭后三阶段检查全部通过。
- `git diff --check` 通过。

证据：`workflow-skills.txt`、`monitor.txt`、`link-check.json`、`before-close.json`、`after-close.json`。
