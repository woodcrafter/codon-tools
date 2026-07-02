import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  ChevronDown,
  Download,
  Loader2,
  Upload,
  Trash2,
  FileSpreadsheet,
  Check,
  Copy,
} from "lucide-react";

type Row = {
  id: number;
  geneName: string;
  leftArm: string;
  sequence: string;
  rightArm: string;
};

type Field = "geneName" | "leftArm" | "sequence" | "rightArm";

type FillState = {
  field: Field;
  sourceRowId: number;
  sourceValue: string;
};

function getAutoIncrementGeneName(sourceValue: string, offset: number) {
  if (!sourceValue || offset <= 0) return sourceValue;

  const numericSuffixMatch = sourceValue.match(/^(.*?)(\d+)$/);
  if (numericSuffixMatch) {
    const [, prefix, numericSuffix] = numericSuffixMatch;
    const nextValue = String(Number(numericSuffix) + offset).padStart(numericSuffix.length, "0");
    return `${prefix}${nextValue}`;
  }

  if (/[A-Za-z]$/.test(sourceValue)) {
    return `${sourceValue}${offset}`;
  }

  return sourceValue;
}

function normalizeSeq(v: unknown) {
  return (v ?? "").toString().trim().toUpperCase().replace(/\s/g, "");
}

function createEmptyRow(id: number): Row {
  return { id, geneName: "", leftArm: "", sequence: "", rightArm: "" };
}

async function readXlsx(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];
}

