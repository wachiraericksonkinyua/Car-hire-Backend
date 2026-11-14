"""APScheduler setup for in-process background jobs.

Jobs are safe to run concurrently: each one uses row locks with SKIP LOCKED
and only changes rows that still match the expected status.
"""

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.jobs.booking_jobs import expire_lapsed_holds, flag_overdue_bookings


def start_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        expire_lapsed_holds,
        trigger="interval",
        minutes=1,
        id="booking.expire-holds",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        flag_overdue_bookings,
        trigger="interval",
        minutes=5,
        id="booking.flag-overdue",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()
    return scheduler


def shutdown_scheduler(scheduler: AsyncIOScheduler) -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
