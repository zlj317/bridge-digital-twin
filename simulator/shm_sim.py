"""SHM-009：按物理规律生成 150 个测点数据，报文格式与真实传感器一致（source=SIM）。"""
from __future__ import annotations

import time
from typing import Any

from bridge_model import BridgeResponseModel


class ShmSimulator:
    def __init__(self, publisher: Any, bridge_code: str, model: BridgeResponseModel) -> None:
        self.pub = publisher
        self.bridge_code = bridge_code
        self.model = model

    def tick(self, elapsed: float, stat: dict[str, float | int]) -> int:
        values = self.model.step(elapsed, int(stat.get("vehicleCount", 72)),
                                 float(stat.get("avgSpeed", 58)))
        points = [{"pointCode": code, "value": value} for code, value in values.items()]
        payload = {
            "bridgeCode": self.bridge_code,
            "ts": int(time.time() * 1000),
            "source": "SIM",
            "points": points,
        }
        self.pub.publish(f"sensor/raw/bridge/{self.bridge_code}", payload, qos=1)
        return len(points)
