"""Programa dayalı durum hesabı. Günler: Pazartesi=0, Pazar=6."""
import json
from datetime import datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

CONFIG_PATH = Path(__file__).resolve().with_name("availability_config.json")


def load_config():
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def in_date_range(day, start, end):
    return start <= day <= end


def time_on(day, clock, timezone):
    return datetime.combine(day, time.fromisoformat(clock), tzinfo=timezone)


def holiday_start(config, day):
    starts = [holiday["start"] for holiday in config["public_holidays"] if holiday["date"] == day]
    return min(starts) if starts else None


def person_status(config, key, now):
    person = config["people"][key]
    day = now.date().isoformat()
    timezone = now.tzinfo
    tomorrow = time_on(now.date() + timedelta(days=1), "00:00", timezone)
    boundaries = [tomorrow]
    cutoff = holiday_start(config, day)
    if cutoff:
        holiday_time = time_on(now.date(), cutoff, timezone)
        if now >= holiday_time:
            return {"id": key, "state": "active", "label": person["active_label"]}, tomorrow
        boundaries.append(holiday_time)

    def result(state, reason=None):
        label = person["busy_label"] if state == "busy" else person["active_label"]
        if state == "unknown":
            label = person["name"] + " · durum bilinmiyor"
        item = {"id": key, "state": state, "label": label}
        if reason:
            item["reason"] = reason
        return item, min(boundary for boundary in boundaries if boundary > now)

    if now.weekday() >= 5:
        return result("active")
    if now.year not in config["holiday_years"]:
        return result("unknown", "Resmî tatil takvimi güncellenmeli.")
    if person["kind"] == "teacher":
        school = config["school"]
        if not in_date_range(day, school["schedule_valid_from"], school["schedule_valid_until"]):
            return result("unknown", "Yeni eğitim yılı ders programı eklenmeli.")

    # İstisnalar yalnızca bu kişiye uygulanır. Resmî tatil yine önceliklidir.
    override = person.get("date_overrides", {}).get(day)
    if override is not None:
        periods = override.get("periods", [])
    elif person["kind"] == "teacher":
        school = config["school"]
        if not any(in_date_range(day, term["start"], term["end"]) for term in school["terms"]):
            return result("active")
        if any(in_date_range(day, holiday["start"], holiday["end"]) for holiday in school["breaks"]):
            return result("active")
        weekly_lessons = person["weekly_lessons"]
        for previous in person.get("weekly_lessons_history", []):
            if in_date_range(day, previous["start"], previous["end"]):
                weekly_lessons = previous["weekly_lessons"]
                break
        lessons = weekly_lessons.get(str(now.weekday()), [])
        periods = [period for period in school["lesson_periods"] if period["number"] in lessons]
    else:
        periods = person["work_periods"] if now.weekday() in person["weekdays"] else []

    busy = False
    for period in periods:
        start = time_on(now.date(), period["start"], timezone)
        end = time_on(now.date(), period["end"], timezone)
        if cutoff:
            end = min(end, time_on(now.date(), cutoff, timezone))
        if start >= end:
            continue
        boundaries.extend(boundary for boundary in (start, end) if boundary > now)
        busy = busy or start <= now < end
    return result("busy" if busy else "active")


def get_availability(now=None, config=None):
    config = config if config is not None else load_config()
    timezone = ZoneInfo(config["timezone"])
    now = now if now is not None else datetime.now(timezone)
    if now.tzinfo is None:
        raise ValueError("Durum hesabı saat dilimi içeren tarih gerektirir.")
    now = now.astimezone(timezone)
    statuses = [person_status(config, key, now) for key in ("seyda", "ridvan")]
    return {"server_time": now.isoformat(), "valid_until": min(boundary for _, boundary in statuses).isoformat(),
            "people": [person for person, _ in statuses], "basis": "schedule"}
