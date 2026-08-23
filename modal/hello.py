"""Smoke test that Modal auth + compute work end to end (`modal run modal/hello.py`)."""

import modal

app = modal.App("afr-hello")


@app.function()
def hi() -> str:
    import platform

    return f"modal ok on {platform.machine()}"


@app.local_entrypoint()
def main():
    print(hi.remote())
