from django.contrib import admin

from .models import DailyLog, Stop, Trip


class StopInline(admin.TabularInline):
    model = Stop
    extra = 0


class DailyLogInline(admin.TabularInline):
    model = DailyLog
    extra = 0
    fields = ("sheet_number", "day", "miles", "driving_hours", "on_duty_hours")


@admin.register(Trip)
class TripAdmin(admin.ModelAdmin):
    list_display = ("__str__", "start_at", "total_miles", "total_drive_hours", "created_at")
    inlines = (StopInline, DailyLogInline)
