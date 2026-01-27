import uvicorn
import os
from app.config import get_host_port

if __name__ == "__main__":
    host, port = get_host_port()
    reload = str(os.getenv('UVICORN_RELOAD', 'false')).strip().lower() in ('1', 'true', 'yes', 'y', 'on')
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)
