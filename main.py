import os
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

import models
from database import engine, get_db

if os.getenv("DATABASE_URL"):
    models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PPE Lifecycle Tracker API")

@app.get("/")
def read_root():
    return {"status": "PPE Lifecycle Tracker API is live!"}

@app.get("/db-check")
def test_db_connection(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"database": "Successfully connected to Neon PostgreSQL!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")
