import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { toast } from "sonner";

export default function RestrictionEnzymesPage() {
  const enzymes = trpc.enzymes.list.useQuery();
  const upsert = trpc.enzymes.upsert.useMutation({
    onSuccess: () => enzymes.refetch(),
  });
  const importEnzymes = trpc.enzymes.upsert.useMutation();
  const del = trpc.enzymes.delete.useMutation({
    onSuccess: () => enzymes.refetch(),
  });

  const [name, setName] = useState("");
  const [recognitionSequence, setRecognitionSequence] = useState("");

  const handleExportEnzymes = () => {
    const list = enzymes.data ?? [];
    if (!list.length) {
      toast.error("没有可导出的限制性内切酶数据");
      return;
    }

    const payload = {
      type: "restriction_enzymes",
      exportedAt: new Date().toISOString(),
      items: list.map((item) => ({
        name: item.name,
        recognitionSequence: item.recognitionSequence,
        cutPattern: item.cutPattern ?? null,
        overhang: item.overhang ?? null,
        methylationSensitivity: item.methylationSensitivity ?? null,
        isCommon: item.isCommon ?? false,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `restriction-enzymes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportEnzymes = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed?.items;
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("导入文件中未找到限制性内切酶数据");
      }

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index] as Record<string, unknown>;
        if (typeof item?.name !== "string" || !item.name.trim()) {
          throw new Error(`第 ${index + 1} 条限制性内切酶缺少名称`);
        }
        if (typeof item?.recognitionSequence !== "string" || !item.recognitionSequence.trim()) {
          throw new Error(`第 ${index + 1} 条限制性内切酶缺少识别序列`);
        }

        await importEnzymes.mutateAsync({
          name: item.name.trim(),
          recognitionSequence: item.recognitionSequence.trim(),
          cutPattern: typeof item.cutPattern === "string" ? item.cutPattern.trim() || null : null,
          overhang:
            item.overhang === "blunt" || item.overhang === "5_prime" || item.overhang === "3_prime"
              ? item.overhang
              : null,
          methylationSensitivity:
            typeof item.methylationSensitivity === "string" ? item.methylationSensitivity.trim() || null : null,
          isCommon: typeof item.isCommon === "boolean" ? item.isCommon : false,
        });
      }

      await enzymes.refetch();
      toast.success("限制性内切酶已批量导入", { description: `共 ${items.length} 条` });
    } catch (error: any) {
      toast.error(error?.message || "限制性内切酶导入失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">限制性内切酶</h1>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            id="restriction-enzymes-import"
            onChange={handleImportEnzymes}
          />
          <Button variant="outline" onClick={handleExportEnzymes} disabled={!enzymes.data?.length}>
            批量导出
          </Button>
          <Button
            variant="outline"
            onClick={() => document.getElementById("restriction-enzymes-import")?.click()}
            disabled={importEnzymes.isPending}
          >
            批量导入
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="酶名称" value={name} onChange={e => setName(e.target.value)} />
          <Input
            placeholder="识别序列（如 GAATTC）"
            value={recognitionSequence}
            onChange={e => setRecognitionSequence(e.target.value)}
          />
        </div>
        <Button
          onClick={() => upsert.mutate({ name, recognitionSequence })}
          disabled={!name.trim() || !recognitionSequence.trim() || upsert.isPending}
        >
          新增/更新
        </Button>
      </Card>

      <Card className="p-4">
        <div className="text-sm text-muted-foreground mb-3">共 {enzymes.data?.length ?? 0} 条</div>
        <div className="space-y-2">
          {(enzymes.data ?? []).map(ez => (
            <div key={ez.id} className="flex items-center justify-between gap-2 border-b py-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{ez.name}</div>
                <div className="text-xs text-muted-foreground truncate">{ez.recognitionSequence}</div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => del.mutate({ id: ez.id })}>
                删除
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
