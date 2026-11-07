"""仿真统一入口：车流 + SHM 联合仿真。
用法：python main.py [--dry-run] [--density 62] [--duration 600]
无 EMQX / 未装依赖时用 --dry-run 打印报文，便于本机验证数据格式。"""
from __future__ import annotations

import argparse
import os
import time

from bridge_model import BridgeResponseModel
from mqtt_client import MqttPublisher
from shm_sim import ShmSimulator
from traffic_sim import TrafficSimulator

BRIDGE_CODE = os.getenv("BRIDGE_CODE", "BR-DEMO-01")


def on_command(_topic: str, payload: dict, model: BridgeResponseModel,
               traffic: TrafficSimulator) -> None:
    action = str(payload.get("action", "")).upper()
    if action == "SET_DENSITY":
        pct = float(payload.get("densityPct", 62))
        model.set_density(pct)
        traffic.set_density(pct)
        print(f"[cmd] 车流密度调整为 {pct}%")
    elif action == "INJECT_OVERLIMIT":
        model.trigger_overlimit()
        print("[cmd] 注入 3 次超限样本")
    elif action == "REPLAY":
        print("[cmd] 动画重播指令（由前端 anim/bridge/command 处理）")


def main() -> None:
    parser = argparse.ArgumentParser(description="滨江大桥数字孪生智控平台 · 交通仿真器")
    parser.add_argument("--dry-run", action="store_true", help="不连接 MQTT，打印报文到控制台")
    parser.add_argument("--density", type=float, default=float(os.getenv("SIM_DENSITY", "62")))
    parser.add_argument("--duration", type=int, default=int(os.getenv("SIM_DURATION", "0")),
                        help="运行秒数，0 表示持续运行")
    args = parser.parse_args()

    pub = MqttPublisher(dry_run=args.dry_run)
    pub.connect()
    model = BridgeResponseModel()
    model.set_density(args.density)
    traffic = TrafficSimulator(pub, BRIDGE_CODE, density=args.density)
    shm = ShmSimulator(pub, BRIDGE_CODE, model)
    pub.subscribe("sim/bridge/command",
                  lambda topic, payload: on_command(topic, payload, model, traffic))

    print(f"[sim] 启动：bridge={BRIDGE_CODE} density={args.density}% "
          f"simpy={'on' if has_simpy() else 'fallback'}")
    start = time.time()
    tick = 0
    try:
        while True:
            elapsed = time.time() - start
            if args.duration and elapsed >= args.duration:
                break
            stat = traffic.tick()
            if tick % 2 == 0:
                count = shm.tick(elapsed, stat)
                print(f"[sim] t={elapsed:6.1f}s 车辆={stat['vehicleCount']:2d} 测点={count}")
            tick += 1
            time.sleep(1)
    except KeyboardInterrupt:
        print("[sim] 已停止")
    finally:
        pub.close()


def has_simpy() -> bool:
    try:
        import simpy  # noqa: F401
        return True
    except ImportError:
        return False


if __name__ == "__main__":
    main()
