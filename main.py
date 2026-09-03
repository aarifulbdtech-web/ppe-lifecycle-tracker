from typing import List, Optional
from fastapi import FastAPI, APIRouter, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Initialize FastAPI App
app = FastAPI(
    title="PPE Lifecycle Tracker",
    version="0.1.0",
    description="API for managing PPE items, inspection schedules, and lifecycle tracking."
)

# -------------------------------------------------------------------
# CORS Configuration (Allows frontend applications to connect)
# -------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update with your frontend domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# Data Models (Pydantic Schema)
# -------------------------------------------------------------------
class PPEItemBase(BaseModel):
    name: str
    category: str  # e.g., "Head Protection", "Eye Protection", "Fall Arrest"
    serial_number: str
    status: str = "Active"  # e.g., "Active", "Pending Inspection", "Retired"

class PPEItemCreate(PPEItemBase):
    pass

class PPEItem(PPEItemBase):
    id: int

    class Config:
        from_attributes = True


# -------------------------------------------------------------------
# Mock In-Memory Database (Replace with PostgreSQL/SQLAlchemy later)
# -------------------------------------------------------------------
db_items: List[dict] = [
    {
        "id": 1,
        "name": "Safety Helmet Type A",
        "category": "Head Protection",
        "serial_number": "SH-10023",
        "status": "Active",
    },
    {
        "id": 2,
        "name": "Full Body Safety Harness",
        "category": "Fall Arrest",
        "serial_number": "HA-90812",
        "status": "Pending Inspection",
    },
]

# -------------------------------------------------------------------
# API Router Creation
# -------------------------------------------------------------------
router = APIRouter(prefix="/api/v1", tags=["PPE Items"])


@router.get("/items", response_model=List[PPEItem], summary="Get all PPE items")
def get_all_items():
    """Fetch all registered PPE items."""
    return db_items


@router.get("/items/{item_id}", response_model=PPEItem, summary="Get PPE item by ID")
def get_item_by_id(item_id: int):
    """Fetch a single PPE item using its unique ID."""
    for item in db_items:
        if item["id"] == item_id:
            return item
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Item with ID {item_id} not found",
    )


@router.post(
    "/items",
    response_model=PPEItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new PPE item",
)
def create_item(item: PPEItemCreate):
    """Add a new PPE item to the tracker."""
    new_id = len(db_items) + 1 if db_items else 1
    new_item = {"id": new_id, **item.model_dump()}
    db_items.append(new_item)
    return new_item


@router.delete(
    "/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a PPE item",
)
def delete_item(item_id: int):
    """Delete an existing PPE item."""
    for index, item in enumerate(db_items):
        if item["id"] == item_id:
            db_items.pop(index)
            return
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Item with ID {item_id} not found",
    )


# -------------------------------------------------------------------
# Register Router & Root Endpoint
# -------------------------------------------------------------------
app.include_router(router)


@app.get("/", tags=["Health Check"])
def read_root():
    """Health check endpoint confirming API status."""
    return {"status": "PPE Lifecycle Tracker API is live!"}
