import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GripVertical } from "lucide-react";

type CodonRow = {
  id: string;
  aa: string;
  codon: string;
  frequency: string;
};

type HostFormState = {
  id?: number;
  name: string;
  scientificName: string;
  codonRows: CodonRow[];
};

const GENETIC_CODE: Record<string, string> = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*",
  TGT: "C", TGC: "C", TGA: "*", TGG: "W",
  CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R",
  GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

const CODON_TEMPLATE: Array<{ aa: string; codon: string }> = [
  { aa: "A", codon: "GCT" }, { aa: "A", codon: "GCC" }, { aa: "A", codon: "GCA" }, { aa: "A", codon: "GCG" },
  { aa: "R", codon: "CGT" }, { aa: "R", codon: "CGC" }, { aa: "R", codon: "CGA" }, { aa: "R", codon: "CGG" }, { aa: "R", codon: "AGA" }, { aa: "R", codon: "AGG" },
  { aa: "N", codon: "AAT" }, { aa: "N", codon: "AAC" },
  { aa: "D", codon: "GAT" }, { aa: "D", codon: "GAC" },
  { aa: "C", codon: "TGT" }, { aa: "C", codon: "TGC" },
  { aa: "Q", codon: "CAA" }, { aa: "Q", codon: "CAG" },
  { aa: "E", codon: "GAA" }, { aa: "E", codon: "GAG" },
  { aa: "G", codon: "GGT" }, { aa: "G", codon: "GGC" }, { aa: "G", codon: "GGA" }, { aa: "G", codon: "GGG" },
  { aa: "H", codon: "CAT" }, { aa: "H", codon: "CAC" },
  { aa: "I", codon: "ATT" }, { aa: "I", codon: "ATC" }, { aa: "I", codon: "ATA" },
  { aa: "L", codon: "TTA" }, { aa: "L", codon: "TTG" }, { aa: "L", codon: "CTT" }, { aa: "L", codon: "CTC" }, { aa: "L", codon: "CTA" }, { aa: "L", codon: "CTG" },
  { aa: "K", codon: "AAA" }, { aa: "K", codon: "AAG" },
  { aa: "M", codon: "ATG" },
  { aa: "F", codon: "TTT" }, { aa: "F", codon: "TTC" },
  { aa: "P", codon: "CCT" }, { aa: "P", codon: "CCC" }, { aa: "P", codon: "CCA" }, { aa: "P", codon: "CCG" },
  { aa: "S", codon: "TCT" }, { aa: "S", codon: "TCC" }, { aa: "S", codon: "TCA" }, { aa: "S", codon: "TCG" }, { aa: "S", codon: "AGT" }, { aa: "S", codon: "AGC" },
  { aa: "T", codon: "ACT" }, { aa: "T", codon: "ACC" }, { aa: "T", codon: "ACA" }, { aa: "T", codon: "ACG" },
  { aa: "W", codon: "TGG" },
  { aa: "Y", codon: "TAT" }, { aa: "Y", codon: "TAC" },
  { aa: "V", codon: "GTT" }, { aa: "V", codon: "GTC" }, { aa: "V", codon: "GTA" }, { aa: "V", codon: "GTG" },
  { aa: "*", codon: "TAA" }, { aa: "*", codon: "TAG" }, { aa: "*", codon: "TGA" },
];

const templateIndexMap = new Map(
  CODON_TEMPLATE.map((item, index) => [`${item.aa}:${item.codon}`, index])
);

function makeRowId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyRow(): CodonRow {
  return { id: makeRowId(), aa: "", codon: "", frequency: "" };
}

function createTemplateRows(): CodonRow[] {
  return CODON_TEMPLATE.map(item => ({
    id: makeRowId(),
    aa: item.aa,
    codon: item.codon,
    frequency: "",
  }));
}

function sortCodonRows(rows: CodonRow[]) {
  return [...rows].sort((a, b) => {
    const aKey = `${a.aa}:${a.codon}`;
    const bKey = `${b.aa}:${b.codon}`;
    const aIndex = templateIndexMap.get(aKey) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = templateIndexMap.get(bKey) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return aKey.localeCompare(bKey);
  });
}

