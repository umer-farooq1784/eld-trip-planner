"""Settings for the test suite.

Two guarantees this file exists to provide:

1. Tests never touch the configured database. Without this, a developer with
   DATABASE_URL pointing at Neon has pytest create and drop a test database
   over the network -- slow, and one bad override away from operating on
   production data.
2. Tests never reach the network. Clearing the API key means any code path
   that forgot to inject a stub provider fails loudly rather than quietly
   calling a live service.
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
