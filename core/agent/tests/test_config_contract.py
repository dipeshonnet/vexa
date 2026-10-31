"""config.v1 (ADR-0026) — agent-api's declaration, the pydantic-settings ↔ declaration sync (every
``Settings`` field's VEXA_* env name must be declared — the Python-side half of what
gate:config-contract's regex scanner cannot introspect), the capability tri-states (bot_gateway ·
model_inference), and the ADDITIVE /health rows next to the existing dispatcher check.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from control_plane import config_preflight as cp
from control_plane.api import create_app
from control_plane.dispatch import Dispatcher
from shared.config import Settings, load_settings


class _FakeRuntime:
    def spawn(self, workload_id, profile, env):
        return workload_id


class _FakeIdentity:
    def mint(self, subject, launcher, workspaces, tools):
        return "fake-token"


@pytest.fixture(autouse=True)
def _fresh_probe_cache():
    cp._reset_probe_cache()
    yield
    cp._reset_probe_cache()


def test_declaration_loads_and_is_internally_consistent():
    decl = cp.load_declaration()
    assert decl["service"] == "agent-api"
    assert set(decl["capabilities"]) == {"bot_gateway", "model_inference"}
    assert decl["capabilities"]["model_inference"]["mode"] == "any"


def test_every_settings_field_is_declared():
    """pydantic-settings reads env by field name (VEXA_ prefix) — invisible to the gate's literal
    os.getenv scanner, so THIS test holds the sync: a new Settings field must land in the
    declaration (the SSOT) to pass."""
    declared = {k["key"] for k in cp.load_declaration()["keys"]}
    for field in Settings.model_fields:
        env_name = f"VEXA_{field.upper()}"
        assert env_name in declared, (
            f"Settings.{field} reads {env_name} but config.v1.json does not declare it — "
            "add it to core/agent/control_plane/config.v1.json"
        )


def test_capability_tri_states():
    assert cp.capability_states({})["bot_gateway"] == cp.NOT_CONFIGURED
    assert cp.capability_states({"VEXA_BOT_API_KEY": "k"})["bot_gateway"] == cp.CONFIGURED
    # mode=any: any ONE model-credential path configures the agent plane's model_inference row
    assert cp.capability_states({})["model_inference"] == cp.NOT_CONFIGURED
    assert cp.capability_states({"HOST_CLAUDE_CREDENTIALS": "/x.json"})["model_inference"] == cp.CONFIGURED
    assert cp.capability_states({"ANTHROPIC_AUTH_TOKEN": "tok"})["model_inference"] == cp.CONFIGURED


def test_preflight_has_no_required_keys_and_reports_rows(monkeypatch):
    for k in ("VEXA_BOT_API_KEY", "HOST_CLAUDE_CREDENTIALS", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    report = cp.preflight()
    assert report["service"] == "agent-api"
    assert report["capabilities"]["bot_gateway"]["state"] == cp.NOT_CONFIGURED
    assert report["capabilities"]["model_inference"]["state"] == cp.NOT_CONFIGURED


def test_health_carries_capability_rows_additively(monkeypatch):
    for k in ("VEXA_BOT_API_KEY", "HOST_CLAUDE_CREDENTIALS", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    app = create_app(Dispatcher(load_settings(), _FakeRuntime(), _FakeIdentity()))
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    body = r.json()
    # the pre-existing consumers' keys are untouched
    assert body["status"] == "ok"
    assert body["service"] == "agent-api"
    assert body["checks"]["dispatcher"] is True
    # the additive config.v1 rows; unconfigured capabilities NEVER degrade status
    assert body["capabilities"]["bot_gateway"]["state"] == cp.NOT_CONFIGURED
    assert body["capabilities"]["model_inference"]["state"] == cp.NOT_CONFIGURED


def test_health_degraded_path_still_carries_rows():
    # the dispatcher-absent 503 (P18) keeps its shape AND gains the rows
    r = TestClient(create_app(None)).get("/health")  # type: ignore[arg-type]
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "degraded"
    assert "capabilities" in body


@pytest.mark.parametrize("configured, expected", [
    ({"url": "https://customer", "token": "customer-key", "model": "whisper-large-v3-turbo"},
     ("https://customer", "customer-key", "settings", "whisper-large-v3-turbo")),
    ({"url": "https://customer"}, ("https://customer", "", "settings", "whisper-1")),
    ({}, ("https://deployment", "deployment-key", "env", "deployment-model")),
])
def test_transcription_route_tests_the_bots_effective_config(monkeypatch, configured, expected):
    import json
    import urllib.request
    from control_plane import config_test
    from pydantic import SecretStr

    monkeypatch.setenv("TRANSCRIPTION_SERVICE_URL", "https://deployment")
    monkeypatch.setenv("TRANSCRIPTION_SERVICE_TOKEN", "deployment-key")
    monkeypatch.setenv("TRANSCRIPTION_MODEL", "deployment-model")
    monkeypatch.delenv("VEXA_REQUIRE_GATEWAY_IDENTITY", raising=False)
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self): return json.dumps({"transcription": configured}).encode()
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **kw: Response())
    seen = []
    def probe(url, token, source, *, model):
        seen.append((url, token, source, model))
        return {"ok": True, "summary": "probe"}
    monkeypatch.setattr(config_test, "run_transcription_test", probe)
    settings = load_settings().model_copy(update={
        "admin_api_url": "http://identity", "internal_api_secret": SecretStr("internal")})
    app = create_app(Dispatcher(settings, _FakeRuntime(), _FakeIdentity()))
    response = TestClient(app).get("/api/transcription/test", headers={"X-User-Id": "2"})
    assert response.status_code == 200
    assert seen == [expected]


def test_shared_audio_probe_identifies_the_application(monkeypatch):
    import urllib.request
    seen = []
    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *args): pass
    def open_request(req, timeout):
        seen.append(req)
        return Response()
    monkeypatch.setattr(urllib.request, "urlopen", open_request)
    out = cp._http_probe({"url_key": "URL", "auth_key": "TOKEN", "payload": "audio"},
                         {"URL": "https://stt", "TOKEN": "dummy"}, 1)
    assert out["ok"]
    assert seen[0].get_header("User-agent") == "Vexa/1.0"
