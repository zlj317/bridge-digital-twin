"""简化力学响应模型（文档 1.4：不做 FEM，用简化公式映射）。
索力随温度与车流变化、应变随荷载波动、挠度与车流正相关，曲线自然无锯齿噪声。"""
from __future__ import annotations

import math

CABLE_BASE = [1.290, 1.286, 1.302, 1.278, 1.294, 1.288]
LANES = ["LN-UP-1", "LN-UP-2", "LN-UP-3", "LN-DN-1", "LN-DN-2", "LN-DN-3"]


def pad(n: int) -> str:
    return f"{n:02d}"


class BridgeResponseModel:
    def __init__(self) -> None:
        self.density = 62.0
        self.inject_overlimit = 0

    def set_density(self, pct: float) -> None:
        self.density = max(0.0, min(100.0, pct))

    def trigger_overlimit(self) -> None:
        """连续 3 次超限，用于验证后端 3 次防抖告警"""
        self.inject_overlimit = 3

    def step(self, t: float, vehicle_count: int, avg_speed: float) -> dict[str, float]:
        """返回 150 个测点的当前值（pointCode -> value）"""
        temperature = 21.4 + 3.2 * math.sin(2 * math.pi * t / 86400) + 0.8 * math.sin(2 * math.pi * t / 300)
        wind = 3.2 + 1.1 * math.sin(2 * math.pi * t / 38) + 0.25 * math.sin(2 * math.pi * t / 7)
        load = (self.density / 62.0) * (vehicle_count / 36.0)
        temp_dev = temperature - 21.4
        truck_ratio = 0.15

        values: dict[str, float] = {}
        # ① 72 个索力点（MN）：温度膨胀 + 车流荷载
        for i in range(1, 73):
            base = CABLE_BASE[i - 1] if i <= 6 else 1.290 + ((i % 7) - 3) * 0.002
            cable = base + 0.0016 * temp_dev + 0.0042 * (load - 1) * (0.6 + (i % 18) / 30)
            cable += 0.0007 * math.sin(2 * math.pi * t / 60 + i * 0.31)
            values[f"PTS-C-{pad(i)}"] = round(cable, 4)
        # ② 42 个主梁应变点（MPa）：货车过境短时抬升
        for i in range(1, 43):
            bump = 2.4 * truck_ratio * 10 * math.exp(-((i - (t * 2 % 42)) ** 2) / 8)
            stress = 42 + 3.2 * math.sin(2 * math.pi * t / 40 + i * 0.17) + 2.8 * (load - 1) + bump
            values[f"PTS-STR-{pad(i)}"] = round(stress, 2)
        if self.inject_overlimit > 0:
            values["PTS-STR-03"] = 58.6
            self.inject_overlimit -= 1
        # ③ 环境 / 变形 / 支座 / 裂缝
        for i in range(1, 9):
            values[f"PTS-DEF-{pad(i)}"] = round(0.86 + 0.04 * (load - 1) + 0.012 * math.sin(t / 9 + i), 4)
        for i in range(1, 7):
            values[f"PTS-TMP-{pad(i)}"] = round(temperature + 0.3 * math.sin(i), 2)
        for i in range(1, 5):
            values[f"PTS-WND-{pad(i)}"] = round(max(0.0, wind + 0.2 * math.sin(i)), 2)
        for i in range(1, 5):
            values[f"PTS-FRQ-{pad(i)}"] = round(0.48 + 0.02 * math.sin(2 * math.pi * t / 26 + i), 4)
            values[f"PTS-DMP-{pad(i)}"] = round(2.1 + 0.12 * math.sin(2 * math.pi * t / 70 + i * 1.4), 3)
            values[f"PTS-CRK-{pad(i)}"] = round(0.08 + 0.015 * math.sin(2 * math.pi * t / 120 + i), 4)
        for i in range(1, 7):
            bearing = 12 + 2.4 * math.sin(2 * math.pi * t / 90 + i) + (avg_speed - 58) * 0.02
            values[f"PTS-BRG-{pad(i)}"] = round(bearing, 3)
        return values
