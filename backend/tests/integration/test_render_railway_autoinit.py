import pytest
import os
from pathlib import Path
from sqlalchemy import select, func
from app.config import get_settings
from app.database.session import get_session_factory, init_db, close_db
from app.database.models import Task, VenueLayout, VideoFile, ProcessingJob, Alert, CrowdMetric, RiskAssessment, DetectionSummary
from app.scripts.setup_railway_demo import setup_railway_demo

@pytest.mark.asyncio
async def test_fresh_production_autoinit_and_idempotency(tmp_path, monkeypatch):
    """Verify that on a brand new production database, Railway CCTV demo task is auto-seeded and idempotent."""
    test_db = tmp_path / "fresh_production.db"
    test_db_url = f"sqlite+aiosqlite:///{test_db.as_posix()}"
    
    settings = get_settings()
    monkeypatch.setattr(settings, "database_url", test_db_url)
    
    # 1. First run: Fresh database initialization
    await setup_railway_demo()
    
    session_factory = get_session_factory()
    async with session_factory() as session:
        # Verify Task
        task = await session.get(Task, "task_railway_cctv_analysis")
        assert task is not None
        assert task.name == "Railway CCTV analysis"
        assert task.state == "READY"
        assert task.layout_snapshot is not None
        assert len(task.layout_snapshot.get("zones_data", [])) == 4
        
        # Verify Layout
        layout = await session.get(VenueLayout, "layout_railway_cctv")
        assert layout is not None
        assert len(layout.zones_data) == 4
        zone_ids = [z["id"] for z in layout.zones_data]
        assert "zone-boarding-edge" in zone_ids
        assert "zone-platform-edge" in zone_ids
        assert "zone-waiting-queue" in zone_ids
        assert "zone-circulation-walkway" in zone_ids
        
        # Verify VideoFile
        vfile = await session.get(VideoFile, "vid_railway_cctv")
        assert vfile is not None
        assert vfile.original_filename == "cctvfootagerailway.mp4"
        
        # Verify Completed Job
        job = await session.get(ProcessingJob, "77ea3737-d724-42f7-9e44-8b9781fe47c7")
        assert job is not None
        assert job.status == "COMPLETED"
        assert job.frames_processed >= 84
        
        # Verify Exactly 1 Alert
        alerts = (await session.execute(select(Alert).where(Alert.event_id == "task_railway_cctv_analysis"))).scalars().all()
        assert len(alerts) == 1
        assert alerts[0].id == "alert_railway_boarding_surge_001"
        assert alerts[0].severity == "CRITICAL"
        assert alerts[0].category == "OVERCROWDING_SURGE"
        
        # Verify Metrics, Risks, and Summaries
        metrics_count = (await session.execute(select(func.count(CrowdMetric.id)).where(CrowdMetric.event_id == "task_railway_cctv_analysis"))).scalar()
        assert metrics_count >= 700
        
        risks_count = (await session.execute(select(func.count(RiskAssessment.id)).where(RiskAssessment.event_id == "task_railway_cctv_analysis"))).scalar()
        assert risks_count >= 700
        
        summaries_count = (await session.execute(select(func.count(DetectionSummary.id)).where(DetectionSummary.event_id == "task_railway_cctv_analysis"))).scalar()
        assert summaries_count >= 200

    # 2. Second run: Idempotency check (simulating container restart / redeployment)
    await setup_railway_demo()
    
    async with session_factory() as session:
        tasks = (await session.execute(select(Task).where(Task.name == "Railway CCTV analysis"))).scalars().all()
        assert len(tasks) == 1
        
        alerts_recheck = (await session.execute(select(Alert).where(Alert.event_id == "task_railway_cctv_analysis"))).scalars().all()
        assert len(alerts_recheck) == 1
        
        metrics_recheck = (await session.execute(select(func.count(CrowdMetric.id)).where(CrowdMetric.event_id == "task_railway_cctv_analysis"))).scalar()
        assert metrics_recheck == metrics_count
        
        summaries_recheck = (await session.execute(select(func.count(DetectionSummary.id)).where(DetectionSummary.event_id == "task_railway_cctv_analysis"))).scalar()
        assert summaries_recheck == summaries_count

    await close_db()
