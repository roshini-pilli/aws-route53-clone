
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class HostedZone(Base):
    __tablename__ = "hosted_zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    zone_id = Column(String, unique=True, nullable=False, index=True)
    type = Column(String, default="Public")
    comment = Column(String, nullable=True)

    records = relationship(
        "DNSRecord",
        back_populates="hosted_zone",
        cascade="all, delete-orphan"
    )


class DNSRecord(Base):
    __tablename__ = "dns_records"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    record_type = Column(String, nullable=False)
    value = Column(String, nullable=False)
    ttl = Column(Integer, default=300)
    hosted_zone_id = Column(
        Integer,
        ForeignKey("hosted_zones.id"),
        nullable=False
    )

    hosted_zone = relationship(
        "HostedZone",
        back_populates="records"
    )

