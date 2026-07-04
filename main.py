import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# In-memory state for the 3rd bulb
bulb_3_state = {"is_on": False}


class BulbState(BaseModel):
    is_on: bool


@app.get("/api/bulb/3")
def get_bulb_status():
    """ESP32 will poll this endpoint to check if the bulb should be on or off."""
    return bulb_3_state


@app.post("/api/bulb/3")
def toggle_bulb_status(state: BulbState):
    """You can hit this endpoint via Postman/cURL to toggle the bulb."""
    bulb_3_state["is_on"] = state.is_on
    return {"message": "Bulb state updated", "current_state": bulb_3_state}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
