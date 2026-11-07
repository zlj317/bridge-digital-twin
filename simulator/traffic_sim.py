"""TRA-001/006：SimPy 车道泊松到达，车型 85% 小车 / 15% 货车，车速 40~80km/h。
每秒只推稀疏状态（归一化位置 t + 速度），前端按 getPointAt 补帧，带宽降低 90%。"""
from __future__ import annotations

import random
import time
from typing import Any

from bridge_model import LANES, BridgeResponseModel

try:
    import simpy
    HAS_SIMPY = True
except ImportError:  # pragma: no cover
    simpy = None
    HAS_SIMPY = False


class TrafficSimulator:
    def __init__(self, publisher: Any, bridge_code: str, density: float = 62.0,
                 vehicle_max: int = 72) -> None:
        self.pub = publisher
        self.bridge_code = bridge_code
        self.density = density
        self.vehicle_max = vehicle_max
        self.vehicles: dict[str, dict] = {}
        self.seq = 0
        self.env = simpy.Environment() if HAS_SIMPY else None
        if self.env is not None:
            for lane in LANES:
                self.env.process(self._lane_arrivals(lane))
        self._seed_vehicles()

    def _lane_arrivals(self, lane: str):
        while True:
            # 12 条车道，单车道到达率减半，总到达量与 6 车道时一致
            rate = max(0.05, (self.density / 62.0) * 0.275)
            yield self.env.timeout(random.expovariate(rate))
            self._spawn(lane)

    def _spawn(self, lane: str | None = None) -> None:
        lane = lane or random.choice(LANES)
        is_truck = random.random() < 0.15
        vid = f"V-{self.seq:04d}"
        self.seq += 1
        self.vehicles[vid] = {
            "vid": vid,
            "lane": lane,
            "t": random.random() * 0.08,
            "speed": max(40.0, min(80.0, random.gauss(58, 9))),
            "type": "TRUCK" if is_truck else "CAR",
        }

    def _seed_vehicles(self) -> None:
        for i in range(72):
            self._spawn(LANES[i % len(LANES)])
            v = list(self.vehicles.values())[-1]
            v["t"] = (i * 0.137) % 1

    def set_density(self, pct: float) -> None:
        self.density = max(0.0, min(100.0, pct))

    def tick(self) -> dict[str, float | int]:
        """推进 1 秒并返回车流统计"""
        if self.env is not None:
            self.env.run(until=self.env.now + 1)
        else:
            if random.random() < self.density / 100.0:
                self._spawn()

        removed: list[str] = []
        for vid, v in list(self.vehicles.items()):
            v["t"] += (v["speed"] / 3.6) / 840.0
            if v["t"] > 1:
                removed.append(vid)
                self.vehicles.pop(vid, None)
        target = max(0, round((self.density / 62.0) * 72))
        while len(self.vehicles) < target:
            self._spawn()
        while len(self.vehicles) > min(self.vehicle_max * 2, target + 4):
            self.vehicles.pop(next(iter(self.vehicles)))

        speeds = [v["speed"] for v in self.vehicles.values()] or [58.0]
        occupancy = min(0.98, self.density / 100.0 * 0.95)
        stat = {
            "vehicleCount": len(self.vehicles),
            "avgSpeed": round(sum(speeds) / len(speeds), 1),
            "occupancy": round(occupancy, 2),
            "eventCount": 1,
        }
        payload = {
            "bridgeCode": self.bridge_code,
            "ts": int(time.time() * 1000),
            "stat": stat,
            "vehicles": list(self.vehicles.values()),
            "removed": removed,
        }
        self.pub.publish(f"traffic/vehicle/{self.bridge_code}", payload, qos=0)
        return stat
