from uvicorn import Config
from uvicorn.server import Server

import backend.services.job_tracker as job_tracker


class GracefulServer(Server):
    async def shutdown(self, sockets=None):
        job_tracker.shutting_down = True
        await super().shutdown(sockets=sockets)


if __name__ == "__main__":
    config = Config(
        "backend.main:app",
        host="127.0.0.1",
        port=8000,
        timeout_graceful_shutdown=30,
    )
    GracefulServer(config).run()
