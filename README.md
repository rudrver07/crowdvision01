# CrowdVision: Predictive Crowd Intelligence & Agentic Monitoring

CrowdVision is an intelligent crowd monitoring, computer vision, and predictive spatial safety platform. It integrates high-throughput CV analytics (YOLO person detection, ByteTrack multi-object tracking, and perspective-calibrated zone mapping) with an interactive AI Copilot and an independent analytical AI Agent to forecast overcrowding risks and execute confirmed operator mitigation actions.

---

## Key System Capabilities

- **Task & Spatial Management**: Dedicated monitoring tasks with persistent polygon zone definitions, configurable design capacities, and camera perspective calibration.
- **Computer Vision Pipeline**: Real-time person detection, ground-contact point mapping, velocity tracking, and density estimation with automated fallback to OpenCV HOG/motion compensation.
- **Predictive Heatmaps**: Real-time spatial Gaussian density heatmaps with multi-horizon forward projections (+30s, +60s, +180s, +300s).
- **Synchronized Tri-Pane Monitoring**: Real-time synchronized inspection of raw video feed, computer-vision crowd density heatmap, and spatial zone risk hierarchy.
- **Interactive AI Copilot**: Grounded operational Copilot supporting natural language queries over real telemetry, backed by Google Gemini with deterministic offline fallback and human-in-the-loop confirmed action execution.
- **Independent AI Agent**: Dedicated microservice for multi-horizon risk scoring, hysteresis-based alert lifecycle management, and automated action suggestions.
- **Interactive Web Console**: High-density React 19, TypeScript, Tailwind CSS, & Vite operator workstation with live WebSocket telemetry, zone drawing tools, and alert resolution workflows.

---

## Repository Layout

```
.
├── backend/            # FastAPI analytics server, CV pipeline, AI Copilot & SQLite/PostgreSQL storage
│   ├── app/
│   │   ├── analytics/  # Zone mapping, density calculation, heatmap generation & prediction
│   │   ├── api/        # REST and WebSocket endpoints (tasks, layouts, videos, alerts, copilot, health)
│   │   ├── copilot/    # Modular LLM providers, tool schemas, confirmed action executor & service
│   │   ├── cv/         # Video source decoding, YOLO/HOG detection, ByteTrack & perspective estimation
│   │   ├── database/   # SQLAlchemy models, async sessions, and database migrations
│   │   └── services/   # Background video processor, alert manager & client integrations
│   └── tests/          # 53 automated unit, integration, and security tests
├── ai_agent/           # Independent crowd management AI agent & risk interpreter microservice
│   └── tests/          # 33 automated unit, integration, performance, and resilience tests
├── frontend/           # React 19, TypeScript, Tailwind CSS, Lucide icons & Vite operator UI
├── .github/workflows/  # Continuous integration test pipelines
├── requirements.txt    # Unified root Python dependency manifest
├── SECURITY.md         # Vulnerability reporting & security architecture
└── CONTRIBUTING.md     # Guidelines for developers and researchers
```

---

## Quickstart

### 1. Environment Setup

Copy example environment configurations:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp ai_agent/.env.example ai_agent/.env
```

Install root dependencies (Python 3.11+ recommended):
```bash
pip install -r requirements.txt
```

### 2. Run the Backend Service
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation is available at `http://localhost:8000/docs`.

### 3. Run the AI Agent Service (Optional microservice)
```bash
cd ai_agent
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```
Agent Documentation is available at `http://localhost:8001/docs`.

### 4. Run the Operator Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## ElevenLabs Voice Alert System

CrowdVision features an integrated, professional voice alert subsystem powered by ElevenLabs Text-to-Speech:

- **17-Second Fixed Aggregation Window**: Upon arrival of an alert, incoming alerts are grouped by stable zone ID over a 17-second window. Only the latest alert per zone is announced, in original first-seen zone order.
- **Critical Escalation Protection**: Critical crowd surges and emergency density warnings are strictly preserved and never downgraded during aggregation.
- **Global Single-Playback Authority**: Guaranteed `MAX_CONCURRENT_ACTIVE_PLAYBACKS === 1`. Announcements play strictly sequentially with synchronous locking, avoiding audio overlap.
- **Multi-Tab & Cross-Client Coordination**: Coordinates via Web Locks API (`navigator.locks`), `BroadcastChannel`, and backend playback leases (`/api/voice/lease/*`) so only the active designated tab speaks.
- **Bilingual Operational Announcements**: Supports English (`en`) and Hindi (`hi`), strictly using verified numerical telemetry (e.g. occupancy percentages) from the source alert.

### ElevenLabs Configuration
Configure the following backend environment variables in `.env` or in Render:
```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=tnSpp4vdxKPjI9w0GnoV
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
ELEVENLABS_ENABLED=true
```

To run the automated voice test suite (covering Scenarios A through K):
```bash
node --experimental-strip-types tests/test_voice_scenarios_a_to_k.ts
```

---

## Automated Verification & Testing

Both subsystems include comprehensive automated unit, integration, security, and end-to-end workflow test suites (86 passing tests total):

```bash
# Run all backend tests (53 passing tests, including 29-step e2e release workflow)
python -m pytest -o pythonpath=backend backend/tests/ -v

# Run AI agent tests (33 passing tests)
python -m pytest -o pythonpath=ai_agent ai_agent/tests/ -v

# Verify frontend build
npm --prefix frontend run build
```

---

## Security & Privacy Notice

CrowdVision does not transmit raw video frames, facial imagery, or personal biometric identities to third-party LLMs. Only structured numerical telemetry (occupancy counts, density indices, and velocity vectors) is evaluated by the intelligence layer. All administrative actions (such as capacity modifications or pipeline shutdowns) enforce strict human-in-the-loop operator confirmation.

## Production Live Deployment
- **Live URL**: https://crowdvision01-1.onrender.com
- **Health Check**: https://crowdvision01-1.onrender.com/api/health
https://crowdvision01-1.onrender.com/