function downloadTemplate() {
  const rows = Array.from({ length: 10 }).map((_, i) => ({
    基因名: "",
    左重组臂: "",
    碱基序列: "",
    右重组臂: "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, "primer_synthesis_template.xlsx");
}

function parseClipboardRows(raw: string) {
  return raw
    .replace(/\u2028/g, "\n")
    .replace(/\u2029/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(line => line.trim() !== "")
    .map(line => line.split("\t").map(cell => cell.trim()));
}

function hasTableLikeSeparator(text: string) {
  return /[\t\r\n\u2028\u2029]/.test(text);
}

function getClipboardText(e: React.ClipboardEvent<HTMLInputElement>) {
  const plain = e.clipboardData.getData("text/plain") || "";
  if (plain) return plain;
  const html = e.clipboardData.getData("text/html") || "";
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("tr"));
  if (!rows.length) return "";
  return rows
    .map(tr =>
      Array.from(tr.querySelectorAll("th,td"))
        .map(td => (td.textContent || "").trim())
        .join("\t")
    )
    .join("\n");
}

function normalizeClipboardColumns(cells: string[]) {
  const cols = [...cells];
  if (cols.length >= 5 && /^\d+$/.test(cols[0] || "")) cols.shift();
  return cols;
}

function formatDateTime(value: any) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd HH:mm:ss");
}

export default function PrimerDesignPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fillStateRef = useRef<FillState | null>(null);

  const [rows, setRows] = useState<Row[]>(Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)));
  const [activeCell, setActiveCell] = useState<{ rowId: number; field: Field } | null>({
    rowId: 1,
    field: "geneName",
  });

  const [synthesisOligoLength, setSynthesisOligoLength] = useState("70");
  const [synthesisMinOverlap, setSynthesisMinOverlap] = useState("19");

  const [detail, setDetail] = useState<any | null>(null);

  const recentOptimized = trpc.optimizationJobs.recentOptimizedResults.useQuery({ limit: 200 });
  const synthesisBatchDesign = trpc.primers.synthesisBatchDesign.useMutation();

  const fieldOrder: Field[] = ["geneName", "leftArm", "sequence", "rightArm"];
  const makeCellKey = (rowId: number, field: Field) => `${rowId}:${field}`;

  const recentMap = useMemo(() => {
    const map = new Map<string, { geneName: string; optimizedSequence: string; jobId: string; optimizedAt: any }>();
    (recentOptimized.data ?? []).forEach((x: any, idx: number) => {
      const key = `${x.jobId}__${x.geneName}__${idx}`;
      map.set(key, x);
    });
    return map;
  }, [recentOptimized.data]);

  const recentOptions = useMemo(() => {
    return (recentOptimized.data ?? []).map((x: any, idx: number) => ({
      key: `${x.jobId}__${x.geneName}__${idx}`,
      geneName: x.geneName,
      label: `${x.jobId}  |  ${x.geneName}  |  ${formatDateTime(x.optimizedAt)}`,
      valueForSearch: x.geneName,
    }));
  }, [recentOptimized.data]);

  const ensureRowCount = (targetRows: number) => {
    setRows(prev => {
      if (prev.length >= targetRows) return prev;
      const next = [...prev];
      for (let i = prev.length; i < targetRows; i++) next.push(createEmptyRow(i + 1));
      return next;
    });
  };

  const setCellValue = (rowId: number, field: Field, value: string) => {
    setRows(prev =>
      prev.map(r => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  };

  const focusCell = (rowId: number, field: Field) => {
    ensureRowCount(rowId);
    setActiveCell({ rowId, field });
    requestAnimationFrame(() => {
      const el = inputRefs.current[makeCellKey(rowId, field)];
      if (el) {
        el.focus();
        el.select();
      }
    });
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowId: number, field: Field) => {
    const col = fieldOrder.indexOf(field);
    if (e.key === "Enter") {
      e.preventDefault();
      focusCell(rowId + 1, field);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const nextCol = e.shiftKey ? Math.max(0, col - 1) : Math.min(fieldOrder.length - 1, col + 1);
      focusCell(rowId, fieldOrder[nextCol]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(rowId + 1, field);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(1, rowId - 1), field);
      return;
    }
  };

  useEffect(() => {
    const stopFill = () => {
      fillStateRef.current = null;
    };
    window.addEventListener("mouseup", stopFill);
    return () => window.removeEventListener("mouseup", stopFill);
  }, []);

  const startFillDown = (rowId: number, field: Field, value: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = { field, sourceRowId: rowId, sourceValue: value };
    fillStateRef.current = next;
  };

  const applyFillDownToRow = (targetRowId: number, field: Field) => {
    setRows(prev => {
      const activeFillState = fillStateRef.current;
      if (!activeFillState || activeFillState.field !== field) return prev;
      if (targetRowId <= activeFillState.sourceRowId) return prev;
      ensureRowCount(targetRowId);
      return prev.map(r => {
        if (r.id <= activeFillState.sourceRowId || r.id > targetRowId) return r;
        const offset = r.id - activeFillState.sourceRowId;
        const nextValue =
          field === "geneName"
            ? getAutoIncrementGeneName(activeFillState.sourceValue, offset)
            : activeFillState.sourceValue;
        return { ...r, [field]: nextValue };
      });
    });
  };

  const handleFillHover = (targetRowId: number, field: Field, e: React.MouseEvent) => {
    const active = fillStateRef.current;
    if (!active || active.field !== field) return;
    if ((e.buttons & 1) !== 1) return;
    applyFillDownToRow(targetRowId, field);
  };

  const applyBulkPaste = (startRowId: number, startField: Field, text: string) => {
    const parsedRows = parseClipboardRows(text);
    if (!parsedRows.length) return;
    const startRowIndex = Math.max(0, startRowId - 1);
    const startColIndex = fieldOrder.indexOf(startField);
    if (startColIndex < 0) return;

    const requiredRows = startRowIndex + parsedRows.length;
    ensureRowCount(Math.max(10, requiredRows));

    setRows(prev => {
      const next: Row[] = Array.from({ length: Math.max(prev.length, requiredRows) }, (_, i) =>
        prev[i] ? { ...prev[i], id: i + 1 } : createEmptyRow(i + 1)
      );

      parsedRows.forEach((cellsRaw, rowOffset) => {
        const rowIndex = startRowIndex + rowOffset;
        if (!next[rowIndex]) return;
        const cells = normalizeClipboardColumns(cellsRaw);
        fieldOrder.slice(startColIndex).forEach((field, colOffset) => {
          const cell = cells[colOffset];
          if (cell === undefined) return;
          (next[rowIndex] as any)[field] = cell;
        });
      });

      return next;
    });
  };

  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowId: number, field: Field) => {
    const text = getClipboardText(e);
    if (!hasTableLikeSeparator(text)) return;
    const parsed = parseClipboardRows(text);
    if (!parsed.length) return;
    e.preventDefault();
    applyBulkPaste(rowId, field, text);
  };

  const handleClear = () => {
    if (!window.confirm("将清空当前表格与结果，此操作不可撤销。是否继续？")) return;
    setRows(Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)));
    setDetail(null);
  };

  const handleImportXlsx = async (file: File) => {
    const data = await readXlsx(file);
    const mapped = data.map((r, idx) => {
      const geneName = (r.基因名 ?? r.GeneName ?? r.geneName ?? "").toString().trim();
      const leftArm = (r.左重组臂 ?? r.LeftArm ?? r.leftArm ?? "").toString();
      const sequence = (r.碱基序列 ?? r.Sequence ?? r.sequence ?? r.TargetSequence ?? r.TemplateOrTargetSequence ?? "").toString();
      const rightArm = (r.右重组臂 ?? r.RightArm ?? r.rightArm ?? "").toString();
      return {
        id: idx + 1,
        geneName,
        leftArm,
        sequence,
        rightArm,
      } as Row;
    });

    const nextRows = mapped.filter(r => r.geneName || r.sequence || r.leftArm || r.rightArm);
    const padded = [
      ...nextRows,
      ...Array.from({ length: Math.max(0, 10 - nextRows.length) }, (_, i) => createEmptyRow(nextRows.length + i + 1)),
    ];
    setRows(padded.map((r, i) => ({ ...r, id: i + 1 })));
    toast.success("已导入", { description: `共 ${nextRows.length} 条` });
  };

  const handlePickOptimized = (rowId: number, key: string) => {
    const picked = recentMap.get(key);
    if (!picked) return;
    setRows(prev =>
      prev.map(r =>
        r.id === rowId
          ? { ...r, geneName: picked.geneName, sequence: picked.optimizedSequence }
          : r
      )
    );
  };

  const validItems = useMemo(() => {
    return rows
      .map(r => ({
        geneName: r.geneName.trim(),
        sequence: normalizeSeq(r.sequence),
        leftArm: normalizeSeq(r.leftArm),
        rightArm: normalizeSeq(r.rightArm),
      }))
      .filter(r => r.geneName && r.sequence);
  }, [rows]);

  const results = (synthesisBatchDesign.data as any)?.results ?? null;

  const exportOligosRows = useMemo(() => {
    if (!results) return [];
    const rows: any[] = [];
    for (const r of results) {
      if (!r?.success) continue;
      const oligos = Array.isArray(r.synthesisOligos) ? r.synthesisOligos : [];
      for (const o of oligos) {
        rows.push({
          基因名: r.geneName ?? "",
          寡核苷酸序号: `${r.geneName}-${o.index}`,
          序列: o.sequence ?? "",
          方向: o.strand === "forward" ? "正向" : "反向",
          起始位置: o.start ?? "",
          结束位置: o.end ?? "",
          长度: o.length ?? "",
          与下一条重叠长度: o.overlapWithNext ?? "",
          重叠区Tm: o.overlapTm ?? "",
          自二聚评分: o.selfDimerScore ?? "",
          发卡评分: o.hairpinScore ?? "",
          质量评分: o.qualityScore ?? "",
          方案全局评分: r.synthesisMeta?.globalScore ?? "",
        });
      }
    }
    return rows;
  }, [results]);

  const handleExportXlsx = () => {
    if (!exportOligosRows.length) {
      toast.error("没有可导出的结果");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(exportOligosRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SynthesisOligos");
    XLSX.writeFile(wb, `gene_synthesis_primers_${(synthesisBatchDesign.data as any)?.runId ?? "run"}.xlsx`);
  };

  const handleRun = async () => {
    if (validItems.length === 0) {
      toast.error("请至少填写一行", { description: "基因名与碱基序列为必填项" });
      return;
    }
    const oligoLen = Number(synthesisOligoLength);
    const minOv = Number(synthesisMinOverlap);
    if (!Number.isFinite(oligoLen) || oligoLen <= 0) {
      toast.error("引物长度参数无效");
      return;
    }
    if (!Number.isFinite(minOv) || minOv < 0) {
      toast.error("重叠长度参数无效");
      return;
    }
    try {
      await synthesisBatchDesign.mutateAsync({
        items: validItems.map(x => ({
          geneName: x.geneName,
          sequence: x.sequence,
          leftArm: x.leftArm || null,
          rightArm: x.rightArm || null,
        })),
        params: {
          synthesisOligoLength: oligoLen,
          synthesisMinOverlap: minOv,
        },
      });
      toast.success("引物设计完成");
    } catch (e: any) {
      toast.error(e?.message ?? "引物设计失败");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    const jobId = params.get("jobId");
    if (from !== "optimization" || !jobId) return;
    try {
      const raw = sessionStorage.getItem(`primerSeed:${jobId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { items?: Array<{ geneName: string; targetSequence: string }> };
      const items = (parsed.items ?? []).filter(x => x.geneName && x.targetSequence);
      if (items.length === 0) return;
      const next = items.map((x, idx) => ({
        id: idx + 1,
        geneName: x.geneName,
        leftArm: "",
        sequence: normalizeSeq(x.targetSequence),
        rightArm: "",
      }));
      const required = Math.max(10, next.length);
      const padded = [
        ...next,
        ...Array.from({ length: required - next.length }, (_, i) => createEmptyRow(next.length + i + 1)),
      ];
      setRows(padded);
      toast.success("已从优化结果导入", { description: `共 ${items.length} 条` });
    } catch {
      return;
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-2xl font-semibold">引物设计</div>
        <div className="text-muted-foreground text-sm">
          统一使用“基因合成引物”模式。支持单条/多条同一张表格录入，支持 Excel 复制粘贴与下拉填充。
        </div>
      </div>

      <Card className="gap-0">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>引物类型</CardTitle>
              <CardDescription>基因合成引物（寡核苷酸拼接）</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                下载模板
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await handleImportXlsx(f);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                导入XLSX
              </Button>
              <Button variant="outline" onClick={handleClear}>
                <Trash2 className="mr-2 h-4 w-4" />
                清空
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>寡核苷酸长度</Label>
              <Input value={synthesisOligoLength} onChange={e => setSynthesisOligoLength(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>最小重叠长度</Label>
              <Input value={synthesisMinOverlap} onChange={e => setSynthesisMinOverlap(e.target.value)} />
            </div>
            <div className="flex items-end justify-end">
              <Button onClick={handleRun} disabled={synthesisBatchDesign.isPending}>
                {synthesisBatchDesign.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    设计中
                  </>
                ) : (
                  "开始设计"
                )}
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="border p-2 text-sm font-medium w-12">#</th>
                    <th className="border p-2 text-sm font-medium min-w-[150px]">基因名</th>
                    <th className="border p-2 text-sm font-medium min-w-[160px]">左重组臂</th>
                    <th className="border p-2 text-sm font-medium min-w-[300px]">碱基序列</th>
                    <th className="border p-2 text-sm font-medium min-w-[160px] whitespace-nowrap">右重组臂</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/50">
                      <td className="border p-1 text-center text-sm text-muted-foreground">{row.id}</td>
                      <td
                        className="border p-1 relative"
                        onMouseMove={(e) => handleFillHover(row.id, "geneName", e)}
                      >
                        <div className="flex items-center gap-1">
                          <Input
                            ref={(el) => {
                              inputRefs.current[makeCellKey(row.id, "geneName")] = el;
                            }}
                            value={row.geneName}
                            onChange={(e) => setCellValue(row.id, "geneName", e.target.value)}
                            onPaste={(e) => handleCellPaste(e, row.id, "geneName")}
                            onFocus={() => setActiveCell({ rowId: row.id, field: "geneName" })}
                            onKeyDown={(e) => handleCellKeyDown(e, row.id, "geneName")}
                            className="border-0 focus-visible:ring-0 h-8"
                          />
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled={recentOptions.length === 0}>
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[520px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="按基因名搜索（最近200条）" />
                                <CommandList>
                                  <CommandEmpty>未找到匹配记录</CommandEmpty>
                                  <CommandGroup className="max-h-72 overflow-auto">
                                    {recentOptions.map((opt) => (
                                      <CommandItem
                                        key={opt.key}
                                        value={opt.valueForSearch}
                                        onSelect={() => handlePickOptimized(row.id, opt.key)}
                                      >
                                        <span className="font-mono text-xs">{opt.label}</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <button
                          type="button"
                          className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-[2px] bg-primary/40 hover:bg-primary/70 cursor-ns-resize"
                          onMouseDown={(e) => startFillDown(row.id, "geneName", row.geneName || "", e)}
                          title="下拉填充"
                        />
                      </td>
                      <td
                        className="border p-1 relative"
                        onMouseMove={(e) => handleFillHover(row.id, "leftArm", e)}
                      >
                        <Input
                          ref={(el) => {
                            inputRefs.current[makeCellKey(row.id, "leftArm")] = el;
                          }}
                          value={row.leftArm}
                          onChange={(e) => setCellValue(row.id, "leftArm", e.target.value)}
                          onPaste={(e) => handleCellPaste(e, row.id, "leftArm")}
                          onFocus={() => setActiveCell({ rowId: row.id, field: "leftArm" })}
                          onKeyDown={(e) => handleCellKeyDown(e, row.id, "leftArm")}
                          className="border-0 focus-visible:ring-0 h-8"
                        />
                        <button
                          type="button"
                          className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-[2px] bg-primary/40 hover:bg-primary/70 cursor-ns-resize"
                          onMouseDown={(e) => startFillDown(row.id, "leftArm", row.leftArm || "", e)}
                          title="下拉填充"
                        />
                      </td>
                      <td
                        className="border p-1 relative"
                        onMouseMove={(e) => handleFillHover(row.id, "sequence", e)}
                      >
                        <Input
                          ref={(el) => {
                            inputRefs.current[makeCellKey(row.id, "sequence")] = el;
                          }}
                          value={row.sequence}
                          onChange={(e) => setCellValue(row.id, "sequence", e.target.value)}
                          onPaste={(e) => handleCellPaste(e, row.id, "sequence")}
                          onFocus={() => setActiveCell({ rowId: row.id, field: "sequence" })}
                          onKeyDown={(e) => handleCellKeyDown(e, row.id, "sequence")}
                          className="border-0 focus-visible:ring-0 h-8 font-mono"
                        />
                        <button
                          type="button"
                          className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-[2px] bg-primary/40 hover:bg-primary/70 cursor-ns-resize"
                          onMouseDown={(e) => startFillDown(row.id, "sequence", row.sequence || "", e)}
                          title="下拉填充"
                        />
                      </td>
                      <td
                        className="border p-1 relative"
                        onMouseMove={(e) => handleFillHover(row.id, "rightArm", e)}
                      >
                        <Input
                          ref={(el) => {
                            inputRefs.current[makeCellKey(row.id, "rightArm")] = el;
                          }}
                          value={row.rightArm}
                          onChange={(e) => setCellValue(row.id, "rightArm", e.target.value)}
                          onPaste={(e) => handleCellPaste(e, row.id, "rightArm")}
                          onFocus={() => setActiveCell({ rowId: row.id, field: "rightArm" })}
                          onKeyDown={(e) => handleCellKeyDown(e, row.id, "rightArm")}
                          className="border-0 focus-visible:ring-0 h-8"
                        />
                        <button
                          type="button"
                          className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-[2px] bg-primary/40 hover:bg-primary/70 cursor-ns-resize"
                          onMouseDown={(e) => startFillDown(row.id, "rightArm", row.rightArm || "", e)}
                          title="下拉填充"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>已填写 {validItems.length} 条</div>
            {recentOptimized.isLoading ? <div>正在加载最近优化结果...</div> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>设计结果</CardTitle>
              <CardDescription>每行输出一组基因合成寡核苷酸（可导出）。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportXlsx} disabled={!exportOligosRows.length}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                导出XLSX
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {!results ? (
            <div className="text-sm text-muted-foreground">暂无结果</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="border p-2 text-sm font-medium w-12">#</th>
                      <th className="border p-2 text-sm font-medium min-w-[180px]">基因名</th>
                      <th className="border p-2 text-sm font-medium w-24">状态</th>
                      <th className="border p-2 text-sm font-medium w-24">条数</th>
                      <th className="border p-2 text-sm font-medium w-32">详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r: any, idx: number) => {
                      const count = Array.isArray(r.synthesisOligos) ? r.synthesisOligos.length : 0;
                      return (
                        <tr key={`${r.geneName}_${idx}`} className="hover:bg-muted/50">
                          <td className="border p-2 text-center text-sm text-muted-foreground">{idx + 1}</td>
                          <td className="border p-2 text-sm">{r.geneName ?? ""}</td>
                          <td className="border p-2 text-sm text-center">{r.success ? "成功" : "失败"}</td>
                          <td className="border p-2 text-sm text-center">{r.success ? count : "-"}</td>
                          <td className="border p-2 text-sm text-center">
                            <Button variant="outline" size="sm" onClick={() => setDetail(r)} disabled={!r}>
                              查看
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{detail?.geneName ?? ""} 详情</DialogTitle>
          </DialogHeader>
          {detail?.success ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                全局评分：{detail?.synthesisMeta?.globalScore ?? "-"}，最大自二聚：{detail?.synthesisMeta?.maxSelfDimer ?? "-"}，最大发卡：{detail?.synthesisMeta?.maxHairpin ?? "-"}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="border p-2 text-sm font-medium w-16">序号</th>
                        <th className="border p-2 text-sm font-medium w-16">方向</th>
                        <th className="border p-2 text-sm font-medium w-24">长度</th>
                        <th className="border p-2 text-sm font-medium">序列</th>
                        <th className="border p-2 text-sm font-medium w-24">复制</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail?.synthesisOligos ?? []).map((o: any) => (
                        <tr key={o.index} className="hover:bg-muted/50">
                          <td className="border p-2 text-sm text-center">{o.index}</td>
                          <td className="border p-2 text-sm text-center">{o.strand === "forward" ? "正向" : "反向"}</td>
                          <td className="border p-2 text-sm text-center">{o.length}</td>
                          <td className="border p-2 text-xs font-mono break-all">{o.sequence}</td>
                          <td className="border p-2 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(o.sequence ?? "");
                                  toast.success("已复制");
                                } catch {
                                  toast.error("复制失败");
                                }
                              }}
                              title="复制"
                            >
                              <Copy className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-destructive">{detail?.error ?? "设计失败"}</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
