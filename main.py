import os
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "App is running with FastAPI!"}

app = Flask(__name__)

# Fetch database URL from Render Environment Variables
DATABASE_URL = os.environ.get("DATABASE_URL")

@app.route("/")
def home():
    return "App is live on Render!"

if __name__ == "__main__":
    # Render assigns dynamic port numbers via $PORT
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
