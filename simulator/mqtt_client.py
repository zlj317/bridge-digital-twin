"""MQTT 发布/订阅封装（文档 7.9 主题）。
未安装 paho-mqtt 或指定 --dry-run 时自动切换为控制台打印模式，便于本机验证报文。"""
from __future__ import annotations

import json
import os
import threading
from typing import Any, Callable

try:
    import paho.mqtt.client as mqtt
    HAS_PAHO = True
except ImportError:  # pragma: no cover - 无依赖时的降级
    mqtt = None
    HAS_PAHO = False


class MqttPublisher:
    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        client_id: str = "bdt-simulator",
        dry_run: bool = False,
    ) -> None:
        self.host = host or os.getenv("MQTT_HOST", "localhost")
        self.port = port or int(os.getenv("MQTT_PORT", "1883"))
        self.client_id = client_id
        self.dry_run = dry_run or not HAS_PAHO
        self.client: Any = None
        self._handlers: dict[str, Callable[[str, dict], None]] = {}
        self._lock = threading.Lock()

    def connect(self) -> None:
        if self.dry_run:
            print(f"[mqtt] dry-run 模式，报文将打印到控制台（目标 {self.host}:{self.port}）")
            return
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=self.client_id)
        self.client.on_message = self._on_message
        self.client.connect(self.host, self.port, keepalive=60)
        self.client.loop_start()
        print(f"[mqtt] 已连接 {self.host}:{self.port}")

    def subscribe(self, topic: str, handler: Callable[[str, dict], None]) -> None:
        self._handlers[topic] = handler
        if self.client is not None:
            self.client.subscribe(topic, qos=1)

    def _on_message(self, _client: Any, _userdata: Any, msg: Any) -> None:
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            for topic, handler in self._handlers.items():
                if _topic_match(topic, msg.topic):
                    handler(msg.topic, payload)
        except (ValueError, UnicodeDecodeError):
            pass

    def publish(self, topic: str, payload: dict, qos: int = 0) -> None:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if self.dry_run:
            preview = data[:180] + ("…" if len(data) > 180 else "")
            print(f"[mqtt] {topic} <- {preview}")
            return
        with self._lock:
            self.client.publish(topic, data, qos=qos)

    def close(self) -> None:
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()


def _topic_match(pattern: str, topic: str) -> bool:
    if pattern == topic:
        return True
    if "+" in pattern:
        p, t = pattern.split("/"), topic.split("/")
        return len(p) == len(t) and all(a == b or a == "+" for a, b in zip(p, t))
    return False
