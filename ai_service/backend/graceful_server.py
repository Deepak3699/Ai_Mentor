import api
from uvicorn import Config
from uvicorn.server import Server


class GracefulServer(Server):
    async def shutdown(self, sockets=None):
        api.shutting_down = True
        await super().shutdown(sockets=sockets)


if __name__ == "__main__":
    config = Config(
        "api:app",
        host="127.0.0.1",
        port=8000,
        timeout_graceful_shutdown=30,
    )
    GracefulServer(config).run()
