"""Settings for the test suite.

Pins the database to in-memory SQLite so tests never reach the configured
one, and clears the API key so any un-stubbed provider fails loudly.
"""

from .settings import *  # noqa: F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

ORS_API_KEY = ""
PLANNING_SPEED_MPH = 55.0

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
