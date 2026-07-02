import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useState } from "react";

export default function RestrictionEnzymesPage() {
  const enzymes = trpc.enzymes.list.useQuery();
  const upsert = trpc.enzymes.upsert.useMutation({
    onSuccess: () => enzymes.refetch(),
  });
  const del = trpc.enzymes.delete.useMutation({
    onSuccess: () => enzymes.refetch(),
  });

  const [name, setName] = useState("");
  const [recognitionSequence, setRecognitionSequence] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">限制性内切酶</h1>
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
