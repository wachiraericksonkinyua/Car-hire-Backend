"""Seed Supabase with the frontend demo fixtures.

Idempotent: existing users/vehicles/bookings/mechanics are skipped by their
unique keys. Run from backend:

    python -m scripts.seed_demo

All demo staff/driver accounts use the password from DEMO_PASSWORD
(default: AutoHireDemo123!).
"""

import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    AuditLog,
    Booking,
    BookingCounter,
    BookingStatus,
    DriverProfile,
    DriverStatus,
    Incident,
    IncidentStatus,
    Inspection,
    InspectionKind,
    Mechanic,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)

DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "AutoHireDemo123!")
NOW = datetime.now(timezone.utc)

USERS = [
    ("amina@autohire.ke", "Amina Njeri", "254712345601", UserRole.OWNER),
    ("brian@autohire.ke", "Brian Otieno", "254712345602", UserRole.MANAGER),
    ("wanjiku@autohire.ke", "Wanjiku Kamau", "254712345603", UserRole.AGENT),
    ("peter@autohire.ke", "Peter Mwangi", "254112345604", UserRole.DRIVER),
    ("david@autohire.ke", "David Kiptoo", "254112345605", UserRole.MECHANIC),
    ("grace.driver@autohire.ke", "Grace Wanjiru", "254712345620", UserRole.DRIVER),
    ("samuel.driver@autohire.ke", "Samuel Muriuki", "254712345621", UserRole.DRIVER),
    ("asha.driver@autohire.ke", "Asha Njeri", "254712345624", UserRole.DRIVER),
    ("david.driver@autohire.ke", "David Kiptoo", "254712345622", UserRole.DRIVER),
    ("peter.driver@autohire.ke", "Peter Kamau", "254712345623", UserRole.DRIVER),
]

DRIVER_PROFILES = [
    ("peter@autohire.ke", "B", "2027-11-14", "2027-11-14", DriverStatus.AVAILABLE, ["English", "Kiswahili"], 4.8),
    ("grace.driver@autohire.ke", "B", "2028-04-30", "2027-06-30", DriverStatus.AVAILABLE, ["English", "Kiswahili", "Kikuyu"], 4.9),
    ("samuel.driver@autohire.ke", "C1", "2028-02-28", "2027-08-31", DriverStatus.AVAILABLE, ["English", "Kiswahili"], 4.6),
    ("asha.driver@autohire.ke", "B", "2028-06-30", "2027-09-30", DriverStatus.AVAILABLE, ["English", "Kiswahili"], 4.7),
    ("david.driver@autohire.ke", "B", "2030-01-31", "2027-03-31", DriverStatus.OFF_DUTY, ["English", "Kalenjin"], 4.2),
    ("peter.driver@autohire.ke", "B", "2027-10-31", "2030-03-31", DriverStatus.OFF_DUTY, ["English", "Kiswahili"], 4.4),
]

VEHICLES = [
    ("KDA 101A", "Toyota", "Prado TX", 2023, "SUV", "Automatic", 7, 18000, "Available"),
    ("KDB 202B", "Toyota", "Axio", 2022, "Economy", "Automatic", 5, 6500, "Available"),
    ("KDC 303C", "Nissan", "X-Trail", 2023, "SUV", "Automatic", 7, 14000, "Available"),
    ("KDD 404D", "Toyota", "Noah", 2022, "Minivan", "Automatic", 8, 12000, "Available"),
    ("KDE 505E", "Mazda", "Demio", 2021, "Economy", "Automatic", 5, 5500, "Maintenance"),
    ("KDF 606F", "Toyota", "RAV4", 2023, "SUV", "Automatic", 5, 11000, "Available"),
    ("KDG 707G", "Subaru", "Forester", 2022, "SUV", "Automatic", 5, 12500, "Available"),
    ("KDH 808H", "Toyota", "Hiace", 2021, "Minivan", "Manual", 14, 16000, "Available"),
    ("KDJ 909J", "Toyota", "Land Cruiser V8", 2022, "Luxury", "Automatic", 7, 28000, "Available"),
    ("KDK 010K", "Honda", "Fit", 2020, "Economy", "Automatic", 5, 4800, "Maintenance"),
    ("KDL 111L", "Mazda", "CX-5", 2023, "SUV", "Automatic", 5, 13000, "Available"),
    ("KDM 212M", "Toyota", "Fielder", 2021, "Economy", "Automatic", 5, 7000, "Available"),
]

