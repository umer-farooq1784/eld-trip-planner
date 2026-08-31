from django.urls import path

from . import views

urlpatterns = [
    path("healthz/", views.healthz, name="healthz"),
    path("geocode/", views.geocode, name="geocode"),
    path("trips/", views.trips, name="trips"),
    path("trips/<uuid:trip_id>/", views.trip_detail, name="trip-detail"),
]
