"""env_flags — a SET-BUT-EMPTY boolean env must not invert its default.

The v0.12.5 release witness: a bot joined a real Google Meet, behaved normally, and transcribed
nothing, with no error. Cause: ``.env.example`` ships ``TRANSCRIBE_ENABLED=`` and Lite's ``make up``
runs ``docker run --env-file``, which passes the key through SET and EMPTY. ``os.getenv(k, "true")``
only defaults when the key is ABSENT, so it returned ``""`` — and ``"" == "true"`` is False. The
default inverted, the bot spawned capture-only, and the fail-loud STT gate (which tested the same
expression) also read empty as an explicit opt-out and refused nothing.

Every rung below L5 missed it because no test ever set the env to empty — the fakes and the unit
tests only ever exercised the REQUEST value. These are that missing rung.
"""
from __future__ import annotations

import pytest

from meeting_api.bot_spawn.env_flags import env_flag


class TestEmptyIsNotOptOut:
    """The witness bug, pinned. `raw` is the injection seam; env parity is covered below."""

    @pytest.mark.parametrize("raw", ["", " ", "\t", "\n", "   "])
    def test_set_but_empty_keeps_default_true(self, raw):
        assert env_flag("ANY", True, raw=raw) is True

    @pytest.mark.parametrize("raw", ["", " ", "\t"])
    def test_set_but_empty_keeps_default_false(self, raw):
        assert env_flag("ANY", False, raw=raw) is False

    def test_unset_keeps_default(self, monkeypatch):
        monkeypatch.delenv("VEXA_TEST_FLAG", raising=False)
        assert env_flag("VEXA_TEST_FLAG", True) is True
        assert env_flag("VEXA_TEST_FLAG", False) is False

    def test_empty_env_reads_as_default_not_false(self, monkeypatch):
        """The exact production shape: `docker run --env-file` with `TRANSCRIBE_ENABLED=`."""
        monkeypatch.setenv("TRANSCRIBE_ENABLED", "")
        assert env_flag("TRANSCRIBE_ENABLED", True) is True

    def test_the_old_expression_would_have_failed_this(self, monkeypatch):
        """Negative control: pin the defect so a revert to `os.getenv(k, "true")` re-reddens.

        If this ever passes, the empty-string hole is back.
        """
        import os

        monkeypatch.setenv("TRANSCRIBE_ENABLED", "")
        old_result = os.getenv("TRANSCRIBE_ENABLED", "true").lower() == "true"
        assert old_result is False, "the old expression is what shipped the bug"
        assert env_flag("TRANSCRIBE_ENABLED", True) is not old_result


class TestVocabulary:
    @pytest.mark.parametrize("raw", ["true", "TRUE", "True", " true ", "1", "yes", "on", "ON"])
    def test_truthy(self, raw):
        assert env_flag("ANY", False, raw=raw) is True

    @pytest.mark.parametrize("raw", ["false", "FALSE", "False", " false ", "0", "no", "off"])
    def test_falsey(self, raw):
        assert env_flag("ANY", True, raw=raw) is False

    @pytest.mark.parametrize("raw", ["maybe", "tru", "enabled", "#", "null"])
    def test_unrecognized_keeps_default_and_never_silently_opts_out(self, raw):
        """config.v1: opt-out must be EXPLICIT. A typo is not an opt-out — it must not disable
        transcription, which is exactly the silent-failure class this module exists to kill."""
        assert env_flag("ANY", True, raw=raw) is True
        assert env_flag("ANY", False, raw=raw) is False

    def test_unrecognized_warns(self, caplog):
        with caplog.at_level("WARNING"):
            env_flag("TRANSCRIBE_ENABLED", True, raw="maybe")
        assert "not a recognized boolean" in caplog.text
        assert "TRANSCRIBE_ENABLED" in caplog.text


class TestSpawnFlagCallSites:
    """The three shipped readers resolve ON when the env is empty — end of the witness bug."""

    @pytest.mark.parametrize("key", ["TRANSCRIBE_ENABLED", "RECORDING_ENABLED"])
    def test_router_resolvers_default_on_when_env_empty(self, monkeypatch, key):
        from meeting_api.bot_spawn.router import (
            _resolve_recording_enabled,
            _resolve_transcribe_enabled,
        )

        monkeypatch.setenv(key, "")
        resolve = (
            _resolve_transcribe_enabled if key == "TRANSCRIBE_ENABLED" else _resolve_recording_enabled
        )
        assert resolve(None) is True, f"{key}= (empty) must not disable the spawn default"

    @pytest.mark.parametrize("key", ["TRANSCRIBE_ENABLED", "RECORDING_ENABLED"])
    def test_explicit_false_env_still_opts_out(self, monkeypatch, key):
        from meeting_api.bot_spawn.router import (
            _resolve_recording_enabled,
            _resolve_transcribe_enabled,
        )

        monkeypatch.setenv(key, "false")
        resolve = (
            _resolve_transcribe_enabled if key == "TRANSCRIBE_ENABLED" else _resolve_recording_enabled
        )
        assert resolve(None) is False, "an explicit opt-out must still work"

    def test_request_value_still_wins_over_env(self, monkeypatch):
        from meeting_api.bot_spawn.router import _resolve_transcribe_enabled

        monkeypatch.setenv("TRANSCRIBE_ENABLED", "false")
        assert _resolve_transcribe_enabled(True) is True
        monkeypatch.setenv("TRANSCRIBE_ENABLED", "true")
        assert _resolve_transcribe_enabled(False) is False

    async def test_empty_env_no_longer_disarms_the_fail_loud_stt_gate(self, monkeypatch):
        """An empty flag keeps transcription enabled and shared spawn validation fail-loud."""
        from datetime import datetime, timezone
        from meeting_api.bot_spawn import auto_join, service
        from meeting_api.bot_spawn.fakes import FakeRuntimeClient, InMemoryMeetingRepo

        monkeypatch.setenv("TRANSCRIBE_ENABLED", "")
        monkeypatch.delenv("TRANSCRIPTION_SERVICE_URL", raising=False)
        monkeypatch.delenv("TRANSCRIPTION_SERVICE_TOKEN", raising=False)
        now = datetime(2026, 10, 30, 12, 0, tzinfo=timezone.utc)
        repo, runtime = InMemoryMeetingRepo(), FakeRuntimeClient()
        repo._meetings[1] = {
            "id": 1, "user_id": 7, "platform": "google_meet",
            "native_meeting_id": "abc-defg-hij", "status": "scheduled",
            "data": {"scheduled_at": now.isoformat(), "auto_join": True},
        }

        async def context(_uid):
            return {"max_concurrent": 4}

        monkeypatch.setattr(service, "_fetch_bot_context", context)
        result = await auto_join.auto_join_tick(
            repo, runtime, now=now, fetch_bot_context=context,
            token_secret="s", redis_url="redis://r",
        )
        assert result["errors"] == 1 and not runtime.specs
        assert "no transcription backend configured" in repo._meetings[1]["data"]["auto_join_error"]