BOOKINGS = [
    ("BK-2611-0001", "KDA 101A", "Faith Wambui", "254712345701", BookingStatus.CONFIRMED, True, "Cash", -1, 2),
    ("BK-2611-0002", "KDB 202B", "Samuel Kipchoge", "254712345702", BookingStatus.CHECKED_OUT, False, "Cash", -1, 1),
    ("BK-2611-0003", "KDC 303C", "Grace Atieno", "254712345703", BookingStatus.RESERVED, True, None, 2, 4),
    ("BK-2611-0004", "KDD 404D", "Joseph Kamau", "254712345704", BookingStatus.CONFIRMED, True, "Bank EFT", 1, 3),
    ("BK-2611-0006", "KDF 606F", "Lilian Muthoni", "254712345706", BookingStatus.RESERVED, False, None, 3, 5),
    ("BK-2611-0007", "KDG 707G", "Faith Wambui", "254712345707", BookingStatus.COMPLETED, False, "Cash", -10, -7),
    ("BK-2611-0008", "KDH 808H", "Samuel Kipchoge", "254712345708", BookingStatus.CANCELLED, False, None, -3, -1),
    ("BK-2611-0009", "KDJ 909J", "Grace Atieno", "254712345709", BookingStatus.CONFIRMED, True, "Corporate Credit", 2, 4),
    ("BK-2611-0011", "KDL 111L", "Lilian Muthoni", "254712345711", BookingStatus.EXPIRED, False, None, -2, -1),
    ("BK-2611-0012", "KDM 212M", "Joseph Kamau", "254712345712", BookingStatus.OVERDUE, False, "M-Pesa Manual", -4, -1),
]

MECHANICS = [
    ("Central Rescue Team", "254700111001", "Nairobi", "CBD", "InHouse", ["battery", "overheating", "flat_tyre"], 0, 36.8219, -1.2921),
    ("Kilimani Auto Care", "254700111002", "Nairobi", "Kilimani", "PartnerGarage", ["battery", "strange_noise"], 2500, 36.787, -1.2928),
    ("Westlands Motor Clinic", "254700111003", "Nairobi", "Westlands", "PartnerGarage", ["overheating", "accident"], 3500, 36.804, -1.263),
    ("Rapid Tow Nairobi", "254700111004", "Nairobi", "Industrial Area", "Towing", ["accident", "flat_tyre"], 5000, 36.85, -1.314),
    ("Ngara Roadside Assist", "254700111005", "Nairobi", "Ngara", "PartnerGarage", ["flat_tyre", "battery"], 1800, 36.833, -1.276),
    ("Mombasa Auto Rescue", "254700111006", "Mombasa", "Mombasa Island", "PartnerGarage", ["overheating", "strange_noise"], 4000, 39.6682, -4.0435),
]

INCIDENTS = [
    ("KDC 303C", "Flat Tyre", "Vehicle breakdown reported", 36.8172, -1.2864, IncidentStatus.OPEN, True),
    ("KDD 404D", "Battery", "Battery replacement dispatched", 36.787, -1.2928, IncidentStatus.DISPATCHED, False),
    ("KDL 111L", "Overheating", "Cooling system checked", 36.804, -1.263, IncidentStatus.RESOLVED, False),
]


def _parse_date(value: str):
    return datetime.strptime(value, "%Y-%m-%d").date()


