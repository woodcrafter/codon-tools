import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file


APP_ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT_PATH = APP_ROOT.parent / "DNAWORKS.inp"
DNAWORKS_BIN = os.environ.get("DNAWORKS_BIN", "/opt/dnaworks/dnaworks")
MAX_LOG_LINES = 2000

app = Flask(__name__, template_folder="templates", static_folder="static")
jobs_lock = threading.Lock()
jobs = {}


def _trim_logs(job):
    if len(job["logs"]) > MAX_LOG_LINES:
        job["logs"] = job["logs"][-MAX_LOG_LINES:]


def _update_job(job_id, **kwargs):
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(kwargs)


def _append_log(job_id, line):
    with jobs_lock:
        if job_id not in jobs:
            return
        jobs[job_id]["logs"].append(line.rstrip("\n"))
        _trim_logs(jobs[job_id])


def run_dnaworks_job(job_id, input_text):
    workdir = Path(tempfile.mkdtemp(prefix=f"dnaworks_{job_id}_"))
    input_file = workdir / "DNAWORKS.inp"
    log_file = workdir / "LOGFILE.txt"

    _update_job(job_id, status="running", started_at=time.time(), workdir=str(workdir))
    input_file.write_text(input_text, encoding="utf-8")
    _append_log(job_id, f"Working directory: {workdir}")
    _append_log(job_id, f"Running: {DNAWORKS_BIN} {input_file.name}")

    try:
        proc = subprocess.Popen(
            [DNAWORKS_BIN, input_file.name],
            cwd=str(workdir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except FileNotFoundError:
        _update_job(
            job_id,
            status="error",
            error=f"DNAWorks binary not found: {DNAWORKS_BIN}",
            finished_at=time.time(),
        )
        return
    except Exception as exc:  # noqa: BLE001
        _update_job(
            job_id,
            status="error",
            error=f"Failed to start process: {exc}",
            finished_at=time.time(),
        )
        return

    for line in proc.stdout:
        _append_log(job_id, line)
    proc.wait()

    result_text = ""
    if log_file.exists():
        result_text = log_file.read_text(encoding="utf-8", errors="replace")

    status = "done" if proc.returncode == 0 else "error"
    error = None if proc.returncode == 0 else f"DNAWorks exited with code {proc.returncode}"

    _update_job(
        job_id,
        status=status,
        exit_code=proc.returncode,
        result_text=result_text,
        error=error,
        finished_at=time.time(),
    )
    _append_log(job_id, "Run completed.")


def load_default_input():
    if DEFAULT_INPUT_PATH.exists():
        return DEFAULT_INPUT_PATH.read_text(encoding="utf-8", errors="replace")
    return "title Demo\nlogfile LOGFILE.txt\n\nprotein\nMSTNPKPQRKTKRNTNRRPQDVKFPGG\n//\n"


@app.get("/")
def index():
    return render_template("index.html", default_input=load_default_input())


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "binary": DNAWORKS_BIN})


@app.post("/api/run")
def run_job():
    payload = request.get_json(silent=True) or {}
    input_text = (payload.get("input_text") or "").strip()
    if not input_text:
        return jsonify({"error": "input_text is required"}), 400

    job_id = uuid.uuid4().hex[:12]
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "created_at": time.time(),
            "started_at": None,
            "finished_at": None,
            "exit_code": None,
            "error": None,
            "logs": [],
            "result_text": "",
            "workdir": None,
        }

    thread = threading.Thread(target=run_dnaworks_job, args=(job_id, input_text), daemon=True)
    thread.start()
    return jsonify({"job_id": job_id})


@app.get("/api/job/<job_id>")
def get_job(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            return jsonify({"error": "job not found"}), 404
        out = {
            "id": job["id"],
            "status": job["status"],
            "created_at": job["created_at"],
            "started_at": job["started_at"],
            "finished_at": job["finished_at"],
            "exit_code": job["exit_code"],
            "error": job["error"],
            "logs": job["logs"][-300:],
            "result_available": bool(job["result_text"]),
        }
    return jsonify(out)


@app.get("/api/job/<job_id>/result")
def get_job_result(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            return jsonify({"error": "job not found"}), 404
        if not job["result_text"]:
            return jsonify({"error": "result not ready"}), 404

    tmp_file = Path(tempfile.mkdtemp(prefix="dnaworks_result_")) / f"{job_id}_LOGFILE.txt"
    tmp_file.write_text(job["result_text"], encoding="utf-8")
    return send_file(str(tmp_file), as_attachment=True, download_name="LOGFILE.txt")


@app.post("/api/job/<job_id>/cleanup")
def cleanup_job(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            return jsonify({"error": "job not found"}), 404
        if job["status"] == "running":
            return jsonify({"error": "job is still running"}), 409
        workdir = job.get("workdir")
        jobs.pop(job_id, None)

    if workdir:
        shutil.rmtree(workdir, ignore_errors=True)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=False)
