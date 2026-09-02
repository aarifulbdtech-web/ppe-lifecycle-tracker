import os
from fastapi import FastAPI

app = FastAPI(title="PPE Lifecycle Tracker")

@app.get("/")
def read_root():
    return {"status": "PPE Lifecycle Tracker API is live!"}