async def seed() -> None:
    async with SessionLocal() as db:
        # Users
        users_by_email: dict[str, User] = {}
        for email, name, phone, role in USERS:
            user = await db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(
                    email=email,
                    full_name=name,
                    phone=phone,
                    password_hash=hash_password(DEMO_PASSWORD),
                    role=role,
                    is_active=True,
                )
                db.add(user)
                await db.flush()
            users_by_email[email] = user
        print(f"users: {len(users_by_email)}")

        # Vehicles
        vehicles_by_plate: dict[str, Vehicle] = {}
        for plate, brand, model, year, category, transmission, seats, rate, status in VEHICLES:
            vehicle = await db.scalar(
                select(Vehicle).where(Vehicle.plate_number == plate)
            )
            if vehicle is None:
                vehicle = Vehicle(
                    plate_number=plate,
                    brand=brand,
                    model=model,
                    year=year,
                    daily_rate_kes=rate,
                    deposit_kes=15000,
                    status=VehicleStatus(status),
                    category=category,
                    transmission=transmission,
                    fuel="Petrol",
                    seats=seats,
                    bags=3 if seats >= 7 else 2,
                    mileage_cap_km=300,
                    insurance_expiry=datetime(2030, 1, 1).date(),
                    specs={"drive": "4WD" if category in ("SUV", "Luxury") else "2WD"},
                )
                db.add(vehicle)
                await db.flush()
            vehicles_by_plate[plate] = vehicle
        print(f"vehicles: {len(vehicles_by_plate)}")

        # Driver profiles
        for email, licence, licence_exp, psv_exp, status, languages, rating in DRIVER_PROFILES:
            user = users_by_email[email]
            profile = await db.scalar(
                select(DriverProfile).where(DriverProfile.user_id == user.id)
            )
            if profile is None:
                db.add(
                    DriverProfile(
                        user_id=user.id,
                        licence_class=licence,
                        licence_expiry=_parse_date(licence_exp),
                        psv_expiry=_parse_date(psv_exp),
                        status=status,
                        languages=languages,
                        rating=rating,
                    )
                )
        await db.flush()

        # Mechanics
        mechanics_by_name: dict[str, Mechanic] = {}
        for name, phone, county, town, mtype, specialties, rate, lng, lat in MECHANICS:
            mechanic = await db.scalar(
                select(Mechanic).where(Mechanic.phone == phone)
            )
            if mechanic is None:
                mechanic = Mechanic(
                    name=name,
                    phone=phone,
                    whatsapp=phone,
                    county=county,
                    town=town,
                    mechanic_type=mtype,
                    specialties=specialties,
                    call_out_rate_kes=rate,
                    latitude=lat,
                    longitude=lng,
                    is_available=True,
                )
                db.add(mechanic)
                await db.flush()
            mechanics_by_name[name] = mechanic
        print(f"mechanics: {len(mechanics_by_name)}")

        # Bookings
        staff_creator = users_by_email["wanjiku@autohire.ke"]
        created_bookings: list[Booking] = []
        for reference, plate, customer, phone, status, chauffeur, payment, start_offset, end_offset in BOOKINGS:
            existing = await db.scalar(
                select(Booking).where(Booking.reference == reference)
            )
            if existing is not None:
                created_bookings.append(existing)
                continue
            vehicle = vehicles_by_plate[plate]
            pickup = NOW + timedelta(days=start_offset)
            return_at = NOW + timedelta(days=end_offset)
            days = max(1, (return_at - pickup).days)
            base = days * vehicle.daily_rate_kes
            chauffeur_fee = days * 2500 if chauffeur else 0
            taxable = base + chauffeur_fee
            vat = (taxable * 16 + 50) // 100
            deposit = 10000 if chauffeur else 15000
            snapshot = {
                "daily_rate_kes": vehicle.daily_rate_kes,
                "days": days,
                "base_rental_kes": base,
                "chauffeur_fee_kes": chauffeur_fee,
                "deposit_kes": deposit,
                "vat_kes": vat,
                "total_kes": taxable + vat + deposit,
            }
            booking = Booking(
                reference=reference,
                vehicle_id=vehicle.id,
                created_by_id=staff_creator.id,
                customer_name=customer,
                customer_phone=phone,
                customer_email=f"{customer.lower().replace(' ', '.')}@example.ke",
                customer_id_type="national_id",
                customer_id_number=f"ID{reference[-4:]}",
                pickup_location="Nairobi",
                pickup_at=pickup,
                return_at=return_at,
                block_until=return_at + timedelta(minutes=60),
                total_kes=taxable + vat + deposit,
                pricing_snapshot=snapshot,
                status=status,
                hold_expires_at=(
                    NOW + timedelta(minutes=30)
                    if status == BookingStatus.RESERVED
                    else NOW - timedelta(minutes=5)
                ),
                with_chauffeur=chauffeur,
                payment_method=payment,
            )
            db.add(booking)
            await db.flush()
            created_bookings.append(booking)

            # Give active handovers a check-out inspection so the admin
            # handover screen has a comparison record.
            if status in (BookingStatus.CHECKED_OUT, BookingStatus.OVERDUE):
                existing_inspection = await db.scalar(
                    select(Inspection.id).where(
                        Inspection.booking_id == booking.id,
                        Inspection.kind == InspectionKind.CHECK_OUT,
                    )
                )
                if existing_inspection is None:
                    db.add(
                        Inspection(
                            booking_id=booking.id,
                            kind=InspectionKind.CHECK_OUT,
                            fuel_percent=100,
                            odometer_km=10000,
                            photos=[],
                            notes="Demo check-out inspection",
                            signature="seeded",
                            confirmation=True,
                            critical_defect=False,
                            created_by_id=staff_creator.id,
                        )
                    )

        print(f"bookings: {len(created_bookings)}")

        # Incidents
        incidents_created = 0
        for plate, category, description, lng, lat, status, workshop in INCIDENTS:
            existing = await db.scalar(
                select(Incident).where(
                    Incident.vehicle_id == vehicles_by_plate[plate].id,
                    Incident.description == description,
                )
            )
            if existing is None:
                db.add(
                    Incident(
                        vehicle_id=vehicles_by_plate[plate].id,
                        category=category,
                        description=description,
                        latitude=lat,
                        longitude=lng,
                        status=status,
                        requires_workshop=workshop,
                        mechanic_id=mechanics_by_name["Kilimani Auto Care"].id
                        if status == IncidentStatus.DISPATCHED
                        else None,
                        dispatch_type="PartnerMechanic"
                        if status == IncidentStatus.DISPATCHED
                        else None,
                        resolved_at=NOW - timedelta(days=1)
                        if status == IncidentStatus.RESOLVED
                        else None,
                    )
                )
                incidents_created += 1
        print(f"incidents: {incidents_created}")

        # A couple of small audit entries for the viewer.
        if not await db.scalar(select(AuditLog.id).limit(1)):
            db.add_all(
                [
                    AuditLog(
                        actor_id=users_by_email["amina@autohire.ke"].id,
                        action="demo.seed",
                        entity="system",
                        entity_id="demo",
                        after={"bookings": len(created_bookings)},
                    ),
                    AuditLog(
                        actor_id=users_by_email["brian@autohire.ke"].id,
                        action="vehicle.update",
                        entity="vehicle",
                        entity_id=str(vehicles_by_plate["KDA 101A"].id),
                        before={"daily_rate_kes": 17000},
                        after={"daily_rate_kes": 18000},
                    ),
                ]
            )

        # Keep generated references ahead of the seeded BK-2611-#### ones.
        counter = await db.get(BookingCounter, "2611")
        if counter is None:
            db.add(BookingCounter(period="2611", last_value=99))
        elif counter.last_value < 99:
            counter.last_value = 99

        await db.commit()
        print("Demo seed complete.")
        print(f"Login password for all demo users: {DEMO_PASSWORD}")
        print("Owner: amina@autohire.ke")


if __name__ == "__main__":
    asyncio.run(seed())
