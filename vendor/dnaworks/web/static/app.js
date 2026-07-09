const runBtn = document.getElementById("runBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusBadge = document.getElementById("statusBadge");
const inputText = document.getElementById("inputText");
const logView = document.getElementById("logView");

let currentJobId = null;
let timerId = null;

function setStatus(status, message) {
  statusBadge.className = "badge";
  if (status === "running" || status === "queued") {
    statusBadge.classList.add("running");
    statusBadge.textContent = message || "运行中";
    return;
  }
  if (status === "error") {
    statusBadge.classList.add("error");
    statusBadge.textContent = message || "失败";
    return;
  }
  statusBadge.classList.add("idle");
  statusBadge.textContent = message || "空闲";
}

function appendLogs(lines) {
  logView.textContent = lines.join("\n") || "暂无日志输出。";
  logView.scrollTop = logView.scrollHeight;
}

async function pollJob() {
  if (!currentJobId) {
    return;
  }

  try {
    const res = await fetch(`/api/job/${currentJobId}`);
    if (!res.ok) {
      throw new Error(`查询失败: ${res.status}`);
    }
    const data = await res.json();
    appendLogs(data.logs || []);

    if (data.status === "running" || data.status === "queued") {
      setStatus(data.status, "运行中");
      return;
    }

    clearInterval(timerId);
    timerId = null;
    runBtn.disabled = false;

    if (data.status === "done") {
      setStatus("idle", "已完成");
      downloadBtn.disabled = !data.result_available;
      if (!data.result_available) {
        logView.textContent += "\n\n任务完成，但未找到 LOGFILE.txt。";
      }
      return;
    }

    setStatus("error", "失败");
    downloadBtn.disabled = true;
    if (data.error) {
      logView.textContent += `\n\n错误: ${data.error}`;
    }
  } catch (err) {
    clearInterval(timerId);
    timerId = null;
    runBtn.disabled = false;
    setStatus("error", "连接错误");
    logView.textContent += `\n\n${err}`;
  }
}

runBtn.addEventListener("click", async () => {
  const text = inputText.value.trim();
  if (!text) {
    setStatus("error", "输入为空");
    return;
  }

  runBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus("running", "提交中");
  logView.textContent = "任务已提交，等待启动...";

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input_text: text }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `提交失败: ${res.status}`);
    }
    currentJobId = data.job_id;
    setStatus("running", "运行中");
    timerId = setInterval(pollJob, 1200);
    pollJob();
  } catch (err) {
    runBtn.disabled = false;
    setStatus("error", "提交失败");
    logView.textContent += `\n\n${err}`;
  }
});

downloadBtn.addEventListener("click", () => {
  if (!currentJobId) {
    return;
  }
  window.location.href = `/api/job/${currentJobId}/result`;
});
