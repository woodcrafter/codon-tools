import { spawnSync } from "node:child_process";

const user = process.env.USER || "apple";
const candidates = [
  "/usr/local/bin/docker",
  `/Users/${user}/.orbstack/bin/docker`,
  "docker",
];

function isUsableDocker(bin) {
  const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return false;
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (output.includes("Docker is not installed. This is a mock script.")) {
    return false;
  }
  return output.includes("Docker version");
}

const dockerBin = candidates.find(isUsableDocker);

if (!dockerBin) {
  console.error("未检测到可用 Docker CLI，请启动 OrbStack 并检查 docker 命令路径。");
  process.exit(1);
}

const args = ["compose", ...process.argv.slice(2)];
const run = spawnSync(dockerBin, args, {
  stdio: "inherit",
  env: process.env,
});

if (typeof run.status === "number") {
  process.exit(run.status);
}

process.exit(1);
