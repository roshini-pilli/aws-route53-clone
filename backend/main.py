
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from uuid import uuid4
import ipaddress

from database import engine, Base, get_db
import models
import schemas
from bind_utils import generate_bind_file, parse_bind_file

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Route53 Clone API",
    description="Backend API for AWS Route53 Clone",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Route53 Clone API is running!"}


@app.get("/health")
def health():
    return {"status": "healthy"}


def find_zone(zone_id: str, db: Session):
    zone = db.query(models.HostedZone).filter(
        models.HostedZone.zone_id == zone_id
    ).first()

    if not zone:
        raise HTTPException(
            status_code=404,
            detail="Hosted zone not found"
        )

    return zone


def zone_response(zone):
    return {
        "id": zone.id,
        "name": zone.name,
        "zone_id": zone.zone_id,
        "type": zone.type,
        "comment": zone.comment,
        "record_count": len(zone.records)
    }


def validate_dns_record(record_type: str, value: str):
    record_type = record_type.upper()
    value = value.strip()

    if record_type == "A":
        try:
            if ipaddress.ip_address(value).version != 4:
                raise ValueError()
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="A record requires a valid IPv4 address"
            )

    elif record_type == "AAAA":
        try:
            if ipaddress.ip_address(value).version != 6:
                raise ValueError()
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="AAAA record requires a valid IPv6 address"
            )

    elif record_type == "CNAME":
        if " " in value or not value:
            raise HTTPException(
                status_code=400,
                detail="Invalid CNAME value"
            )

    elif record_type == "MX":
        parts = value.split()
        if len(parts) != 2 or not parts[0].isdigit() or not parts[1]:
            raise HTTPException(
                status_code=400,
                detail="MX value must contain priority and mail server"
            )

    elif record_type == "SRV":
        parts = value.split()
        if len(parts) != 4 or not all(
            part.isdigit() for part in parts[:3]
        ):
            raise HTTPException(
                status_code=400,
                detail="SRV value must contain priority, weight, port and target"
            )

    elif record_type == "CAA":
        parts = value.split(maxsplit=2)
        if len(parts) != 3 or not parts[0].isdigit():
            raise HTTPException(
                status_code=400,
                detail="CAA value must contain flags, tag and value"
            )

    elif record_type in ["TXT", "NS", "PTR"]:
        if not value:
            raise HTTPException(
                status_code=400,
                detail="Record value cannot be empty"
            )


@app.post(
    "/hosted-zones",
    response_model=schemas.HostedZoneResponse
)
def create_hosted_zone(
    zone: schemas.HostedZoneCreate,
    db: Session = Depends(get_db)
):
    if not zone.name.strip():
        raise HTTPException(
            status_code=400,
            detail="Zone name cannot be empty"
        )

    new_zone = models.HostedZone(
        name=zone.name.strip(),
        zone_id="Z" + uuid4().hex[:13].upper(),
        type=zone.type,
        comment=zone.comment
    )

    db.add(new_zone)
    db.commit()
    db.refresh(new_zone)

    return zone_response(new_zone)


@app.get(
    "/hosted-zones",
    response_model=list[schemas.HostedZoneResponse]
)
def get_hosted_zones(db: Session = Depends(get_db)):
    zones = db.query(models.HostedZone).order_by(
        models.HostedZone.id.desc()
    ).all()

    return [zone_response(zone) for zone in zones]


@app.get(
    "/hosted-zones/{zone_id}",
    response_model=schemas.HostedZoneResponse
)
def get_hosted_zone(
    zone_id: str,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)
    return zone_response(zone)


@app.patch(
    "/hosted-zones/{zone_id}",
    response_model=schemas.HostedZoneResponse
)
def update_hosted_zone(
    zone_id: str,
    updated_data: schemas.HostedZoneUpdate,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)
    changes = updated_data.model_dump(exclude_unset=True)

    if "name" in changes:
        if not changes["name"] or not changes["name"].strip():
            raise HTTPException(
                status_code=400,
                detail="Zone name cannot be empty"
            )
        changes["name"] = changes["name"].strip()

    for key, value in changes.items():
        setattr(zone, key, value)

    db.commit()
    db.refresh(zone)

    return zone_response(zone)


@app.delete("/hosted-zones/{zone_id}")
def delete_hosted_zone(
    zone_id: str,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)
    db.delete(zone)
    db.commit()

    return {"message": "Hosted zone deleted successfully"}


@app.post(
    "/hosted-zones/{zone_id}/records",
    response_model=schemas.DNSRecordResponse
)
def create_dns_record(
    zone_id: str,
    record: schemas.DNSRecordCreate,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)

    if not record.name.strip():
        raise HTTPException(
            status_code=400,
            detail="Record name cannot be empty"
        )

    if not record.value.strip():
        raise HTTPException(
            status_code=400,
            detail="Record value cannot be empty"
        )

    validate_dns_record(record.record_type, record.value)

    if record.ttl <= 0:
        raise HTTPException(
            status_code=400,
            detail="TTL must be greater than zero"
        )

    new_record = models.DNSRecord(
        name=record.name.strip(),
        record_type=record.record_type,
        value=record.value.strip(),
        ttl=record.ttl,
        hosted_zone_id=zone.id
    )

    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    return new_record


