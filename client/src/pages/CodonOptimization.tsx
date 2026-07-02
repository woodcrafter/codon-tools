import React, { useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Download, Trash2, HelpCircle, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { parseSequenceFile, isProbablyBinary } from "@/lib/sequence-file";

interface TableRow {
  id: number;
  geneName: string;
  fivePrimeFlank: string;
  cdsSequence: string;
  threePrimeFlank: string;
  vectorType: string;
  length: number;
}

type EditableField = "geneName" | "fivePrimeFlank" | "cdsSequence" | "threePrimeFlank";
type CellPosition = { rowId: number; field: EditableField };
type FillState = {
  field: EditableField;
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

function createEmptyRow(id: number): TableRow {
  return {
    id,
    geneName: "",
    fivePrimeFlank: "",
    cdsSequence: "",
    threePrimeFlank: "",
    vectorType: "",
    length: 0,
  };
}

export default function CodonOptimizationPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fillStateRef = useRef<FillState | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [tableData, setTableData] = useState<TableRow[]>(
    Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1))
  );
  const [selectedHost, setSelectedHost] = useState<string>("");
  const [secondaryHost, setSecondaryHost] = useState<string>("");
  const [avoidEnzymes, setAvoidEnzymes] = useState<string[]>([]);
  const [retainEnzymes, setRetainEnzymes] = useState<string[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [activeCell, setActiveCell] = useState<CellPosition | null>({ rowId: 1, field: "geneName" });
  const [jobKeyword, setJobKeyword] = useState("");
  const [jobPage, setJobPage] = useState(1);

  const { data: hostSpecies } = trpc.hosts.list.useQuery();
  const { data: enzymes } = trpc.enzymes.list.useQuery();
  const { data: optimizationJobs, refetch: refetchJobs } = trpc.optimizationJobs.list.useQuery();

  const enzymeOptions: MultiSelectOption[] = React.useMemo(() => {
    if (!enzymes) return [];
    return enzymes.map(enzyme => ({
      label: `${enzyme.name} (${enzyme.recognitionSequence})`,
      value: enzyme.recognitionSequence,
    }));
  }, [enzymes]);

  const [, setLocation] = useLocation();

  const filteredJobs = React.useMemo(() => {
    const keyword = jobKeyword.trim().toLowerCase();
    if (!keyword) return optimizationJobs || [];
    return (optimizationJobs || []).filter((job: any) =>
      String(job.jobId || "").toLowerCase().includes(keyword)
    );
  }, [optimizationJobs, jobKeyword]);

  const JOB_PAGE_SIZE = 10;
  const jobTotalPages = Math.max(1, Math.ceil(filteredJobs.length / JOB_PAGE_SIZE));
  const pagedJobs = React.useMemo(() => {
    const current = Math.min(jobPage, jobTotalPages);
    const start = (current - 1) * JOB_PAGE_SIZE;
    return filteredJobs.slice(start, start + JOB_PAGE_SIZE);
  }, [filteredJobs, jobPage, jobTotalPages]);

  React.useEffect(() => {
    setJobPage(1);
  }, [jobKeyword]);

  const runBatchMutation = trpc.optimizationJobs.runBatch.useMutation({
    onSuccess: (data) => {
      toast.success("优化完成", { description: `已优化 ${data.results.length} 条序列` });
      refetchJobs();
      setLocation(`/optimization/${data.jobId}`);
    },
    onError: (error) => {
      toast.error("优化失败", { description: error.message });
    },
  });

  const detectSequenceType = (sequence: string): "dna" | "protein" => {
    const cleanSeq = (sequence || "").toUpperCase().replace(/\s/g, "");
    if (!cleanSeq) return "dna";
    if (/^[ATCGN]+$/.test(cleanSeq)) return "dna";
    if (/^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(cleanSeq)) return "protein";
    const dnaRatio = (cleanSeq.match(/[ATCGN]/g) || []).length / cleanSeq.length;
    const aaRatio = (cleanSeq.match(/[ACDEFGHIKLMNPQRSTVWY*]/gi) || []).length / cleanSeq.length;
    return aaRatio >= dnaRatio ? "protein" : "dna";
  };

  const updateCell = (rowId: number, field: keyof TableRow, value: string) => {
    setTableData(prev =>
      prev.map(row =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
              length:
                field === "cdsSequence"
                  ? value.length
                  : row.length,
            }
          : row
      )
    );
  };

  React.useEffect(() => {
    const stopFill = () => {
      fillStateRef.current = null;
    };
    window.addEventListener("mouseup", stopFill);
    return () => window.removeEventListener("mouseup", stopFill);
  }, []);

  const editableFields: EditableField[] = ["geneName", "fivePrimeFlank", "cdsSequence", "threePrimeFlank"];
  const makeCellKey = (rowId: number, field: EditableField) => `${rowId}:${field}`;

  const ensureRowCount = (targetRows: number) => {
    setTableData(prev => {
      if (prev.length >= targetRows) return prev;
      const next = [...prev];
      for (let i = prev.length; i < targetRows; i++) {
        next.push(createEmptyRow(i + 1));
      }
      return next;
    });
  };

  const focusCell = (rowId: number, field: EditableField) => {
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

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowId: number, field: EditableField) => {
    const col = editableFields.indexOf(field);
    if (e.key === "Enter") {
      e.preventDefault();
      focusCell(rowId + 1, field);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const nextCol = e.shiftKey ? Math.max(0, col - 1) : Math.min(editableFields.length - 1, col + 1);
      focusCell(rowId, editableFields[nextCol]);
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
    if (e.key === "ArrowRight") {
      if (col < editableFields.length - 1 && e.currentTarget.selectionStart === e.currentTarget.value.length) {
        e.preventDefault();
        focusCell(rowId, editableFields[col + 1]);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      if (col > 0 && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
        e.preventDefault();
        focusCell(rowId, editableFields[col - 1]);
      }
    }
  };

  const startFillDown = (rowId: number, field: EditableField, value: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextState = {
      field,
      sourceRowId: rowId,
      sourceValue: value,
    };
    fillStateRef.current = nextState;
  };

  const applyFillDownToRow = (targetRowId: number, field: EditableField) => {
    setTableData(prev => {
      const activeFillState = fillStateRef.current;
      if (!activeFillState || activeFillState.field !== field) return prev;
      if (targetRowId <= activeFillState.sourceRowId) return prev;

      return prev.map(row => {
        if (row.id <= activeFillState.sourceRowId || row.id > targetRowId) return row;
        const offset = row.id - activeFillState.sourceRowId;
        const nextValue =
          field === "geneName"
            ? getAutoIncrementGeneName(activeFillState.sourceValue, offset)
            : activeFillState.sourceValue;
        const updated = { ...row, [field]: nextValue } as TableRow;
        if (field === "cdsSequence") {
          updated.length = activeFillState.sourceValue.length;
        }
        return updated;
      });
    });
  };

  const handleFillHover = (targetRowId: number, field: EditableField, e: React.MouseEvent) => {
    const active = fillStateRef.current;
    if (!active || active.field !== field) return;
    if ((e.buttons & 1) !== 1) return;
    applyFillDownToRow(targetRowId, field);
  };

  const parseClipboardRows = (raw: string) => {
    return raw
      .replace(/\u2028/g, "\n")
      .replace(/\u2029/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter(line => line.trim() !== "")
      .map(line => line.split("\t").map(cell => cell.trim()));
  };

  const hasTableLikeSeparator = (text: string) => /[\t\r\n\u2028\u2029]/.test(text);

  const getClipboardText = (e: React.ClipboardEvent<HTMLInputElement>) => {
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
  };

  const normalizeClipboardColumns = (cells: string[]) => {
    const cols = [...cells];
    if (cols.length >= 5 && /^\d+$/.test(cols[0] || "")) cols.shift();
    return cols;
  };

  const applyBulkPaste = (startRowId: number, startField: EditableField, text: string) => {
    const parsedRows = parseClipboardRows(text);
    if (!parsedRows.length) return;
    const startRowIndex = Math.max(0, startRowId - 1);
    const startColIndex = editableFields.indexOf(startField);
    if (startColIndex < 0) return;

    setTableData(prev => {
      const requiredRows = Math.max(prev.length, startRowIndex + parsedRows.length, 10);
      const next: TableRow[] = Array.from({ length: requiredRows }, (_, i) => prev[i] ? { ...prev[i], id: i + 1 } : createEmptyRow(i + 1));

      parsedRows.forEach((cellsRaw, rowOffset) => {
        const rowIndex = startRowIndex + rowOffset;
        if (!next[rowIndex]) return;
        const cells = normalizeClipboardColumns(cellsRaw);
        editableFields.slice(startColIndex).forEach((field, colOffset) => {
          const cell = cells[colOffset];
          if (cell === undefined) return;
          (next[rowIndex] as any)[field] = cell;
        });
        next[rowIndex].length = (next[rowIndex].cdsSequence || "").length;
      });

      return next;
    });
  };

  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowId: number, field: EditableField) => {
    const text = getClipboardText(e);
    if (!hasTableLikeSeparator(text)) return;
    const parsed = parseClipboardRows(text);
    if (!parsed.length) return;
    e.preventDefault();
    applyBulkPaste(rowId, field, text);
  };

  const handleClearTable = (needConfirm = true) => {
    if (needConfirm && !window.confirm("将清空当前表格与配置，此操作不可撤销。是否继续？")) {
      return;
    }
    setTableData(Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)));
    setSelectedHost("");
    setSecondaryHost("");
    setAvoidEnzymes([]);
    setRetainEnzymes([]);
  };

  const SEQUENCE_EXTS = [".dna", ".gb", ".gbk", ".fasta", ".fa", ".fas", ".genbank", ".txt"];
  const TABLE_EXTS = [".csv", ".xlsx", ".xls"];
  const VALID_EXTS = [...SEQUENCE_EXTS, ...TABLE_EXTS];

  const handleSequenceImport = (sequences: { name: string; sequence: string }[]) => {
    if (!sequences?.length) {
      toast.error("未解析到有效序列");
      return;
    }
    const rows: TableRow[] = sequences.map((s, i) => ({
      id: i + 1,
      geneName: s.name || `序列${i + 1}`,
      fivePrimeFlank: "",
      cdsSequence: s.sequence,
      threePrimeFlank: "",
      vectorType: "",
      length: s.sequence.length,
    }));
    while (rows.length < 10) {
      rows.push(createEmptyRow(rows.length + 1));
    }
    setTableData(rows);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!VALID_EXTS.includes(fileExt)) {
      toast.error("文件格式不支持", {
        description: `支持：${VALID_EXTS.join(" ")}`,
      });
      return;
    }

    toast.info("正在导入文件", { description: "请稍候..." });
    const isSequenceFile = SEQUENCE_EXTS.includes(fileExt);

    if (isSequenceFile) {
      try {
        if (fileExt === ".dna") {
          const fd = new FormData();
          fd.append("file", file);
          const r = await fetch("/api/vectors/parse-sequence-file", {
            method: "POST",
            body: fd,
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j?.error ?? r.statusText);
          }
          const { sequences } = await r.json();
          handleSequenceImport(sequences);
          toast.success(`已导入 ${sequences.length} 条序列`);
        } else {
          const text = await file.text();
          if (isProbablyBinary(text)) {
            const fd = new FormData();
            fd.append("file", file);
            const r = await fetch("/api/vectors/parse-sequence-file", {
              method: "POST",
              body: fd,
            });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error(j?.error ?? r.statusText);
            }
            const { sequences } = await r.json();
            handleSequenceImport(sequences);
            toast.success(`已导入 ${sequences.length} 条序列`);
          } else {
            try {
              const parsed = parseSequenceFile(file.name, text);
              handleSequenceImport(parsed);
              toast.success(`已导入 ${parsed.length} 条序列`);
            } catch {
              const r = await fetch("/api/vectors/parse-sequence-text", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: text, fileName: file.name }),
              });
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                throw new Error(j?.error ?? r.statusText);
              }
              const { sequences } = await r.json();
              handleSequenceImport(sequences);
              toast.success(`已导入 ${sequences.length} 条序列`);
            }
          }
        }
      } catch (e: any) {
        toast.error(e?.message ?? "序列解析失败");
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const lines = content.split("\n").filter(line => line.trim());
        const dataLines = lines.slice(1);
        const parsedData: TableRow[] = dataLines.map((line, index) => {
          const columns = line.split(/[,\t]/);
          return {
            id: index + 1,
            geneName: columns[0]?.trim() || "",
            fivePrimeFlank: columns[1]?.trim() || "",
            cdsSequence: columns[2]?.trim() || "",
            threePrimeFlank: columns[3]?.trim() || "",
            vectorType: columns[4]?.trim() || "",
            length: (columns[2]?.trim() || "").length,
          };
        });
        while (parsedData.length < 10) {
          parsedData.push(createEmptyRow(parsedData.length + 1));
        }
        setTableData(parsedData);
        toast.success(`已导入 ${dataLines.length} 条数据`);
      } catch {
        toast.error("文件解析失败", { description: "请检查文件格式是否正确" });
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const headers = ["基因名称", "5'侧翼序列(不必填)", "原始序列", "3'侧翼序列(不必填)", "类型", "长度"];
    const csvContent = headers.join(",") + "\n";
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "基因合成订单模板.csv";
    link.click();
    toast.success("模板下载成功", {
      description: "请按照模板格式填写数据",
    });
  };

  const handleOptimize = async () => {
    if (!selectedHost) {
      toast.error("请选择表达宿主");
      return;
    }
    const validRows = tableData.filter(row => row.geneName && row.cdsSequence);
    if (validRows.length === 0) {
      toast.error("请至少填写一行数据", { description: "基因名称和原始序列为必填项" });
      return;
    }
    setIsOptimizing(true);
    try {
      await runBatchMutation.mutateAsync({
        items: validRows.map(row => ({
          geneName: row.geneName,
          cdsSequence: row.cdsSequence,
          fivePrimeFlank: row.fivePrimeFlank || undefined,
          threePrimeFlank: row.threePrimeFlank || undefined,
        })),
        hostSpeciesId: parseInt(selectedHost, 10),
        secondaryHostSpeciesId: secondaryHost ? parseInt(secondaryHost, 10) : undefined,
        avoidEnzymes: avoidEnzymes.length > 0 ? avoidEnzymes : undefined,
        retainEnzymes: retainEnzymes.length > 0 ? retainEnzymes : undefined,
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDirectToPlasmidSettings = () => {
    toast.info("当前项目不保留质粒设置功能");
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">密码子优化</h1>
        <p className="text-muted-foreground mt-2">
          使用 DNAWorks 方案进行密码子优化，可直接在表格中输入或上传文件导入
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                请按序列粘贴&amp;复制进下表
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        请在表格中直接输入基因信息，或点击上传文件批量导入。
                        基因名称和原始序列为必填项。
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription className="mt-2 text-red-600">
                * 必填项：基因名称、原始序列
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                下载模板
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleClearTable()}>
                <Trash2 className="h-4 w-4 mr-2" />
                清空表格
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="border rounded-lg overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="border p-2 text-sm font-medium w-12">#</th>
                    <th className="border p-2 text-sm font-medium min-w-[150px]">
                      <span className="text-red-600">*</span>基因名称
                    </th>
                    <th className="border p-2 text-sm font-medium min-w-[200px]">
                      5&apos;侧翼序列
                      <br />
                      <span className="text-xs text-muted-foreground">(不必填)</span>
                    </th>
                    <th className="border p-2 text-sm font-medium min-w-[250px]">
                      <span className="text-red-600">*</span>原始序列
                    </th>
                    <th className="border p-2 text-sm font-medium min-w-[200px]">
                      3&apos;侧翼序列
                      <br />
                      <span className="text-xs text-muted-foreground">(不必填)</span>
                    </th>
                    <th className="border p-2 text-sm font-medium min-w-[120px]">类型</th>
                    <th className="border p-2 text-sm font-medium w-24">长度</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/50">
                      <td className="border p-1 text-center text-sm">{row.id}</td>
                      {editableFields.map((field) => (
                        <td
                          key={field}
                          className={`border p-1 relative ${activeCell?.rowId === row.id && activeCell?.field === field ? "ring-2 ring-primary ring-inset" : ""}`}
                          onMouseMove={(e) => handleFillHover(row.id, field, e)}
                        >
                          <Input
                            ref={(el) => {
                              inputRefs.current[makeCellKey(row.id, field)] = el;
                            }}
                            value={(row as any)[field]}
                            onChange={(e) => updateCell(row.id, field as keyof TableRow, e.target.value)}
                            onPaste={(e) => handleCellPaste(e, row.id, field)}
                            onFocus={() => setActiveCell({ rowId: row.id, field })}
                            onKeyDown={(e) => handleCellKeyDown(e, row.id, field)}
                            className="border-0 focus-visible:ring-0 h-8"
                          />
                          <button
                            type="button"
                            className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-[2px] bg-primary/40 hover:bg-primary/70 cursor-ns-resize"
                            onMouseDown={(e) => startFillDown(row.id, field, ((row as any)[field] as string) || "", e)}
                            title="下拉填充"
                          />
                        </td>
                      ))}
                      <td className="border p-1">
                        <Badge variant="outline" className="font-normal">
                          {row.cdsSequence ? (detectSequenceType(row.cdsSequence) === "dna" ? "DNA" : "蛋白质") : "—"}
                        </Badge>
                      </td>
                      <td className="border p-1 text-center text-sm text-muted-foreground">
                        {row.cdsSequence.length || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-6">
            <Label className="text-sm font-medium mb-2 block">
              点击上传序列文件 (.dna, .gb, .gbk, .fasta, .fa, .fas, .genbank or .txt)
            </Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.txt,.fasta,.fa,.fas,.gb,.gbk,.genbank,.dna"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                选择文件上传
              </Button>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  <span className="text-red-600">*</span>表达宿主：
                </Label>
                <Select value={selectedHost} onValueChange={setSelectedHost}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {hostSpecies?.map((host) => (
                      <SelectItem key={host.id} value={host.id.toString()}>
                        {host.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                  二级表达宿主：
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>可选的次级表达系统</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Select value={secondaryHost} onValueChange={setSecondaryHost}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {hostSpecies?.map((host) => (
                      <SelectItem key={host.id} value={host.id.toString()}>
                        {host.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">
                请选择需要避免的酶切位点：
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                请输入要从优化序列中排除的限制性内切酶位点的名称。
              </p>
              <MultiSelect
                options={enzymeOptions}
                selected={avoidEnzymes}
                onChange={setAvoidEnzymes}
                placeholder="选择需要避免的酶..."
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">
                请选择需要保留的酶切位点：
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                请输入要从优化序列中保留的限制性内切酶位点的名称。
              </p>
              <MultiSelect
                options={enzymeOptions}
                selected={retainEnzymes}
                onChange={setRetainEnzymes}
                placeholder="选择需要保留的酶..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleClearTable()}>
              重置
            </Button>
            <Button variant="outline" onClick={handleDirectToPlasmidSettings}>
              直接质粒设置
            </Button>
            <Button
              onClick={handleOptimize}
              disabled={isOptimizing || runBatchMutation.isPending}
            >
              {isOptimizing || runBatchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  优化中...
                </>
              ) : (
                "开始优化"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>优化记录</CardTitle>
          <CardDescription>一批次优化显示为一条记录，点击查看详情</CardDescription>
        </CardHeader>
        <CardContent>
          {!optimizationJobs?.length ? (
            <p className="text-sm text-muted-foreground">暂无优化记录</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <Label htmlFor="job-id-search">Job ID:</Label>
                <Input
                  id="job-id-search"
                  value={jobKeyword}
                  onChange={(e) => setJobKeyword(e.target.value)}
                  placeholder="输入 Job ID"
                  className="w-72"
                />
                <Button type="button" onClick={() => setJobPage(1)}>搜索</Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="border px-2 py-2 text-sm w-14">No.</th>
                      <th className="border px-2 py-2 text-sm">Job ID</th>
                      <th className="border px-2 py-2 text-sm">首条序列名称</th>
                      <th className="border px-2 py-2 text-sm w-20">数量</th>
                      <th className="border px-2 py-2 text-sm w-20">状态</th>
                      <th className="border px-2 py-2 text-sm min-w-[180px]">提交时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedJobs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="border px-3 py-6 text-center text-sm text-muted-foreground">
                          未找到匹配的优化记录
                        </td>
                      </tr>
                    ) : (
                      pagedJobs.map((job: any, idx: number) => (
                        <tr
                          key={job.jobId}
                          onClick={() => setLocation(`/optimization/${job.jobId}`)}
                          className="hover:bg-muted/50 cursor-pointer"
                        >
                          <td className="border px-2 py-2 text-center text-sm">{(jobPage - 1) * JOB_PAGE_SIZE + idx + 1}</td>
                          <td className="border px-2 py-2 text-sm font-mono">{job.jobId}</td>
                          <td className="border px-2 py-2 text-sm">{job.firstGeneName || "—"}</td>
                          <td className="border px-2 py-2 text-sm text-center">{job.resultCount ?? 0}</td>
                          <td className="border px-2 py-2 text-sm text-center">完成</td>
                          <td className="border px-2 py-2 text-sm text-center">
                            {job.createdAt ? new Date(job.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-center items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={jobPage <= 1}
                  onClick={() => setJobPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground">
                  第 {Math.min(jobPage, jobTotalPages)} / {jobTotalPages} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={jobPage >= jobTotalPages}
                  onClick={() => setJobPage((p) => Math.min(jobTotalPages, p + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert className="mt-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>使用提示：</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>可以直接在表格中输入数据，支持复制粘贴</li>
            <li>点击&quot;选择文件上传&quot;可批量导入Excel或CSV文件</li>
            <li>基因名称和原始序列为必填项，其他字段可选</li>
            <li>序列长度会自动计算</li>
            <li>提交前请确保选择表达宿主</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