function normalizeAminoAcid(value: string) {
  return value.trim().toUpperCase();
}

function normalizeCodon(value: string) {
  return value.trim().toUpperCase();
}

function parseCodonTableToRows(input: unknown): CodonRow[] {
  if (!input) return [];
  const rows: CodonRow[] = [];

  if (Array.isArray(input)) {
    for (const item of input) {
      if (Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && item[1] && typeof item[1] === "object") {
        const aa = normalizeAminoAcid(item[0]);
        for (const [codon, frequency] of Object.entries(item[1] as Record<string, unknown>)) {
          rows.push({
            id: makeRowId(),
            aa,
            codon: normalizeCodon(codon),
            frequency: frequency == null ? "" : String(frequency),
          });
        }
        continue;
      }

      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const aaRaw = row.aa ?? row.aminoAcid ?? row.amino_acid;
      if (typeof aaRaw === "string" && row.codons && typeof row.codons === "object" && !Array.isArray(row.codons)) {
        for (const [codon, frequency] of Object.entries(row.codons as Record<string, unknown>)) {
          rows.push({
            id: makeRowId(),
            aa: normalizeAminoAcid(aaRaw),
            codon: normalizeCodon(codon),
            frequency: frequency == null ? "" : String(frequency),
          });
        }
        continue;
      }

      if (typeof aaRaw === "string" && typeof row.codon === "string") {
        rows.push({
          id: makeRowId(),
          aa: normalizeAminoAcid(aaRaw),
          codon: normalizeCodon(row.codon),
          frequency: row.frequency == null ? "" : String(row.frequency),
        });
      }
    }

    return sortCodonRows(rows);
  }

  if (typeof input === "object") {
    for (const [aa, codons] of Object.entries(input as Record<string, unknown>)) {
      if (!codons || typeof codons !== "object" || Array.isArray(codons)) continue;
      for (const [codon, frequency] of Object.entries(codons as Record<string, unknown>)) {
        rows.push({
          id: makeRowId(),
          aa: normalizeAminoAcid(aa),
          codon: normalizeCodon(codon),
          frequency: frequency == null ? "" : String(frequency),
        });
      }
    }
  }

  return sortCodonRows(rows);
}

function mergeRowsWithTemplate(rows: CodonRow[]) {
  const existingMap = new Map(
    rows
      .filter(row => row.aa && row.codon)
      .map(row => [`${normalizeAminoAcid(row.aa)}:${normalizeCodon(row.codon)}`, row])
  );

  return createTemplateRows().map(row => {
    const match = existingMap.get(`${row.aa}:${row.codon}`);
    return match
      ? {
          ...row,
          frequency: match.frequency,
        }
      : row;
  });
}

function serializeCodonRows(rows: CodonRow[]) {
  const table: Record<string, Record<string, number>> = {};
  const activeRows = rows.filter(row => row.aa.trim() || row.codon.trim() || row.frequency.trim());

  if (activeRows.length === 0) {
    return { table: null as Record<string, Record<string, number>> | null, error: null as string | null };
  }

  const seenCodons = new Set<string>();

  for (let index = 0; index < activeRows.length; index += 1) {
    const row = activeRows[index];
    const aa = normalizeAminoAcid(row.aa);
    const codon = normalizeCodon(row.codon);
    const frequencyText = row.frequency.trim();

    if (!aa || !codon || !frequencyText) {
      return { table: null, error: `密码子偏好表第 ${index + 1} 行未填写完整` };
    }

    if (!/^[A-Z*]$/.test(aa)) {
      return { table: null, error: `密码子偏好表第 ${index + 1} 行的氨基酸无效` };
    }

    if (!/^[ATCG]{3}$/.test(codon)) {
      return { table: null, error: `密码子偏好表第 ${index + 1} 行的密码子无效` };
    }

    const mappedAa = GENETIC_CODE[codon];
    if (!mappedAa || mappedAa !== aa) {
      return { table: null, error: `密码子偏好表第 ${index + 1} 行中，${codon} 不属于氨基酸 ${aa}` };
    }

    const frequency = Number(frequencyText);
    if (!Number.isFinite(frequency) || frequency < 0) {
      return { table: null, error: `密码子偏好表第 ${index + 1} 行的频率必须是大于等于 0 的数字` };
    }

    if (seenCodons.has(codon)) {
      return { table: null, error: `密码子 ${codon} 重复填写，请检查密码子偏好表` };
    }
    seenCodons.add(codon);

    if (!table[aa]) table[aa] = {};
    table[aa][codon] = frequency;
  }

  return { table, error: null as string | null };
}