@app.get(
    "/hosted-zones/{zone_id}/records",
    response_model=dict
)
def get_dns_records(
    zone_id: str,
    search: str = "",
    record_type: str = "",
    page: int = 1,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)

    if page < 1:
        raise HTTPException(
            status_code=400,
            detail="Page must be greater than zero"
        )

    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100"
        )

    query = db.query(models.DNSRecord).filter(
        models.DNSRecord.hosted_zone_id == zone.id
    )

    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (models.DNSRecord.name.ilike(term)) |
            (models.DNSRecord.value.ilike(term))
        )

    if record_type.strip():
        query = query.filter(
            models.DNSRecord.record_type == record_type.upper()
        )

    total = query.count()

    records = query.order_by(
        models.DNSRecord.id.desc()
    ).offset(
        (page - 1) * limit
    ).limit(limit).all()

    return {
        "records": records,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }


@app.get(
    "/hosted-zones/{zone_id}/records/{record_id}",
    response_model=schemas.DNSRecordResponse
)
def get_dns_record(
    zone_id: str,
    record_id: int,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)

    record = db.query(models.DNSRecord).filter(
        models.DNSRecord.id == record_id,
        models.DNSRecord.hosted_zone_id == zone.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="DNS record not found"
        )

    return record


@app.patch(
    "/hosted-zones/{zone_id}/records/{record_id}",
    response_model=schemas.DNSRecordResponse
)
def update_dns_record(
    zone_id: str,
    record_id: int,
    updated_data: schemas.DNSRecordUpdate,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)

    record = db.query(models.DNSRecord).filter(
        models.DNSRecord.id == record_id,
        models.DNSRecord.hosted_zone_id == zone.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="DNS record not found"
        )

    changes = updated_data.model_dump(exclude_unset=True)

    if "name" in changes:
        if not changes["name"] or not changes["name"].strip():
            raise HTTPException(
                status_code=400,
                detail="Record name cannot be empty"
            )
        changes["name"] = changes["name"].strip()

    if "value" in changes:
        if not changes["value"] or not changes["value"].strip():
            raise HTTPException(
                status_code=400,
                detail="Record value cannot be empty"
            )
        changes["value"] = changes["value"].strip()

    if "record_type" in changes:
        validate_dns_record(
            changes["record_type"],
            changes.get("value", record.value)
        )
    elif "value" in changes:
        validate_dns_record(
            record.record_type,
            changes["value"]
        )

    if "ttl" in changes and changes["ttl"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="TTL must be greater than zero"
        )

    for key, value in changes.items():
        setattr(record, key, value)

    db.commit()
    db.refresh(record)

    return record


@app.delete("/hosted-zones/{zone_id}/records/{record_id}")
def delete_dns_record(
    zone_id: str,
    record_id: int,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)

    record = db.query(models.DNSRecord).filter(
        models.DNSRecord.id == record_id,
        models.DNSRecord.hosted_zone_id == zone.id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="DNS record not found"
        )

    db.delete(record)
    db.commit()

    return {"message": "DNS record deleted successfully"}


@app.get(
    "/hosted-zones/{zone_id}/export",
    response_class=PlainTextResponse
)
def export_hosted_zone(
    zone_id: str,
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)
    bind_content = generate_bind_file(zone)
    filename = zone.name.rstrip(".").replace("/", "_").replace("\\", "_")

    return PlainTextResponse(
        content=bind_content,
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}.zone"'
        }
    )


@app.post("/hosted-zones/{zone_id}/import")
async def import_hosted_zone(
    zone_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    zone = find_zone(zone_id, db)

    filename = (file.filename or "").lower()

    if not filename.endswith((".zone", ".txt")):
        raise HTTPException(
            status_code=400,
            detail="Upload a .zone or .txt BIND file"
        )

    file_content = await file.read()

    if not file_content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty"
        )

    if len(file_content) > 2 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File size cannot exceed 2 MB"
        )

    try:
        content = file_content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="The file must use UTF-8 encoding"
        )

    try:
        parsed = parse_bind_file(content, zone.name)
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    imported = 0
    skipped = parsed["skipped"]
    errors = []

    for item in parsed["records"]:
        if item["ttl"] <= 0:
            skipped += 1
            continue

        if not item["name"].strip() or not item["value"].strip():
            skipped += 1
            continue

        try:
            validate_dns_record(
                item["record_type"],
                item["value"]
            )
        except HTTPException as error:
            skipped += 1
            errors.append({
                "record": item["name"],
                "type": item["record_type"],
                "reason": error.detail
            })
            continue

        new_record = models.DNSRecord(
            name=item["name"],
            record_type=item["record_type"],
            value=item["value"],
            ttl=item["ttl"],
            hosted_zone_id=zone.id
        )

        db.add(new_record)
        imported += 1

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to save imported DNS records"
        )

    return {
        "message": "BIND file import completed",
        "hosted_zone": zone.name,
        "imported": imported,
        "skipped": skipped,
        "errors": errors
    }
