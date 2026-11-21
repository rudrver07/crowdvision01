import sqlite3
import json
from pathlib import Path

def export_railway():
    conn = sqlite3.connect('crowdvision_main.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    task_id = 'task_railway_cctv_analysis'
    
    print("Exporting genuine railway analysis data...")
    task = dict(c.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone() or {})
    layout = dict(c.execute("SELECT * FROM venue_layouts WHERE id = 'layout_railway_cctv'").fetchone() or {})
    video = dict(c.execute("SELECT * FROM video_files WHERE id = 'vid_railway_cctv'").fetchone() or {})
    jobs = [dict(r) for r in c.execute("SELECT * FROM processing_jobs WHERE event_id = ? ORDER BY created_at DESC LIMIT 1", (task_id,)).fetchall()]
    alerts = [dict(r) for r in c.execute("SELECT * FROM alerts WHERE event_id = ?", (task_id,)).fetchall()]
    metrics = [dict(r) for r in c.execute("SELECT * FROM crowd_metrics WHERE event_id = ? ORDER BY video_timestamp_sec", (task_id,)).fetchall()]
    risks = [dict(r) for r in c.execute("SELECT * FROM risk_assessments WHERE event_id = ? ORDER BY video_timestamp_sec", (task_id,)).fetchall()]
    detection_summaries = [dict(r) for r in c.execute("SELECT * FROM detection_summaries WHERE event_id = ? ORDER BY video_timestamp_sec", (task_id,)).fetchall()]

    print(f"Task: {task.get('name')}")
    print(f"Layout: {layout.get('name')}")
    print(f"Video: {video.get('original_filename')}")
    print(f"Jobs: {len(jobs)}")
    print(f"Alerts: {len(alerts)}")
    print(f"Metrics: {len(metrics)}")
    print(f"Risks: {len(risks)}")
    print(f"Detection summaries: {len(detection_summaries)}")

    # Deserialize JSON fields
    for d in [task, layout, video] + jobs + alerts + metrics + risks + detection_summaries:
        for k, v in list(d.items()):
            if isinstance(v, str) and (v.startswith('{') or v.startswith('[')):
                try:
                    d[k] = json.loads(v)
                except Exception:
                    pass

    seed = {
        "task": task,
        "layout": layout,
        "video": video,
        "job": jobs[0] if jobs else None,
        "alert": alerts[0] if alerts else None,
        "metrics_count": len(metrics),
        "risks_count": len(risks),
        "detection_summaries_count": len(detection_summaries),
        "metrics": metrics,
        "risks": risks,
        "detection_summaries": detection_summaries,
    }

    out_dir = Path("backend/app/seeds")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "railway_demo_seed.json.gz"
    import gzip
    with gzip.open(out_path, "wt", encoding="utf-8") as f:
        json.dump(seed, f)
    print(f"Successfully exported compressed seed to {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")

if __name__ == "__main__":
    export_railway()
