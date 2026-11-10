
from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal

DNSRecordType = Literal[
    "A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"
]


class HostedZoneCreate(BaseModel):
    name: str
    type: str = "Public"
    comment: str = ""


class HostedZoneUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    comment: Optional[str] = None


class HostedZoneResponse(BaseModel):
    id: int
    name: str
    zone_id: str
    type: str
    comment: str
    record_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class DNSRecordCreate(BaseModel):
    name: str
    record_type: DNSRecordType
    value: str
    ttl: int = 300


class DNSRecordUpdate(BaseModel):
    name: Optional[str] = None
    record_type: Optional[DNSRecordType] = None
    value: Optional[str] = None
    ttl: Optional[int] = None


class DNSRecordResponse(BaseModel):
    id: int
    name: str
    record_type: str
    value: str
    ttl: int
    hosted_zone_id: int
    model_config = ConfigDict(from_attributes=True)
