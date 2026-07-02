export type ParsedSequence = {
  name: string;
  sequence: string;
};

function normalizeSequence(raw: string) {
  return raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^ACGTRYSWKMBDHVN]/g, "");
}

export function isProbablyBinary(text: string) {
  return text.includes("\u0000");
}

function parseFasta(text: string): ParsedSequence[] {
  const lines = text.split(/\r?\n/);
  const items: ParsedSequence[] = [];

  let currentName: string | null = null;
  let seqParts: string[] = [];

  const flush = () => {
    if (!currentName) return;
    const seq = normalizeSequence(seqParts.join(""));
    if (seq.length > 0) items.push({ name: currentName, sequence: seq });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(">")) {
      flush();
      currentName = line.slice(1).trim() || "Untitled";
      seqParts = [];
      continue;
    }
    if (!currentName) {
      currentName = "Untitled";
    }
    seqParts.push(line);
  }

  flush();
  return items;
}

export function parseSequenceFile(fileName: string, fileText: string): ParsedSequence[] {
  if (isProbablyBinary(fileText)) {
    throw new Error("该文件看起来是二进制格式（如 SnapGene .dna），请导出为 .fa/.fasta 再导入");
  }

  const trimmed = fileText.trim();
  if (!trimmed) {
    throw new Error("文件为空");
  }

  if (trimmed.startsWith(">")) {
    const items = parseFasta(trimmed);
    if (items.length === 0) throw new Error("未解析到有效 FASTA 序列");
    return items;
  }

  const normalized = normalizeSequence(trimmed);
  if (normalized.length === 0) {
    throw new Error("未解析到有效碱基序列");
  }

  const base = fileName.replace(/\.[^.]+$/, "");
  return [{ name: base || "Untitled", sequence: normalized }];
}