function defaultFormState(): HostFormState {
  return {
    name: "",
    scientificName: "",
    codonRows: [],
  };
}

function getPopulatedRowCount(rows: CodonRow[]) {
  return rows.filter(row => row.aa.trim() && row.codon.trim() && row.frequency.trim()).length;
}

export default function HostSpeciesPage() {
  const hosts = trpc.hosts.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<HostFormState>(defaultFormState);
  const [tableError, setTableError] = useState<string | null>(null);
  const [draggingHostId, setDraggingHostId] = useState<number | null>(null);
  const [dropTargetHostId, setDropTargetHostId] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const upsert = trpc.hosts.upsert.useMutation({
    onSuccess: () => {
      toast.success(form.id ? "宿主物种已更新" : "宿主物种已新增");
      hosts.refetch();
      setDialogOpen(false);
      setForm(defaultFormState());
      setTableError(null);
    },
    onError: (error) => {
      toast.error(error.message || "保存失败");
    },
  });

  const del = trpc.hosts.delete.useMutation({
    onSuccess: () => {
      toast.success("宿主物种已删除");
      hosts.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });

  const reorder = trpc.hosts.reorder.useMutation({
    onSuccess: () => {
      hosts.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "排序保存失败");
    },
  });
  const importHosts = trpc.hosts.upsert.useMutation();

  const openCreateDialog = () => {
    setForm(defaultFormState());
    setTableError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (host: any) => {
    setForm({
      id: host.id,
      name: host.name ?? "",
      scientificName: host.scientificName ?? "",
      codonRows: parseCodonTableToRows(host.codonTable),
    });
    setTableError(null);
    setDialogOpen(true);
  };

  const updateCodonRow = (rowId: string, field: keyof Omit<CodonRow, "id">, value: string) => {
    setForm(prev => ({
      ...prev,
      codonRows: prev.codonRows.map(row => {
        if (row.id !== rowId) return row;
        if (field === "aa") return { ...row, aa: normalizeAminoAcid(value) };
        if (field === "codon") return { ...row, codon: normalizeCodon(value) };
        return { ...row, frequency: value.trim() };
      }),
    }));
    setTableError(null);
  };

  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    fieldIndex: number
  ) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text)) return;

    e.preventDefault();
    const rows = text
      .replace(/\u2028/g, "\n")
      .replace(/\u2029/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter(line => line.trim() !== "")
      .map(line => line.split("\t"));

    if (!rows.length) return;

    const fieldOrder: Array<keyof Omit<CodonRow, "id">> = ["aa", "codon", "frequency"];

    setForm(prev => {
      const nextRows = [...prev.codonRows];
      const requiredLength = rowIndex + rows.length;
      while (nextRows.length < requiredLength) {
        nextRows.push(createEmptyRow());
      }

      rows.forEach((cells, rOffset) => {
        const targetRow = nextRows[rowIndex + rOffset];
        cells.forEach((cell, cOffset) => {
          const targetField = fieldOrder[fieldIndex + cOffset];
          if (!targetField) return;
          if (targetField === "aa") targetRow.aa = normalizeAminoAcid(cell);
          if (targetField === "codon") targetRow.codon = normalizeCodon(cell);
          if (targetField === "frequency") targetRow.frequency = cell.trim();
        });
      });

      return { ...prev, codonRows: nextRows };
    });
    setTableError(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("请填写宿主物种名称");
      return;
    }

    const { table, error } = serializeCodonRows(form.codonRows);
    if (error) {
      setTableError(error);
      return;
    }

    upsert.mutate({
      id: form.id,
      name: form.name.trim(),
      scientificName: form.scientificName.trim() || null,
      category: null,
      sortOrder: null,
      isActive: true,
      codonTable: table,
    });
  };

  const handleDropHost = (targetHostId: number) => {
    const list = hosts.data ?? [];
    if (!draggingHostId || draggingHostId === targetHostId) {
      setDraggingHostId(null);
      setDropTargetHostId(null);
      return;
    }
    const currentIndex = list.findIndex((host) => host.id === draggingHostId);
    const targetIndex = list.findIndex((host) => host.id === targetHostId);
    if (currentIndex < 0 || targetIndex < 0) return;

    const reordered = [...list];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    reorder.mutate({
      orderedIds: reordered.map((host) => host.id),
    });
    setDraggingHostId(null);
    setDropTargetHostId(null);
  };

  const handleExportHosts = () => {
    const list = hosts.data ?? [];
    if (!list.length) {
      toast.error("没有可导出的宿主物种数据");
      return;
    }

    const payload = {
      type: "host_species",
      exportedAt: new Date().toISOString(),
      items: list.map((host) => ({
        name: host.name,
        scientificName: host.scientificName ?? null,
        category: host.category ?? null,
        sortOrder: host.sortOrder ?? 0,
        codonTable: host.codonTable ?? null,
        isActive: host.isActive ?? true,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `host-species-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportHosts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed?.items;
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("导入文件中未找到宿主物种数据");
      }

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index] as Record<string, unknown>;
        if (typeof item?.name !== "string" || !item.name.trim()) {
          throw new Error(`第 ${index + 1} 条宿主物种缺少名称`);
        }

        await importHosts.mutateAsync({
          name: item.name.trim(),
          scientificName: typeof item.scientificName === "string" ? item.scientificName.trim() || null : null,
          category: typeof item.category === "string" ? item.category.trim() || null : null,
          sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : index,
          codonTable: item.codonTable ?? null,
          isActive: typeof item.isActive === "boolean" ? item.isActive : true,
        });
      }

      await hosts.refetch();
      toast.success("宿主物种已批量导入", { description: `共 ${items.length} 条` });
    } catch (error: any) {
      toast.error(error?.message || "宿主物种导入失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">宿主物种</h1>
          <p className="text-sm text-muted-foreground mt-1">维护宿主基础信息与密码子偏好表。</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportHosts}
          />
          <Button variant="outline" onClick={handleExportHosts} disabled={!hosts.data?.length}>
            批量导出
          </Button>
          <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={importHosts.isPending}>
            批量导入
          </Button>
          <Button onClick={openCreateDialog}>新增宿主</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="border p-3 text-center text-sm font-medium w-[88px]">排序</th>
                  <th className="border p-3 text-left text-sm font-medium min-w-[160px]">名称</th>
                  <th className="border p-3 text-left text-sm font-medium min-w-[180px]">学名</th>
                  <th className="border p-3 text-left text-sm font-medium min-w-[160px]">密码子偏好表</th>
                  <th className="border p-3 text-right text-sm font-medium w-[240px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {(hosts.data ?? []).map((host, index) => {
                  const rowCount = getPopulatedRowCount(parseCodonTableToRows(host.codonTable));
                  return (
                    <tr
                      key={host.id}
                      className={`hover:bg-muted/50 ${dropTargetHostId === host.id ? "bg-muted/40" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggingHostId !== host.id) {
                          setDropTargetHostId(host.id);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropHost(host.id);
                      }}
                      onDragEnd={() => {
                        setDraggingHostId(null);
                        setDropTargetHostId(null);
                      }}
                    >
                      <td className="border p-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={reorder.isPending}
                            draggable={!reorder.isPending}
                            onDragStart={(e) => {
                              setDraggingHostId(host.id);
                              setDropTargetHostId(host.id);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", String(host.id));
                            }}
                            title="拖动排序"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <span className="text-sm text-muted-foreground tabular-nums">{index + 1}</span>
                        </div>
                      </td>
                      <td className="border p-3 text-sm font-medium">{host.name}</td>
                      <td className="border p-3 text-sm text-muted-foreground">{host.scientificName || "—"}</td>
                      <td className="border p-3 text-sm text-muted-foreground">
                        {rowCount > 0 ? `已维护 ${rowCount} 行` : "未维护"}
                      </td>
                      <td className="border p-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(host)}>
                            编辑
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => del.mutate({ id: host.id })}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {hosts.data?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                      暂无宿主物种数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={open => {
        setDialogOpen(open);
        if (!open) {
          setForm(defaultFormState());
          setTableError(null);
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑宿主物种" : "新增宿主物种"}</DialogTitle>
            <DialogDescription>点击列表单条数据可快速编辑，并维护宿主专属密码子偏好表。</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如 Yeast"
                />
              </div>
              <div className="space-y-2">
                <Label>学名（可选）</Label>
                <Input
                  value={form.scientificName}
                  onChange={e => setForm(prev => ({ ...prev, scientificName: e.target.value }))}
                  placeholder="如 Saccharomyces cerevisiae"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label>密码子偏好表 codonTable（可选，表格）</Label>
                  <div className="text-sm text-muted-foreground">
                    支持 Excel 三列粘贴，列顺序为 `aa / codon / frequency`。
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForm(prev => ({ ...prev, codonRows: mergeRowsWithTemplate(prev.codonRows) }))}
                  >
                    一键生成模板
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setForm(prev => ({ ...prev, codonRows: [] }));
                      setTableError(null);
                    }}
                  >
                    清空
                  </Button>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="border p-2 text-sm font-medium w-[100px]">氨基酸</th>
                        <th className="border p-2 text-sm font-medium w-[140px]">密码子</th>
                        <th className="border p-2 text-sm font-medium min-w-[220px]">频率</th>
                        <th className="border p-2 text-sm font-medium w-[100px]">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.codonRows.map((row, rowIndex) => (
                        <tr key={row.id}>
                          <td className="border p-2">
                            <Input
                              value={row.aa}
                              onChange={e => updateCodonRow(row.id, "aa", e.target.value)}
                              onPaste={e => handleCellPaste(e, rowIndex, 0)}
                              placeholder="如 R"
                              className="h-9"
                            />
                          </td>
                          <td className="border p-2">
                            <Input
                              value={row.codon}
                              onChange={e => updateCodonRow(row.id, "codon", e.target.value)}
                              onPaste={e => handleCellPaste(e, rowIndex, 1)}
                              placeholder="如 CGA"
                              className="h-9 font-mono"
                            />
                          </td>
                          <td className="border p-2">
                            <Input
                              value={row.frequency}
                              onChange={e => updateCodonRow(row.id, "frequency", e.target.value)}
                              onPaste={e => handleCellPaste(e, rowIndex, 2)}
                              placeholder="如 0.0693"
                              className="h-9 font-mono"
                            />
                          </td>
                          <td className="border p-2 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setForm(prev => ({
                                  ...prev,
                                  codonRows: prev.codonRows.filter(item => item.id !== row.id),
                                }))
                              }
                            >
                              删除
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {form.codonRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                            暂未维护密码子偏好表，可点击“一键生成模板”或手动新增行。
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  已填写 {getPopulatedRowCount(form.codonRows)} 行
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setForm(prev => ({ ...prev, codonRows: [...prev.codonRows, createEmptyRow()] }))}
                >
                  新增行
                </Button>
              </div>

              {tableError ? <div className="text-sm text-destructive">{tableError}</div> : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setForm(defaultFormState());
                setTableError(null);
              }}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
