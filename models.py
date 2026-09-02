from sqlalchemy import Column, Integer, String, Date, Boolean
from database import Base

class PPEItem(Base):
    __tablename__ = "ppe_items"

    id = Column(Integer, primary_key=True, index=True)
    serial_number = Column(String, unique=True, index=True, nullable=False)
    item_type = Column(String, nullable=False)
    brand = Column(String)
    assigned_to = Column(String)
    issue_date = Column(Date)
    expiry_date = Column(Date)
    is_inspected = Column(Boolean, default=True)
    status = Column(String, default="Active")
